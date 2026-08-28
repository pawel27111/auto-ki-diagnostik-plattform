import { describe, expect, it } from "vitest";
import {
  ANOMALY_THRESHOLDS,
  MIN_SAMPLES_FOR_BASELINE,
  aggregateSession,
  buildBaseline,
  cellKey,
  detectAllTrends,
  detectTrend,
} from "../core/baseline";
import {
  generateHistory,
  mafDriftFault,
  suddenSensorFailure,
  vacuumLeakFault,
  vanosWearFault,
} from "../core/syntheticTrace";
import type { Trace, VehicleSignalSample } from "../core/vehicleState";

const VIN = "WBABASE0000000001";

/** Synthetic traces relabelled as live, so baseline construction accepts them. */
function asLive(traces: Trace[]): Trace[] {
  return traces.map(trace => ({
    header: { ...trace.header, source: "live" as const },
    samples: trace.samples.map(sample => ({
      ...sample,
      source: "live" as const,
    })),
  }));
}

function reading(
  overrides: Partial<VehicleSignalSample> = {}
): VehicleSignalSample {
  return {
    vin: VIN,
    sessionId: "s1",
    seq: 0,
    sweep: 0,
    acquiredAt: 0,
    ecu: "DME",
    request: "SYN",
    signal: "VANOS_EX_SETTLE_MS",
    name: "settle",
    raw: null,
    value: 137,
    unit: "ms",
    signalSchemaVersion: "v1",
    condition: "idle_warm",
    context: { rpm: 800, coolantTemp: 90, load: 20, throttle: 3 },
    source: "live",
    ...overrides,
  };
}

function traceOf(
  samples: VehicleSignalSample[],
  source: "live" | "synthetic" = "live"
): Trace {
  return {
    header: {
      kind: "trace-header",
      formatVersion: 1,
      vin: VIN,
      sessionId: samples[0]?.sessionId ?? "s1",
      startedAt: 0,
      source,
    },
    samples,
  };
}

describe("buildBaseline", () => {
  it("refuses synthetic data by default", () => {
    // A baseline is a claim about a physical vehicle. Generated data would make
    // that claim false while still looking well populated.
    const synthetic = generateHistory({
      vin: VIN,
      sessionCount: 3,
      onsetSessionIndex: null,
    });
    const baseline = buildBaseline(VIN, synthetic);

    expect(baseline.cells.size).toBe(0);
    expect(baseline.rejected.some(r => r.reason.includes("not live"))).toBe(
      true
    );
  });

  it("accepts non-live data only when explicitly allowed", () => {
    const synthetic = generateHistory({
      vin: VIN,
      sessionCount: 3,
      onsetSessionIndex: null,
    });
    const baseline = buildBaseline(VIN, synthetic, {
      allowNonLiveSources: true,
    });

    expect(baseline.cells.size).toBeGreaterThan(0);
  });

  it("ignores traces belonging to another vehicle", () => {
    const other = asLive(
      generateHistory({
        vin: "WBAOTHER000000001",
        sessionCount: 2,
        onsetSessionIndex: null,
      })
    );
    const baseline = buildBaseline(VIN, other);

    expect(baseline.cells.size).toBe(0);
    expect(
      baseline.rejected.some(r => r.reason.includes("different VIN"))
    ).toBe(true);
  });

  it("drops unclassifiable readings instead of folding them into a bucket", () => {
    const samples = Array.from({ length: 5 }, (_, i) =>
      reading({ seq: i, condition: "unknown", context: {} })
    );
    const baseline = buildBaseline(VIN, [traceOf(samples)]);

    expect(baseline.cells.size).toBe(0);
    expect(baseline.rejected).toContainEqual({
      reason: "operating condition unknown",
      count: 5,
    });
  });

  it("marks a thin cell insufficient rather than reporting a confident number", () => {
    const samples = Array.from(
      { length: MIN_SAMPLES_FOR_BASELINE - 1 },
      (_, i) => reading({ seq: i, value: 137 + i * 0.1 })
    );
    const baseline = buildBaseline(VIN, [traceOf(samples)]);
    const cell = baseline.cells.get(
      cellKey("DME", "VANOS_EX_SETTLE_MS", "idle_warm")
    );

    expect(cell?.count).toBe(MIN_SAMPLES_FOR_BASELINE - 1);
    expect(cell?.sufficient).toBe(false);
  });

  it("computes robust statistics that survive an outlier", () => {
    const values = Array.from({ length: 40 }, () => 100);
    values[0] = 100_000; // one absurd reading
    const samples = values.map((value, i) => reading({ seq: i, value }));
    const cell = buildBaseline(VIN, [traceOf(samples)]).cells.get(
      cellKey("DME", "VANOS_EX_SETTLE_MS", "idle_warm")
    );

    // The mean is dragged far away; the median is not.
    expect(cell!.mean).toBeGreaterThan(2000);
    expect(cell!.median).toBe(100);
  });

  it("records how many sessions fed a cell", () => {
    const samples = [
      ...Array.from({ length: 20 }, (_, i) =>
        reading({ seq: i, sessionId: "a" })
      ),
      ...Array.from({ length: 20 }, (_, i) =>
        reading({ seq: i, sessionId: "b" })
      ),
    ];
    const cell = buildBaseline(VIN, [traceOf(samples)]).cells.get(
      cellKey("DME", "VANOS_EX_SETTLE_MS", "idle_warm")
    );

    expect(cell?.sessionCount).toBe(2);
  });

  it("surfaces a cell that mixes scaling contracts", () => {
    // Two schema versions in one cell means the values are not comparable and
    // the baseline is quietly wrong.
    const samples = [
      ...Array.from({ length: 20 }, (_, i) =>
        reading({ seq: i, signalSchemaVersion: "v1" })
      ),
      ...Array.from({ length: 20 }, (_, i) =>
        reading({ seq: i, signalSchemaVersion: "v2" })
      ),
    ];
    const cell = buildBaseline(VIN, [traceOf(samples)]).cells.get(
      cellKey("DME", "VANOS_EX_SETTLE_MS", "idle_warm")
    );

    expect(cell?.schemaVersions.sort()).toEqual(["v1", "v2"]);
  });
});

describe("trend detection against known ground truth", () => {
  const SESSIONS = 14;
  const ONSET = 6;
  const DETECTION_WINDOW = 3;

  const faults = [
    { name: "VANOS wear", fault: vanosWearFault, seed: 11, abrupt: false },
    { name: "MAF drift", fault: mafDriftFault, seed: 22, abrupt: false },
    { name: "vacuum leak", fault: vacuumLeakFault, seed: 33, abrupt: false },
    {
      name: "sudden O2 failure",
      fault: suddenSensorFailure,
      seed: 44,
      abrupt: true,
    },
  ];

  it.each(faults)(
    "locates the onset of $name within the detection window",
    ({ fault, seed, abrupt }) => {
      const traces = generateHistory({
        vin: VIN,
        sessionCount: SESSIONS,
        onsetSessionIndex: ONSET,
        fault,
        seed,
        abrupt,
      });
      const trends = detectAllTrends(
        traces.map((trace, index) => aggregateSession(trace, index))
      );

      expect(trends.length).toBeGreaterThan(0);

      const onsets = trends
        .map(t => t.onsetSessionIndex)
        .filter((v): v is number => v !== null);
      const earliest = Math.min(...onsets);
      expect(Math.abs(earliest - ONSET)).toBeLessThanOrEqual(DETECTION_WINDOW);
    }
  );

  it.each(faults)(
    "names a signal the $name fault actually affects",
    ({ fault, seed, abrupt }) => {
      const traces = generateHistory({
        vin: VIN,
        sessionCount: SESSIONS,
        onsetSessionIndex: ONSET,
        fault,
        seed,
        abrupt,
      });
      const trends = detectAllTrends(
        traces.map((trace, index) => aggregateSession(trace, index))
      );

      // The strongest finding must point at a signal the fault model touches,
      // not at some incidental correlate.
      const strongest = trends[0].key.split("|")[0];
      const affected = new Set(
        traces[0].header.groundTruth?.affectedSignals ?? []
      );
      const plausible =
        affected.has(strongest) ||
        // Fuel trims are the DME's response to MAF and air leaks, so they count.
        strongest.includes("FT_B1");
      expect(plausible).toBe(true);
    }
  );

  it("reports nothing on healthy histories", () => {
    // False positives are the expensive failure here: a mechanic pulls a good
    // part. Measured across many seeds rather than asserted on one.
    let falsePositives = 0;
    const TRIALS = 40;

    for (let seed = 100; seed < 100 + TRIALS; seed++) {
      const traces = generateHistory({
        vin: VIN,
        sessionCount: SESSIONS,
        onsetSessionIndex: null,
        seed,
      });
      const trends = detectAllTrends(
        traces.map((trace, index) => aggregateSession(trace, index))
      );
      if (trends.length > 0) falsePositives++;
    }

    expect(falsePositives).toBe(0);
  });

  it("excludes the condition-defining signals, which would otherwise raise false findings", () => {
    // Throttle position near zero is what *defines* the deceleration bucket, so
    // its session median there is a property of where the bucket boundaries
    // fell, not of the vehicle's health. This seed is one where that circularity
    // produces a clean-looking but meaningless finding.
    const traces = generateHistory({
      vin: VIN,
      sessionCount: SESSIONS,
      onsetSessionIndex: null,
      seed: 226,
    });
    const aggregates = traces.map((trace, index) =>
      aggregateSession(trace, index)
    );

    // Without the exclusion this healthy history yields a spurious trend.
    const unfiltered = detectAllTrends(aggregates, { contextSignals: [] });
    expect(unfiltered.some(t => t.key.includes("THROTTLE"))).toBe(true);

    // With it, the same history is correctly reported as unremarkable.
    expect(detectAllTrends(aggregates)).toHaveLength(0);
  });

  it("still computes raw statistics for context signals when asked directly", () => {
    // The exclusion applies to reported findings, not to the underlying maths —
    // a caller investigating a cooling fault still needs the numbers.
    const traces = generateHistory({
      vin: VIN,
      sessionCount: SESSIONS,
      onsetSessionIndex: null,
      seed: 7,
    });
    const aggregates = traces.map((trace, index) =>
      aggregateSession(trace, index)
    );

    expect(detectTrend(aggregates, "DME:COOLANT_TEMP|warmup")).not.toBeNull();
  });

  it("declines to judge a history that is too short", () => {
    const traces = generateHistory({
      vin: VIN,
      sessionCount: 3,
      onsetSessionIndex: 1,
      fault: vanosWearFault,
    });
    const aggregates = traces.map((trace, index) =>
      aggregateSession(trace, index)
    );

    expect(
      detectTrend(aggregates, "DME:VANOS_EX_SETTLE_MS|idle_warm")
    ).toBeNull();
  });

  it("ranks by spread-relative change, which works for signals centred at zero", () => {
    // Short term fuel trim oscillates around zero when healthy, so a ratio
    // against it explodes: a move from 0.05 to 15 is "+29900%". That number
    // cannot be thresholded or compared against a temperature drift, so
    // magnitude decisions use the signal's own spread instead.
    const traces = generateHistory({
      vin: VIN,
      sessionCount: SESSIONS,
      onsetSessionIndex: ONSET,
      fault: vacuumLeakFault,
      seed: 33,
    });
    const trends = detectAllTrends(
      traces.map((trace, index) => aggregateSession(trace, index))
    );

    const shortTermTrim = trends.find(t => t.key.includes("STFT_B1"));
    expect(shortTermTrim).toBeDefined();
    expect(Math.abs(shortTermTrim!.changeInReferenceSigmas)).toBeGreaterThan(6);
    // Reference sits within noise of zero, so no percentage is offered.
    expect(shortTermTrim!.totalChangePercent).toBeNull();
    expect(Number.isFinite(shortTermTrim!.totalChangeAbsolute)).toBe(true);

    // Long term trim sits at a small but non-zero value, so a ratio there is
    // still meaningful and is reported for display.
    const longTermTrim = trends.find(t => t.key.includes("LTFT_B1"));
    expect(longTermTrim).toBeDefined();
    expect(longTermTrim!.totalChangePercent).not.toBeNull();

    // Ranking is by sigmas, never by the percentage.
    for (let i = 1; i < trends.length; i++) {
      expect(
        Math.abs(trends[i - 1].changeInReferenceSigmas)
      ).toBeGreaterThanOrEqual(Math.abs(trends[i].changeInReferenceSigmas));
    }
  });
});

describe("aggregateSession", () => {
  it("reduces a session to one robust value per signal and condition", () => {
    // Readings inside a session are heavily autocorrelated; treating them as
    // independent observations would inflate trend confidence enormously.
    const trace = generateHistory({
      vin: VIN,
      sessionCount: 1,
      onsetSessionIndex: null,
    })[0];
    const aggregate = aggregateSession(trace, 0);

    expect(aggregate.medians.size).toBeGreaterThan(0);
    expect(aggregate.medians.size).toBeLessThan(trace.samples.length);
    expect(aggregate.sessionIndex).toBe(0);
  });

  it("skips unclassifiable readings", () => {
    const trace = traceOf([reading({ condition: "unknown", context: {} })]);
    expect(aggregateSession(trace, 0).medians.size).toBe(0);
  });
});

describe("anomaly thresholds", () => {
  it("keeps the elevated threshold below the anomalous one", () => {
    expect(ANOMALY_THRESHOLDS.elevated).toBeLessThan(
      ANOMALY_THRESHOLDS.anomalous
    );
  });
});
