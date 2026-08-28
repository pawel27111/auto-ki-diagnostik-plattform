import type { AnomalyVerdict } from "./baseline";
import type { OperatingCondition } from "./vehicleState";

/**
 * Hypothesis engine.
 *
 * Turns observations into a ranked set of candidate causes, with the evidence
 * for and against each one and an explicit list of what is still unknown.
 *
 * Three properties are non-negotiable here, because they are what separates
 * this from a lookup table of codes:
 *
 * - **Deterministic.** Probabilities come from likelihood ratios in declared
 *   rules, not from a language model. The same observations always yield the
 *   same ranking, and every number can be traced to the rules that produced it.
 *   An LLM's place is explaining a result, never computing one.
 * - **Disconfirming evidence counts.** Rules may lower a hypothesis as well as
 *   raise it, and a rule that fires against the currently-leading hypothesis is
 *   the most valuable kind. Searching only for confirmation is how a plausible
 *   first guess becomes an expensive wrong repair.
 * - **Missing data is reported, not assumed.** A hypothesis that cannot be
 *   evaluated stays at its prior and says which measurement would move it.
 */

/** One reading, already compared against the vehicle's own baseline. */
export interface Observation {
  /** `ecu:SIGNAL`. */
  signal: string;
  condition: OperatingCondition;
  verdict: AnomalyVerdict;
  /** Signed deviation in robust sigmas; null when there is no usable baseline. */
  zScore: number | null;
  value: number;
  unit: string;
}

/** Observations indexed for rule lookup. */
export class ObservationSet {
  private readonly byKey = new Map<string, Observation>();

  constructor(observations: Observation[] = []) {
    for (const observation of observations) this.add(observation);
  }

  static key(signal: string, condition: OperatingCondition): string {
    return `${signal}|${condition}`;
  }

  add(observation: Observation): void {
    this.byKey.set(
      ObservationSet.key(observation.signal, observation.condition),
      observation
    );
  }

  /**
   * Look up an observation.
   *
   * Returns undefined both when nothing was measured and when the measurement
   * exists but has no baseline to compare against — the caller cannot draw a
   * conclusion from either, and conflating "unmeasured" with "measured and
   * normal" is exactly the mistake that makes a hypothesis look ruled out when
   * it is not.
   */
  get(signal: string, condition: OperatingCondition): Observation | undefined {
    const observation = this.byKey.get(ObservationSet.key(signal, condition));
    if (!observation || observation.verdict === "insufficient_data")
      return undefined;
    return observation;
  }

  has(signal: string, condition: OperatingCondition): boolean {
    return this.get(signal, condition) !== undefined;
  }

  all(): Observation[] {
    return [...this.byKey.values()];
  }
}

export interface Hypothesis {
  id: string;
  label: string;
  /** Prior probability before any evidence. Priors across a family sum to 1. */
  prior: number;
  /** What a mechanic would do to confirm or repair this. */
  action: string;
}

/** A measurement a rule depends on. */
export interface MeasurementRef {
  signal: string;
  condition: OperatingCondition;
  /** Shown to the user when this measurement is recommended. */
  description: string;
}

export interface RuleOutcome {
  hypothesisId: string;
  /**
   * Likelihood ratio: P(observation | hypothesis) / P(observation | not hypothesis).
   *
   * Above 1 supports, below 1 opposes, exactly 1 is uninformative. Values are
   * deliberately modest — a single reading rarely settles anything, and large
   * ratios let one rule dominate the whole result.
   */
  likelihoodRatio: number;
  note: string;
}

export interface EvidenceRule {
  id: string;
  description: string;
  /** Measurements this rule needs before it can fire. */
  requires: MeasurementRef[];
  /** Returns null when the required data is not available. */
  evaluate(observations: ObservationSet): RuleOutcome[] | null;
}

export interface FaultFamily {
  id: string;
  label: string;
  /** Symptom that brings this family into consideration. */
  trigger: string;
  hypotheses: Hypothesis[];
  rules: EvidenceRule[];
}

export interface EvidenceEntry {
  ruleId: string;
  note: string;
  likelihoodRatio: number;
}

export interface HypothesisResult {
  id: string;
  label: string;
  action: string;
  prior: number;
  probability: number;
  supporting: EvidenceEntry[];
  opposing: EvidenceEntry[];
}

export interface DiagnosticResult {
  familyId: string;
  familyLabel: string;
  hypotheses: HypothesisResult[];
  /** Rules that could not fire, with the measurements they are waiting on. */
  missingData: {
    ruleId: string;
    description: string;
    measurements: MeasurementRef[];
  }[];
  /** Shannon entropy of the posterior, in bits. High means still undecided. */
  entropyBits: number;
  /**
   * Whether the result is decisive enough to act on.
   *
   * False means the engine is reporting a ranking, not a diagnosis. Presenting
   * an undecided result as an answer is how a plausible guess becomes a wrong
   * repair.
   */
  conclusive: boolean;
}

/**
 * Posterior entropy below which the result counts as decisive.
 *
 * Roughly: the leading hypothesis is around 80% with the rest spread thin.
 */
export const CONCLUSIVE_ENTROPY_BITS = 1.0;

function entropy(probabilities: number[]): number {
  let sum = 0;
  for (const p of probabilities) {
    if (p > 0) sum -= p * Math.log2(p);
  }
  return sum;
}

function normalise(weights: Map<string, number>): Map<string, number> {
  let total = 0;
  for (const weight of weights.values()) total += weight;
  if (total <= 0) {
    // Every hypothesis was driven to zero, which means the rules contradict
    // each other. Fall back to uniform rather than emitting NaN.
    const uniform = 1 / weights.size;
    return new Map([...weights.keys()].map(key => [key, uniform]));
  }
  const normalised = new Map<string, number>();
  for (const [key, weight] of weights) normalised.set(key, weight / total);
  return normalised;
}

/**
 * Evaluate a fault family against the available observations.
 *
 * Applies every rule that has its data, multiplying likelihood ratios into the
 * priors. Rules that lack data are reported in `missingData` rather than being
 * silently skipped — that list is what Next Best Measurement works from.
 */
export function evaluateFamily(
  family: FaultFamily,
  observations: ObservationSet
): DiagnosticResult {
  const weights = new Map<string, number>();
  for (const hypothesis of family.hypotheses)
    weights.set(hypothesis.id, hypothesis.prior);

  const supporting = new Map<string, EvidenceEntry[]>();
  const opposing = new Map<string, EvidenceEntry[]>();
  const missingData: DiagnosticResult["missingData"] = [];

  for (const rule of family.rules) {
    const outcomes = rule.evaluate(observations);

    if (outcomes === null) {
      const measurements = rule.requires.filter(
        requirement =>
          !observations.has(requirement.signal, requirement.condition)
      );
      missingData.push({
        ruleId: rule.id,
        description: rule.description,
        measurements: measurements.length > 0 ? measurements : rule.requires,
      });
      continue;
    }

    for (const outcome of outcomes) {
      const current = weights.get(outcome.hypothesisId);
      if (current === undefined) continue; // rule names a hypothesis not in this family
      weights.set(outcome.hypothesisId, current * outcome.likelihoodRatio);

      const entry: EvidenceEntry = {
        ruleId: rule.id,
        note: outcome.note,
        likelihoodRatio: outcome.likelihoodRatio,
      };
      const bucket = outcome.likelihoodRatio >= 1 ? supporting : opposing;
      const existing = bucket.get(outcome.hypothesisId);
      if (existing) existing.push(entry);
      else bucket.set(outcome.hypothesisId, [entry]);
    }
  }

  const posterior = normalise(weights);
  const hypotheses: HypothesisResult[] = family.hypotheses
    .map(hypothesis => ({
      id: hypothesis.id,
      label: hypothesis.label,
      action: hypothesis.action,
      prior: hypothesis.prior,
      probability: posterior.get(hypothesis.id) ?? 0,
      supporting: supporting.get(hypothesis.id) ?? [],
      opposing: opposing.get(hypothesis.id) ?? [],
    }))
    .sort((a, b) => b.probability - a.probability);

  const entropyBits = entropy(
    hypotheses.map(hypothesis => hypothesis.probability)
  );

  return {
    familyId: family.id,
    familyLabel: family.label,
    hypotheses,
    missingData,
    entropyBits,
    conclusive: entropyBits <= CONCLUSIVE_ENTROPY_BITS,
  };
}

// ── Next Best Measurement ───────────────────────────────────────────────────

export interface MeasurementSuggestion {
  measurement: MeasurementRef;
  /** Expected reduction in posterior entropy, in bits. */
  expectedInformationGainBits: number;
  /** Rules this measurement would unblock. */
  unblocksRules: string[];
  explanation: string;
}

/** Outcomes a measurement can produce, for the information-gain simulation. */
const CANDIDATE_VERDICTS: { verdict: AnomalyVerdict; zScore: number }[] = [
  { verdict: "normal", zScore: 0 },
  { verdict: "elevated", zScore: 3.5 },
  { verdict: "anomalous", zScore: 6 },
];

/**
 * Choose the measurement that would most reduce diagnostic uncertainty.
 *
 * For each measurement no one has taken yet, the engine simulates each outcome
 * it could produce, re-evaluates the family under that outcome, and averages
 * the resulting entropy weighted by how likely the outcome is. The measurement
 * with the largest expected entropy drop wins.
 *
 * This is the difference between "here are eight things it could be" and "do
 * this one test next": the ranking is by how much a test would *settle*, not by
 * how easy it is or how often the fault occurs.
 */
export function suggestNextMeasurements(
  family: FaultFamily,
  observations: ObservationSet,
  options: { limit?: number } = {}
): MeasurementSuggestion[] {
  const { limit = 3 } = options;

  const current = evaluateFamily(family, observations);
  const currentEntropy = current.entropyBits;

  // Candidates are the measurements that blocked rules are waiting on.
  const candidates = new Map<
    string,
    { measurement: MeasurementRef; rules: string[] }
  >();
  for (const missing of current.missingData) {
    for (const measurement of missing.measurements) {
      if (observations.has(measurement.signal, measurement.condition)) continue;
      const key = ObservationSet.key(measurement.signal, measurement.condition);
      const existing = candidates.get(key);
      if (existing) existing.rules.push(missing.ruleId);
      else candidates.set(key, { measurement, rules: [missing.ruleId] });
    }
  }

  const suggestions: MeasurementSuggestion[] = [];

  for (const { measurement, rules } of candidates.values()) {
    // Probability of each outcome, and the entropy that would follow it.
    const outcomes: { probability: number; entropyBits: number }[] = [];

    for (const candidate of CANDIDATE_VERDICTS) {
      const hypothetical = new ObservationSet(observations.all());
      hypothetical.add({
        signal: measurement.signal,
        condition: measurement.condition,
        verdict: candidate.verdict,
        zScore: candidate.zScore,
        value: 0,
        unit: "",
      });

      const result = evaluateFamily(family, hypothetical);

      // How likely this outcome is, given what is currently believed: the
      // total posterior weight the outcome would be consistent with.
      let probability = 0;
      for (const hypothesis of result.hypotheses) {
        const prior =
          current.hypotheses.find(h => h.id === hypothesis.id)?.probability ??
          0;
        probability += prior * hypothesis.probability;
      }

      outcomes.push({ probability, entropyBits: result.entropyBits });
    }

    const totalProbability = outcomes.reduce(
      (sum, outcome) => sum + outcome.probability,
      0
    );
    if (totalProbability <= 0) continue;

    const expectedEntropy = outcomes.reduce(
      (sum, outcome) =>
        sum + (outcome.probability / totalProbability) * outcome.entropyBits,
      0
    );
    const gain = currentEntropy - expectedEntropy;

    suggestions.push({
      measurement,
      expectedInformationGainBits: gain,
      unblocksRules: rules,
      explanation: `Measuring ${measurement.signal} at ${measurement.condition} is expected to reduce uncertainty by ${gain.toFixed(2)} bits (from ${currentEntropy.toFixed(2)}), by resolving: ${rules.join(", ")}.`,
    });
  }

  return suggestions
    .sort(
      (a, b) => b.expectedInformationGainBits - a.expectedInformationGainBits
    )
    .slice(0, limit);
}

// ── VANOS fault family ──────────────────────────────────────────────────────

const VANOS_SETTLE = "DME:VANOS_EX_SETTLE_MS";
const VANOS_ACTUAL = "DME:VANOS_EX_ACTUAL";
const VANOS_TARGET = "DME:VANOS_EX_TARGET";
const VANOS_INTAKE_SETTLE = "DME:VANOS_IN_SETTLE_MS";
const OIL_TEMP = "DME:OIL_TEMP";

/**
 * Exhaust VANOS regulation faults.
 *
 * Chosen as the first fully-modelled family because its hypotheses are
 * genuinely hard to tell apart from a single reading — which is exactly the
 * situation Next Best Measurement is for. The discriminators are:
 *
 * - **Oil temperature dependence.** Mechanical wear and oil supply problems get
 *   worse as oil thins; a stuck solenoid and a faulty sensor do not care.
 * - **Whether both cams are affected.** Oil supply is common to both; a solenoid
 *   is per-cam.
 * - **Whether the actual value is physically plausible.** A sensor reporting
 *   nonsense is a different fault from an actuator that cannot reach its target.
 */
export const vanosFamily: FaultFamily = {
  id: "vanos_exhaust",
  label: "Exhaust VANOS regulation",
  trigger:
    "Exhaust VANOS settling time or target/actual deviation outside this vehicle's baseline",
  hypotheses: [
    {
      id: "solenoid",
      label: "VANOS solenoid valve sticking or contaminated",
      prior: 0.3,
      action:
        "Remove and clean the exhaust VANOS solenoid; check the screen filter for debris",
    },
    {
      id: "mechanical_wear",
      label: "Mechanical wear in the VANOS unit (helical gear, bearings)",
      prior: 0.25,
      action:
        "Inspect the VANOS unit for play; check the anti-rotation lock and helical spline wear",
    },
    {
      id: "oil_supply",
      label: "Insufficient oil pressure or incorrect oil viscosity",
      prior: 0.2,
      action:
        "Measure oil pressure at operating temperature; verify oil grade and service interval",
    },
    {
      id: "timing_chain",
      label: "Timing chain or tensioner wear shifting cam position",
      prior: 0.1,
      action:
        "Check timing chain slack and tensioner function; compare cam timing against spec",
    },
    {
      id: "sensor",
      label: "Camshaft position sensor reporting incorrectly",
      prior: 0.15,
      action:
        "Check the exhaust cam sensor signal and wiring; compare against a known-good reading",
    },
  ],
  rules: [
    {
      id: "settling_time_elevated",
      description:
        "Is the settling time above this vehicle's own baseline at warm idle?",
      requires: [
        {
          signal: VANOS_SETTLE,
          condition: "idle_warm",
          description: "Exhaust VANOS settling time at warm idle",
        },
      ],
      evaluate(observations) {
        const settle = observations.get(VANOS_SETTLE, "idle_warm");
        if (!settle) return null;

        const elevated =
          settle.verdict === "elevated" || settle.verdict === "anomalous";
        if (!elevated) {
          // A normal settling time argues against everything mechanical and
          // hydraulic; a sensor fault can still misreport the position.
          return [
            {
              hypothesisId: "mechanical_wear",
              likelihoodRatio: 0.35,
              note: "Settling time is within this vehicle's own baseline, which wear would not allow",
            },
            {
              hypothesisId: "oil_supply",
              likelihoodRatio: 0.4,
              note: "Settling time is normal, so hydraulic authority appears intact",
            },
            {
              hypothesisId: "solenoid",
              likelihoodRatio: 0.5,
              note: "Settling time is normal, which a sticking solenoid would usually degrade",
            },
          ];
        }

        return [
          {
            hypothesisId: "mechanical_wear",
            likelihoodRatio: 1.8,
            note: `Settling time is ${settle.zScore?.toFixed(1)}σ above this vehicle's baseline`,
          },
          {
            hypothesisId: "solenoid",
            likelihoodRatio: 1.6,
            note: "Elevated settling time is consistent with restricted oil flow through the solenoid",
          },
          {
            hypothesisId: "oil_supply",
            likelihoodRatio: 1.5,
            note: "Elevated settling time is consistent with low hydraulic pressure",
          },
          {
            hypothesisId: "sensor",
            likelihoodRatio: 0.6,
            note: "A sensor fault alone would not slow the actuator down",
          },
        ];
      },
    },
    {
      id: "oil_temperature_dependence",
      description:
        "Does the deviation worsen when the oil is hot? Distinguishes hydraulic and wear causes from electrical ones.",
      requires: [
        {
          signal: VANOS_SETTLE,
          condition: "idle_warm",
          description: "Exhaust VANOS settling time at warm idle (hot oil)",
        },
        {
          signal: VANOS_SETTLE,
          condition: "cold_start",
          description: "Exhaust VANOS settling time at cold start (cold oil)",
        },
      ],
      evaluate(observations) {
        const warm = observations.get(VANOS_SETTLE, "idle_warm");
        const cold = observations.get(VANOS_SETTLE, "cold_start");
        if (!warm || !cold) return null;

        const warmZ = warm.zScore ?? 0;
        const coldZ = cold.zScore ?? 0;

        // Thin, hot oil reduces actuator authority, so wear and supply problems
        // show themselves more once warm. An electrical fault is indifferent.
        if (warmZ > coldZ + 2) {
          return [
            {
              hypothesisId: "mechanical_wear",
              likelihoodRatio: 2.2,
              note: "Deviation grows with oil temperature, the signature of reduced mechanical/hydraulic authority",
            },
            {
              hypothesisId: "oil_supply",
              likelihoodRatio: 2.0,
              note: "Worse with hot, thinner oil — consistent with marginal oil pressure",
            },
            {
              hypothesisId: "solenoid",
              likelihoodRatio: 0.7,
              note: "A sticking solenoid usually shows worst on cold start, not hot",
            },
            {
              hypothesisId: "sensor",
              likelihoodRatio: 0.4,
              note: "A sensor fault would not track oil temperature",
            },
          ];
        }

        if (coldZ > warmZ + 2) {
          return [
            {
              hypothesisId: "solenoid",
              likelihoodRatio: 2.4,
              note: "Worst on cold start and improving when warm — classic sticking solenoid behaviour",
            },
            {
              hypothesisId: "mechanical_wear",
              likelihoodRatio: 0.5,
              note: "Wear would not improve as the oil thins",
            },
            {
              hypothesisId: "oil_supply",
              likelihoodRatio: 0.6,
              note: "Low oil pressure would not improve when hot",
            },
          ];
        }

        return [
          {
            hypothesisId: "sensor",
            likelihoodRatio: 1.9,
            note: "Deviation is independent of oil temperature, which points away from hydraulic causes",
          },
          {
            hypothesisId: "solenoid",
            likelihoodRatio: 1.2,
            note: "An electrically stuck solenoid would also be temperature-independent",
          },
          {
            hypothesisId: "mechanical_wear",
            likelihoodRatio: 0.6,
            note: "Wear normally shows a temperature dependence; none is present",
          },
          {
            hypothesisId: "oil_supply",
            likelihoodRatio: 0.5,
            note: "An oil supply problem would track temperature; it does not",
          },
        ];
      },
    },
    {
      id: "both_cams_affected",
      description:
        "Is the intake VANOS affected too? A shared cause points at oil supply rather than one solenoid.",
      requires: [
        {
          signal: VANOS_INTAKE_SETTLE,
          condition: "idle_warm",
          description: "Intake VANOS settling time at warm idle",
        },
      ],
      evaluate(observations) {
        const intake = observations.get(VANOS_INTAKE_SETTLE, "idle_warm");
        if (!intake) return null;

        const intakeAffected =
          intake.verdict === "elevated" || intake.verdict === "anomalous";
        if (intakeAffected) {
          return [
            {
              hypothesisId: "oil_supply",
              likelihoodRatio: 3.0,
              note: "Both cams affected — points to the shared oil supply rather than one actuator",
            },
            {
              hypothesisId: "timing_chain",
              likelihoodRatio: 1.8,
              note: "A shared drive fault would affect both cams",
            },
            {
              hypothesisId: "solenoid",
              likelihoodRatio: 0.25,
              note: "One solenoid cannot affect the other cam",
            },
            {
              hypothesisId: "sensor",
              likelihoodRatio: 0.3,
              note: "A single cam sensor cannot affect the other cam",
            },
          ];
        }

        return [
          {
            hypothesisId: "solenoid",
            likelihoodRatio: 1.7,
            note: "Only the exhaust cam is affected — consistent with a single actuator",
          },
          {
            hypothesisId: "sensor",
            likelihoodRatio: 1.5,
            note: "Fault confined to one cam is consistent with that cam's sensor",
          },
          {
            hypothesisId: "oil_supply",
            likelihoodRatio: 0.3,
            note: "A shared oil supply problem would affect the intake cam as well; it does not",
          },
          {
            hypothesisId: "timing_chain",
            likelihoodRatio: 0.4,
            note: "Chain wear would shift both cams; only one is affected",
          },
        ];
      },
    },
    {
      id: "actual_position_plausible",
      description:
        "Is the reported actual cam position physically plausible relative to its target?",
      requires: [
        {
          signal: VANOS_ACTUAL,
          condition: "idle_warm",
          description: "Exhaust VANOS actual position at warm idle",
        },
        {
          signal: VANOS_TARGET,
          condition: "idle_warm",
          description: "Exhaust VANOS target position at warm idle",
        },
      ],
      evaluate(observations) {
        const actual = observations.get(VANOS_ACTUAL, "idle_warm");
        const target = observations.get(VANOS_TARGET, "idle_warm");
        if (!actual || !target) return null;

        // A target that is itself off baseline means the DME is commanding
        // something unusual — that is a different problem from the actuator
        // failing to follow a normal command.
        if (target.verdict === "elevated" || target.verdict === "anomalous") {
          return [
            {
              hypothesisId: "sensor",
              likelihoodRatio: 1.6,
              note: "The commanded target itself is off baseline, which happens when the DME acts on a bad position signal",
            },
          ];
        }

        const deviation = Math.abs(actual.value - target.value);
        // A physically impossible reading is a sensor problem, not an actuator
        // that is merely slow.
        if (deviation > 25) {
          return [
            {
              hypothesisId: "sensor",
              likelihoodRatio: 3.2,
              note: `Actual position differs from target by ${deviation.toFixed(1)}°, beyond the actuator's mechanical range`,
            },
            {
              hypothesisId: "mechanical_wear",
              likelihoodRatio: 0.5,
              note: "Wear degrades response but does not produce out-of-range positions",
            },
          ];
        }

        return [
          {
            hypothesisId: "sensor",
            likelihoodRatio: 0.5,
            note: `Reported position tracks the target to within ${deviation.toFixed(1)}°, so the sensor is reading sensibly`,
          },
        ];
      },
    },
    {
      id: "oil_temperature_reached",
      description:
        "Did the oil actually reach operating temperature during the measurement?",
      requires: [
        {
          signal: OIL_TEMP,
          condition: "idle_warm",
          description: "Oil temperature at warm idle",
        },
      ],
      evaluate(observations) {
        const oil = observations.get(OIL_TEMP, "idle_warm");
        if (!oil) return null;

        // Below operating temperature every VANOS reading is slow legitimately.
        // Without this check a short test drive looks like a fault.
        if (oil.value < 80) {
          return [
            {
              hypothesisId: "mechanical_wear",
              likelihoodRatio: 0.6,
              note: `Oil only reached ${oil.value.toFixed(0)} °C — slow response at this temperature is expected, not evidence of wear`,
            },
            {
              hypothesisId: "oil_supply",
              likelihoodRatio: 0.7,
              note: "Measurement taken below operating temperature; hydraulic behaviour is not representative",
            },
          ];
        }
        return [];
      },
    },
  ],
};

export const FAULT_FAMILIES: Record<string, FaultFamily> = {
  [vanosFamily.id]: vanosFamily,
};
