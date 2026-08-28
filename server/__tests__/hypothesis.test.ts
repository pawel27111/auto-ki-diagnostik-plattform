import { describe, expect, it } from "vitest";
import { buildBaseline, cellKey, detectAnomaly } from "../core/baseline";
import {
  CONCLUSIVE_ENTROPY_BITS,
  ObservationSet,
  evaluateFamily,
  suggestNextMeasurements,
  vanosFamily,
  type Observation,
} from "../core/hypothesis";
import type {
  OperatingCondition,
  Trace,
  VehicleSignalSample,
} from "../core/vehicleState";

function observation(
  signal: string,
  condition: OperatingCondition,
  verdict: Observation["verdict"],
  zScore: number,
  value = 0
): Observation {
  return { signal, condition, verdict, zScore, value, unit: "" };
}

/** The measurements a full VANOS work-up would collect. */
function workup(
  overrides: Partial<Record<string, Observation>> = {}
): ObservationSet {
  const base: Record<string, Observation> = {
    exWarm: observation(
      "DME:VANOS_EX_SETTLE_MS",
      "idle_warm",
      "normal",
      0.5,
      140
    ),
    exCold: observation(
      "DME:VANOS_EX_SETTLE_MS",
      "cold_start",
      "normal",
      0.5,
      150
    ),
    inWarm: observation(
      "DME:VANOS_IN_SETTLE_MS",
      "idle_warm",
      "normal",
      0.3,
      130
    ),
    actual: observation("DME:VANOS_EX_ACTUAL", "idle_warm", "normal", 0.5, 4.8),
    target: observation("DME:VANOS_EX_TARGET", "idle_warm", "normal", 0.1, 5.0),
    oil: observation("DME:OIL_TEMP", "idle_warm", "normal", 0.2, 95),
    ...overrides,
  };
  return new ObservationSet(Object.values(base));
}

describe("evaluateFamily", () => {
  it("stays at the priors when nothing has been measured", () => {
    const result = evaluateFamily(vanosFamily, new ObservationSet());

    for (const hypothesis of result.hypotheses) {
      expect(hypothesis.probability).toBeCloseTo(hypothesis.prior, 5);
    }
    expect(result.missingData).toHaveLength(vanosFamily.rules.length);
  });

  it("refuses to call an undecided result a diagnosis", () => {
    const result = evaluateFamily(vanosFamily, new ObservationSet());
    expect(result.conclusive).toBe(false);
    expect(result.entropyBits).toBeGreaterThan(CONCLUSIVE_ENTROPY_BITS);
  });

  it("remains undecided on the trigger symptom alone", () => {
    // Elevated settling time is consistent with three different causes, so a
    // single reading must not produce an answer.
    const result = evaluateFamily(
      vanosFamily,
      new ObservationSet([
        observation(
          "DME:VANOS_EX_SETTLE_MS",
          "idle_warm",
          "anomalous",
          6.2,
          310
        ),
      ])
    );

    expect(result.conclusive).toBe(false);
    expect(result.hypotheses[0].probability).toBeLessThan(0.5);
  });

  it("produces probabilities that sum to one", () => {
    const total = evaluateFamily(vanosFamily, workup()).hypotheses.reduce(
      (sum, hypothesis) => sum + hypothesis.probability,
      0
    );
    expect(total).toBeCloseTo(1, 6);
  });

  it("is deterministic — the same observations give the same ranking", () => {
    const first = evaluateFamily(vanosFamily, workup());
    const second = evaluateFamily(vanosFamily, workup());
    expect(second.hypotheses).toEqual(first.hypotheses);
  });

  describe("discriminates the fault signatures", () => {
    it("identifies mechanical wear: worse hot, one cam, sensor plausible", () => {
      const result = evaluateFamily(
        vanosFamily,
        workup({
          exWarm: observation(
            "DME:VANOS_EX_SETTLE_MS",
            "idle_warm",
            "anomalous",
            7,
            310
          ),
          exCold: observation(
            "DME:VANOS_EX_SETTLE_MS",
            "cold_start",
            "normal",
            1,
            150
          ),
        })
      );
      expect(result.hypotheses[0].id).toBe("mechanical_wear");
    });

    it("identifies an oil supply problem: both cams affected", () => {
      const result = evaluateFamily(
        vanosFamily,
        workup({
          exWarm: observation(
            "DME:VANOS_EX_SETTLE_MS",
            "idle_warm",
            "anomalous",
            6.5,
            300
          ),
          exCold: observation(
            "DME:VANOS_EX_SETTLE_MS",
            "cold_start",
            "normal",
            0.8,
            150
          ),
          inWarm: observation(
            "DME:VANOS_IN_SETTLE_MS",
            "idle_warm",
            "anomalous",
            5.8,
            290
          ),
        })
      );
      expect(result.hypotheses[0].id).toBe("oil_supply");
    });

    it("identifies a sticking solenoid: worst cold, improving warm", () => {
      const result = evaluateFamily(
        vanosFamily,
        workup({
          exWarm: observation(
            "DME:VANOS_EX_SETTLE_MS",
            "idle_warm",
            "elevated",
            3.2,
            190
          ),
          exCold: observation(
            "DME:VANOS_EX_SETTLE_MS",
            "cold_start",
            "anomalous",
            8,
            380
          ),
        })
      );
      expect(result.hypotheses[0].id).toBe("solenoid");
      expect(result.conclusive).toBe(true);
    });

    it("identifies a sensor fault: implausible reported position", () => {
      const result = evaluateFamily(
        vanosFamily,
        workup({
          actual: observation(
            "DME:VANOS_EX_ACTUAL",
            "idle_warm",
            "anomalous",
            9,
            48
          ),
        })
      );
      expect(result.hypotheses[0].id).toBe("sensor");
    });
  });

  it("records evidence against a hypothesis, not only for it", () => {
    // Searching only for confirmation is how a plausible first guess becomes an
    // expensive wrong repair.
    const result = evaluateFamily(
      vanosFamily,
      workup({
        exWarm: observation(
          "DME:VANOS_EX_SETTLE_MS",
          "idle_warm",
          "anomalous",
          7,
          310
        ),
        exCold: observation(
          "DME:VANOS_EX_SETTLE_MS",
          "cold_start",
          "normal",
          1,
          150
        ),
      })
    );

    const withOpposing = result.hypotheses.filter(h => h.opposing.length > 0);
    expect(withOpposing.length).toBeGreaterThan(0);
    for (const hypothesis of result.hypotheses) {
      for (const entry of hypothesis.opposing)
        expect(entry.likelihoodRatio).toBeLessThan(1);
      for (const entry of hypothesis.supporting)
        expect(entry.likelihoodRatio).toBeGreaterThanOrEqual(1);
    }
  });

  it("treats a measurement without a baseline as unmeasured", () => {
    // "Measured but not comparable" must not read as "measured and normal",
    // which would make a hypothesis look ruled out when it is not.
    const set = new ObservationSet([
      observation(
        "DME:VANOS_EX_SETTLE_MS",
        "idle_warm",
        "insufficient_data",
        0,
        140
      ),
    ]);

    expect(set.get("DME:VANOS_EX_SETTLE_MS", "idle_warm")).toBeUndefined();
    const result = evaluateFamily(vanosFamily, set);
    expect(
      result.missingData.some(m => m.ruleId === "settling_time_elevated")
    ).toBe(true);
  });

  it("discounts a measurement taken before the oil was up to temperature", () => {
    // Below operating temperature a slow VANOS response is expected, so a short
    // test drive must not read as wear.
    const cold = evaluateFamily(
      vanosFamily,
      workup({
        exWarm: observation(
          "DME:VANOS_EX_SETTLE_MS",
          "idle_warm",
          "anomalous",
          7,
          310
        ),
        exCold: observation(
          "DME:VANOS_EX_SETTLE_MS",
          "cold_start",
          "normal",
          1,
          150
        ),
        oil: observation("DME:OIL_TEMP", "idle_warm", "normal", 0.2, 62),
      })
    );
    const hot = evaluateFamily(
      vanosFamily,
      workup({
        exWarm: observation(
          "DME:VANOS_EX_SETTLE_MS",
          "idle_warm",
          "anomalous",
          7,
          310
        ),
        exCold: observation(
          "DME:VANOS_EX_SETTLE_MS",
          "cold_start",
          "normal",
          1,
          150
        ),
      })
    );

    const wearWhenCold = cold.hypotheses.find(
      h => h.id === "mechanical_wear"
    )!.probability;
    const wearWhenHot = hot.hypotheses.find(
      h => h.id === "mechanical_wear"
    )!.probability;
    expect(wearWhenCold).toBeLessThan(wearWhenHot);
  });

  it("lists the measurements each blocked rule is waiting on", () => {
    const result = evaluateFamily(
      vanosFamily,
      new ObservationSet([
        observation("DME:VANOS_EX_SETTLE_MS", "idle_warm", "anomalous", 6, 300),
      ])
    );

    const blocked = result.missingData.find(
      m => m.ruleId === "both_cams_affected"
    );
    expect(blocked?.measurements[0].signal).toBe("DME:VANOS_IN_SETTLE_MS");
  });
});

describe("suggestNextMeasurements", () => {
  it("recommends a measurement that has not been taken yet", () => {
    const set = new ObservationSet([
      observation("DME:VANOS_EX_SETTLE_MS", "idle_warm", "anomalous", 6, 300),
    ]);
    const suggestions = suggestNextMeasurements(vanosFamily, set);

    expect(suggestions.length).toBeGreaterThan(0);
    for (const suggestion of suggestions) {
      expect(
        set.has(suggestion.measurement.signal, suggestion.measurement.condition)
      ).toBe(false);
    }
  });

  it("ranks the intake cam highest, because it separates the most hypotheses", () => {
    // Whether both cams are affected splits the family cleanly into shared-cause
    // and single-actuator branches, which no other single reading does.
    const set = new ObservationSet([
      observation("DME:VANOS_EX_SETTLE_MS", "idle_warm", "anomalous", 6, 300),
    ]);
    const suggestions = suggestNextMeasurements(vanosFamily, set);

    expect(suggestions[0].measurement.signal).toBe("DME:VANOS_IN_SETTLE_MS");
  });

  it("orders suggestions by expected information gain", () => {
    const suggestions = suggestNextMeasurements(
      vanosFamily,
      new ObservationSet(),
      { limit: 5 }
    );
    for (let i = 1; i < suggestions.length; i++) {
      expect(
        suggestions[i - 1].expectedInformationGainBits
      ).toBeGreaterThanOrEqual(suggestions[i].expectedInformationGainBits);
    }
  });

  it("has nothing left to suggest once every rule has its data", () => {
    expect(suggestNextMeasurements(vanosFamily, workup())).toHaveLength(0);
  });

  it("says which rules a suggested measurement would unblock", () => {
    const suggestions = suggestNextMeasurements(
      vanosFamily,
      new ObservationSet()
    );
    expect(suggestions[0].unblocksRules.length).toBeGreaterThan(0);
  });
});

describe("baseline to hypothesis pipeline", () => {
  /** A baseline built from readings that hold steady around `value`. */
  function baselineAt(signal: string, value: number, spread: number): Trace {
    const samples: VehicleSignalSample[] = Array.from(
      { length: 60 },
      (_, i) => ({
        vin: "WBAPIPE00000000001",
        sessionId: `s${Math.floor(i / 30)}`,
        seq: i,
        sweep: i,
        acquiredAt: i * 1000,
        ecu: "DME",
        request: "SYN",
        signal,
        name: signal,
        raw: null,
        // Alternating either side of the centre gives a defined, small spread.
        value: value + (i % 2 === 0 ? spread : -spread),
        unit: "ms",
        signalSchemaVersion: "v1",
        condition: "idle_warm" as const,
        context: { rpm: 800, coolantTemp: 90, load: 20, throttle: 3 },
        source: "live" as const,
      })
    );

    return {
      header: {
        kind: "trace-header",
        formatVersion: 1,
        vin: "WBAPIPE00000000001",
        sessionId: "s0",
        startedAt: 0,
        source: "live",
      },
      samples,
    };
  }

  it("turns a reading far from its own baseline into an anomaly the engine can use", () => {
    const baseline = buildBaseline("WBAPIPE00000000001", [
      baselineAt("VANOS_EX_SETTLE_MS", 140, 3),
    ]);
    expect(
      baseline.cells.get(cellKey("DME", "VANOS_EX_SETTLE_MS", "idle_warm"))
        ?.sufficient
    ).toBe(true);

    const anomaly = detectAnomaly(baseline, {
      ecu: "DME",
      signal: "VANOS_EX_SETTLE_MS",
      condition: "idle_warm",
      value: 310,
      unit: "ms",
    });

    expect(anomaly.verdict).toBe("anomalous");
    expect(anomaly.explanation).toContain("this vehicle's own baseline");

    const result = evaluateFamily(
      vanosFamily,
      new ObservationSet([
        {
          signal: `DME:${anomaly.signal.split(":")[1]}`,
          condition: anomaly.condition,
          verdict: anomaly.verdict,
          zScore: anomaly.zScore,
          value: anomaly.observed,
          unit: anomaly.unit,
        },
      ])
    );

    expect(result.hypotheses[0].supporting.length).toBeGreaterThan(0);
  });

  it("reports insufficient data instead of a verdict while the baseline is thin", () => {
    const thin = buildBaseline("WBAPIPE00000000001", [
      {
        ...baselineAt("VANOS_EX_SETTLE_MS", 140, 3),
        samples: baselineAt("VANOS_EX_SETTLE_MS", 140, 3).samples.slice(0, 10),
      },
    ]);

    const anomaly = detectAnomaly(thin, {
      ecu: "DME",
      signal: "VANOS_EX_SETTLE_MS",
      condition: "idle_warm",
      value: 310,
      unit: "ms",
    });

    expect(anomaly.verdict).toBe("insufficient_data");
    expect(anomaly.zScore).toBeNull();
    expect(anomaly.explanation).toMatch(/baseline samples/);
  });

  it("calls a reading normal when it sits inside this vehicle's own range", () => {
    const baseline = buildBaseline("WBAPIPE00000000001", [
      baselineAt("VANOS_EX_SETTLE_MS", 140, 3),
    ]);
    const anomaly = detectAnomaly(baseline, {
      ecu: "DME",
      signal: "VANOS_EX_SETTLE_MS",
      condition: "idle_warm",
      value: 141,
      unit: "ms",
    });

    expect(anomaly.verdict).toBe("normal");
  });
});
