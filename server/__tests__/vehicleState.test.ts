import { describe, expect, it } from "vitest";
import {
  CONDITION_THRESHOLDS,
  DEFAULT_MAX_CORRELATION_SKEW_MS,
  classifyCondition,
  groupBySweep,
  isCorrelatable,
  latestBySignal,
  parseTrace,
  reclassifyTrace,
  serializeTrace,
  sweepSkewMs,
  TraceFormatError,
  type Trace,
  type VehicleSignalSample,
} from "../core/vehicleState";

function sample(
  overrides: Partial<VehicleSignalSample> = {}
): VehicleSignalSample {
  return {
    vin: "WBATEST0000000001",
    sessionId: "s1",
    seq: 0,
    sweep: 0,
    acquiredAt: 1_700_000_000_000,
    ecu: "DME",
    request: "01 0C",
    signal: "RPM",
    name: "Engine Speed",
    raw: "1AF8",
    value: 1726,
    unit: "rpm",
    signalSchemaVersion: "v1",
    condition: "idle_warm",
    context: { rpm: 800, coolantTemp: 90, load: 22, throttle: 3 },
    source: "live",
    ...overrides,
  };
}

describe("classifyCondition", () => {
  it("recognises a cold start only inside the start window", () => {
    const cold = {
      coolantTemp: 25,
      rpm: 1200,
      load: 25,
      throttle: 4,
      secondsSinceStart: 20,
    };
    expect(classifyCondition(cold)).toBe("cold_start");

    // Same temperature much later is a car that never warmed up, not a start.
    expect(classifyCondition({ ...cold, secondsSinceStart: 600 })).toBe(
      "warmup"
    );
  });

  it("separates warm idle from part and high load", () => {
    const warm = { coolantTemp: 90, throttle: 3 };
    expect(classifyCondition({ ...warm, rpm: 800, load: 22 })).toBe(
      "idle_warm"
    );
    expect(
      classifyCondition({ ...warm, rpm: 2200, load: 50, throttle: 25 })
    ).toBe("part_load");
    expect(
      classifyCondition({ ...warm, rpm: 3400, load: 85, throttle: 70 })
    ).toBe("high_load");
  });

  it("treats a closed throttle at raised rpm as overrun, not idle", () => {
    // Fuel is cut here, so mixture signals mean something different — this must
    // not be folded into the idle population.
    expect(
      classifyCondition({ coolantTemp: 90, rpm: 2200, load: 8, throttle: 0 })
    ).toBe("deceleration");
  });

  it("returns unknown rather than guessing when context is incomplete", () => {
    expect(classifyCondition({})).toBe("unknown");
    expect(classifyCondition({ coolantTemp: 90 })).toBe("unknown");
    expect(classifyCondition({ coolantTemp: 90, rpm: 2000 })).toBe("unknown");
  });

  it("uses the documented thresholds", () => {
    const justWarm = CONDITION_THRESHOLDS.warmCoolantTemp;
    expect(
      classifyCondition({ coolantTemp: justWarm - 1, rpm: 800, load: 20 })
    ).toBe("warmup");
    expect(
      classifyCondition({
        coolantTemp: justWarm,
        rpm: 800,
        load: 20,
        throttle: 3,
      })
    ).toBe("idle_warm");
  });
});

describe("sweep skew", () => {
  it("reports zero skew for readings taken together", () => {
    const samples = [
      sample(),
      sample({ signal: "MAF", acquiredAt: 1_700_000_000_000 }),
    ];
    expect(sweepSkewMs(samples)).toBe(0);
    expect(isCorrelatable(samples)).toBe(true);
  });

  it("refuses to correlate readings spread beyond the limit", () => {
    const spread = DEFAULT_MAX_CORRELATION_SKEW_MS + 1;
    const samples = [
      sample(),
      sample({ signal: "MAF", acquiredAt: 1_700_000_000_000 + spread }),
    ];
    expect(sweepSkewMs(samples)).toBe(spread);
    expect(isCorrelatable(samples)).toBe(false);
  });

  it("treats a single reading as trivially correlatable", () => {
    expect(sweepSkewMs([sample()])).toBe(0);
    expect(isCorrelatable([sample()])).toBe(true);
  });

  it("groups samples by sweep", () => {
    const samples = [
      sample({ sweep: 0, signal: "RPM" }),
      sample({ sweep: 0, signal: "MAF" }),
      sample({ sweep: 1, signal: "RPM" }),
    ];
    const sweeps = groupBySweep(samples);
    expect(sweeps.get(0)).toHaveLength(2);
    expect(sweeps.get(1)).toHaveLength(1);
  });
});

describe("latestBySignal", () => {
  it("keeps the newest reading per signal", () => {
    const latest = latestBySignal([
      sample({ signal: "RPM", value: 800, acquiredAt: 1000 }),
      sample({ signal: "RPM", value: 900, acquiredAt: 2000 }),
      sample({ signal: "MAF", value: 4, acquiredAt: 1500 }),
    ]);
    expect(latest.get("DME:RPM")?.value).toBe(900);
    expect(latest.get("DME:MAF")?.value).toBe(4);
  });
});

describe("trace serialisation", () => {
  const trace: Trace = {
    header: {
      kind: "trace-header",
      formatVersion: 1,
      vin: "WBATEST0000000001",
      sessionId: "s1",
      startedAt: 1_700_000_000_000,
      source: "live",
    },
    samples: [
      sample(),
      sample({ seq: 1, signal: "MAF", value: 4.2, unit: "g/s" }),
    ],
  };

  it("round-trips through JSONL", () => {
    const { trace: parsed, skipped } = parseTrace(serializeTrace(trace));
    expect(skipped).toHaveLength(0);
    expect(parsed.header).toEqual(trace.header);
    expect(parsed.samples).toEqual(trace.samples);
  });

  it("writes one line per sample so a recording can be appended to", () => {
    const lines = serializeTrace(trace).trim().split("\n");
    expect(lines).toHaveLength(1 + trace.samples.length);
  });

  it("rejects a malformed header outright", () => {
    expect(() => parseTrace("not json\n")).toThrow(TraceFormatError);
    expect(() => parseTrace('{"kind":"wrong"}\n')).toThrow(TraceFormatError);
  });

  it("fails on a bad sample line by default", () => {
    const text = serializeTrace(trace) + '{"vin":"x"}\n';
    expect(() => parseTrace(text)).toThrow(TraceFormatError);
  });

  it("salvages the rest of a recording in lenient mode and reports what it dropped", () => {
    // A session that lost power mid-write should not cost every earlier reading.
    const text = serializeTrace(trace) + "{ broken\n";
    const { trace: parsed, skipped } = parseTrace(text, { lenient: true });
    expect(parsed.samples).toHaveLength(2);
    expect(skipped).toEqual([{ line: 4, reason: "not valid JSON" }]);
  });
});

describe("reclassifyTrace", () => {
  it("re-derives conditions from the stored context", () => {
    // Each sample carries its own context precisely so that changing the
    // bucketing rules does not invalidate historical recordings.
    const mislabelled: Trace = {
      header: {
        kind: "trace-header",
        formatVersion: 1,
        vin: "WBATEST0000000001",
        sessionId: "s1",
        startedAt: 0,
        source: "live",
      },
      samples: [
        sample({
          condition: "high_load",
          context: { rpm: 800, coolantTemp: 90, load: 20, throttle: 3 },
        }),
      ],
    };

    expect(reclassifyTrace(mislabelled).samples[0].condition).toBe("idle_warm");
  });
});
