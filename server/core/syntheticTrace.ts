import { SampleBuilder } from "./signalSource";
import {
  classifyCondition,
  type EngineContext,
  type Trace,
  type TraceGroundTruth,
  type VehicleSignalSample,
} from "./vehicleState";

/**
 * Synthetic trace generation with known ground truth.
 *
 * This exists because a real recording cannot answer the question a detector
 * has to be judged on: *when did the fault actually start?* On a real car the
 * onset is unknown — that is the thing being looked for. A generated trace
 * knows, so a detector's hits, misses and false alarms can be counted instead
 * of eyeballed.
 *
 * The signal models here are behavioural, not physical. They reproduce the
 * shape of a healthy engine's readings and the shape of a degradation well
 * enough to exercise the reasoning layers. They are not an engine model and
 * must never be presented as a prediction of a real vehicle.
 */

/** Deterministic PRNG so a seed reproduces a trace exactly. */
export class Rng {
  private state: number;

  constructor(seed: number) {
    // Avoid the zero fixed point of the xorshift below.
    this.state = seed >>> 0 || 0x9e3779b9;
  }

  /** Uniform in [0, 1). */
  next(): number {
    let x = this.state;
    x ^= x << 13;
    x >>>= 0;
    x ^= x >> 17;
    x ^= x << 5;
    x >>>= 0;
    this.state = x;
    return x / 0x1_0000_0000;
  }

  /** Uniform in [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Approximately standard normal, via the central limit theorem. */
  normal(mean = 0, stdDev = 1): number {
    const sum =
      this.next() +
      this.next() +
      this.next() +
      this.next() +
      this.next() +
      this.next();
    return mean + (sum - 3) * stdDev;
  }
}

/** Signals the generator produces. Keys match those used by the fault models. */
export const SYNTHETIC_SIGNALS = {
  RPM: { signal: "RPM", name: "Engine Speed", unit: "rpm", ecu: "DME" },
  COOLANT: {
    signal: "COOLANT_TEMP",
    name: "Coolant Temperature",
    unit: "°C",
    ecu: "DME",
  },
  OIL: { signal: "OIL_TEMP", name: "Oil Temperature", unit: "°C", ecu: "DME" },
  LOAD: {
    signal: "ENGINE_LOAD",
    name: "Calculated Engine Load",
    unit: "%",
    ecu: "DME",
  },
  THROTTLE: {
    signal: "THROTTLE",
    name: "Throttle Position",
    unit: "%",
    ecu: "DME",
  },
  MAF: { signal: "MAF", name: "Mass Air Flow", unit: "g/s", ecu: "DME" },
  STFT: {
    signal: "STFT_B1",
    name: "Short Term Fuel Trim (Bank 1)",
    unit: "%",
    ecu: "DME",
  },
  LTFT: {
    signal: "LTFT_B1",
    name: "Long Term Fuel Trim (Bank 1)",
    unit: "%",
    ecu: "DME",
  },
  LAMBDA: {
    signal: "O2_B1S1",
    name: "O2 Sensor (Bank 1, Sensor 1)",
    unit: "V",
    ecu: "DME",
  },
  VANOS_TARGET: {
    signal: "VANOS_EX_TARGET",
    name: "VANOS Exhaust Target",
    unit: "°",
    ecu: "DME",
  },
  VANOS_ACTUAL: {
    signal: "VANOS_EX_ACTUAL",
    name: "VANOS Exhaust Actual",
    unit: "°",
    ecu: "DME",
  },
  VANOS_SETTLE: {
    signal: "VANOS_EX_SETTLE_MS",
    name: "VANOS Exhaust Settling Time",
    unit: "ms",
    ecu: "DME",
  },
} as const;

export type SyntheticSignalKey = keyof typeof SYNTHETIC_SIGNALS;

/** One operating point within a simulated drive. */
interface OperatingPoint {
  rpm: number;
  load: number;
  throttle: number;
  speed: number;
  /** Seconds spent at this point. */
  durationSeconds: number;
}

/**
 * A drive cycle: cold start, warmup, then a mix of operating points.
 *
 * Mirrors the recording checklist in docs/recording-checklist.md, so a real
 * session and a synthetic one produce comparable condition coverage.
 */
function defaultDriveCycle(): OperatingPoint[] {
  return [
    { rpm: 1200, load: 25, throttle: 4, speed: 0, durationSeconds: 45 }, // cold idle
    { rpm: 900, load: 22, throttle: 3, speed: 0, durationSeconds: 90 }, // warming idle
    { rpm: 780, load: 20, throttle: 3, speed: 0, durationSeconds: 60 }, // warm idle
    { rpm: 1800, load: 45, throttle: 22, speed: 45, durationSeconds: 60 }, // part load
    { rpm: 2500, load: 55, throttle: 30, speed: 70, durationSeconds: 45 },
    { rpm: 3200, load: 78, throttle: 62, speed: 95, durationSeconds: 30 }, // high load
    { rpm: 2200, load: 8, throttle: 0, speed: 60, durationSeconds: 20 }, // overrun
    { rpm: 800, load: 20, throttle: 3, speed: 0, durationSeconds: 45 }, // back to idle
  ];
}

/** How a fault deforms the healthy signal values. */
export interface FaultModel {
  id: string;
  description: string;
  affectedSignals: string[];
  /**
   * Applied after the healthy value is computed.
   *
   * @param severity 0 at onset, growing towards 1 as the fault progresses.
   */
  apply(
    values: Record<SyntheticSignalKey, number>,
    context: EngineContext,
    severity: number,
    rng: Rng
  ): void;
}

/**
 * Exhaust VANOS wear.
 *
 * Modelled the way it actually presents: the actuator still reaches its target,
 * but takes longer to get there and overshoots less consistently, and both
 * worsen as the oil thins with temperature. Crucially the raw target/actual
 * deviation stays inside the DME's own tolerance for a long time — which is
 * exactly why a factory threshold does not catch it and a per-vehicle baseline
 * does.
 */
export const vanosWearFault: FaultModel = {
  id: "vanos_exhaust_wear",
  description:
    "Exhaust VANOS settling time increases and target/actual deviation grows, both worsening with oil temperature",
  affectedSignals: ["DME:VANOS_EX_SETTLE_MS", "DME:VANOS_EX_ACTUAL"],
  apply(values, context, severity, rng) {
    const oilTemp = context.oilTemp ?? 90;
    // Thinner oil at higher temperature reduces actuator authority, so the
    // fault shows itself more once the engine is hot.
    const thermalFactor = 1 + Math.max(0, (oilTemp - 80) / 40);

    values.VANOS_SETTLE *= 1 + severity * 1.4 * thermalFactor;
    const drift = severity * 3.2 * thermalFactor;
    values.VANOS_ACTUAL -= drift + rng.normal(0, severity * 0.4);
  },
};

/**
 * Mass air flow sensor drift.
 *
 * The sensor reads progressively low. The DME compensates through fuel trims,
 * so the visible consequence is rising trims rather than an obviously wrong MAF
 * — the classic reason this gets misdiagnosed as a fuel delivery problem.
 */
export const mafDriftFault: FaultModel = {
  id: "maf_drift_low",
  description: "MAF reads progressively low; fuel trims rise to compensate",
  affectedSignals: ["DME:MAF", "DME:LTFT_B1", "DME:STFT_B1"],
  apply(values, _context, severity) {
    const underRead = severity * 0.18;
    values.MAF *= 1 - underRead;
    values.LTFT += severity * 14;
    values.STFT += severity * 4;
  },
};

/**
 * Unmetered air after the MAF.
 *
 * Distinguishable from MAF drift by load dependence: a fixed leak area is a
 * large fraction of the air mass at idle and a small one at load, so trims are
 * badly skewed at idle and nearly normal at high load. That asymmetry is what
 * the hypothesis engine keys on.
 */
export const vacuumLeakFault: FaultModel = {
  id: "vacuum_leak",
  description:
    "Unmetered air downstream of the MAF; trims skew at idle, normalise under load",
  affectedSignals: ["DME:LTFT_B1", "DME:STFT_B1", "DME:O2_B1S1"],
  apply(values, context, severity) {
    const load = context.load ?? 50;
    // The leak is a roughly constant volume; its share of total airflow falls
    // as load rises.
    const loadFactor = Math.max(0.1, 1 - load / 100);
    values.LTFT += severity * 22 * loadFactor;
    values.STFT += severity * 8 * loadFactor;
    values.LAMBDA -= severity * 0.08 * loadFactor;
  },
};

/** An abrupt failure rather than a gradual one, for testing step detection. */
export const suddenSensorFailure: FaultModel = {
  id: "o2_sensor_failure",
  description: "O2 sensor output collapses to a stuck value",
  affectedSignals: ["DME:O2_B1S1", "DME:STFT_B1"],
  apply(values, _context, severity) {
    if (severity <= 0) return;
    values.LAMBDA = 0.45;
    values.STFT = 0;
  },
};

export const FAULT_MODELS: Record<string, FaultModel> = {
  [vanosWearFault.id]: vanosWearFault,
  [mafDriftFault.id]: mafDriftFault,
  [vacuumLeakFault.id]: vacuumLeakFault,
  [suddenSensorFailure.id]: suddenSensorFailure,
};

/** Healthy readings for one operating point, before any fault is applied. */
function healthyValues(
  point: OperatingPoint,
  coolantTemp: number,
  oilTemp: number,
  rng: Rng
): Record<SyntheticSignalKey, number> {
  const rpm = point.rpm + rng.normal(0, 18);
  const load = point.load + rng.normal(0, 1.6);

  // Airflow rises roughly with the product of speed and load.
  const maf = (rpm / 1000) * (load / 100) * 34 + 2.2 + rng.normal(0, 0.6);

  // A healthy closed-loop system holds trims near zero with small oscillation.
  const stft = rng.normal(0, 2.4);
  const ltft = rng.normal(1.2, 1.1);

  // Narrowband oxygen sensors swing rather than sit still.
  const lambda = 0.45 + Math.sin(rpm / 40) * 0.28 + rng.normal(0, 0.03);

  // Exhaust cam target is retarded at idle and advanced under load.
  const vanosTarget =
    load < 30
      ? 5 + rng.normal(0, 0.3)
      : 22 + (load - 30) * 0.18 + rng.normal(0, 0.5);
  const vanosActual = vanosTarget + rng.normal(0, 0.45);
  const vanosSettle =
    120 + Math.max(0, (90 - oilTemp) * 1.5) + rng.normal(0, 9);

  return {
    RPM: rpm,
    COOLANT: coolantTemp,
    OIL: oilTemp,
    LOAD: load,
    THROTTLE: point.throttle + rng.normal(0, 0.8),
    MAF: maf,
    STFT: stft,
    LTFT: ltft,
    LAMBDA: lambda,
    VANOS_TARGET: vanosTarget,
    VANOS_ACTUAL: vanosActual,
    VANOS_SETTLE: vanosSettle,
  };
}

export interface SessionOptions {
  vin: string;
  sessionId: string;
  startedAt: number;
  seed: number;
  mileage?: number;
  /** Fault to inject, or null for a healthy session. */
  fault?: FaultModel | null;
  /** 0 at onset, 1 at full development. */
  severity?: number;
  /** Milliseconds between sweeps. */
  sweepIntervalMs?: number;
  /**
   * Milliseconds of skew between signals within one sweep.
   *
   * Zero simulates an adapter that reads several signals atomically; a positive
   * value simulates sequential polling. Used to test that consumers refuse to
   * correlate skewed sweeps.
   */
  intraSweepSkewMs?: number;
  groundTruth?: TraceGroundTruth;
}

/**
 * Generate one recording session.
 *
 * Everything it emits is stamped `synthetic`, which the baseline layer refuses
 * to learn from. That is deliberate: generated data is for testing detectors,
 * never for describing a real vehicle.
 */
export function generateSession(options: SessionOptions): Trace {
  const {
    vin,
    sessionId,
    startedAt,
    seed,
    fault = null,
    severity = 0,
    sweepIntervalMs = 1000,
    intraSweepSkewMs = 0,
  } = options;

  const rng = new Rng(seed);
  const builder = new SampleBuilder(vin, sessionId, "synthetic");
  const samples: VehicleSignalSample[] = [];

  const signalOrder: SyntheticSignalKey[] = [
    "RPM",
    "COOLANT",
    "OIL",
    "LOAD",
    "THROTTLE",
    "MAF",
    "STFT",
    "LTFT",
    "LAMBDA",
    "VANOS_TARGET",
    "VANOS_ACTUAL",
    "VANOS_SETTLE",
  ];

  let elapsedSeconds = 0;
  let now = startedAt;

  for (const point of defaultDriveCycle()) {
    const sweepsHere = Math.max(
      1,
      Math.round((point.durationSeconds * 1000) / sweepIntervalMs)
    );

    for (let i = 0; i < sweepsHere; i++) {
      // Coolant climbs from ambient towards thermostat temperature; oil lags it.
      const coolantTemp =
        Math.min(92, 18 + elapsedSeconds * 0.42) + rng.normal(0, 0.4);
      const oilTemp =
        Math.min(100, 16 + elapsedSeconds * 0.3) + rng.normal(0, 0.5);

      const context: EngineContext = {
        rpm: point.rpm,
        coolantTemp,
        oilTemp,
        load: point.load,
        throttle: point.throttle,
        speed: point.speed,
        secondsSinceStart: elapsedSeconds,
      };

      const values = healthyValues(point, coolantTemp, oilTemp, rng);
      if (fault && severity > 0) fault.apply(values, context, severity, rng);

      const sweep = builder.nextSweep();
      signalOrder.forEach((key, index) => {
        const definition = SYNTHETIC_SIGNALS[key];
        samples.push(
          builder.build({
            sweep,
            // Sequential polling spreads a sweep out in time; the consumer must
            // be able to see that and refuse to correlate.
            acquiredAt: now + index * intraSweepSkewMs,
            ecu: definition.ecu,
            request: `SYN ${definition.signal}`,
            signal: definition.signal,
            name: definition.name,
            raw: null,
            value: Math.round(values[key] * 1000) / 1000,
            unit: definition.unit,
            signalSchemaVersion: "syn-1",
            context,
          })
        );
      });

      now += sweepIntervalMs;
      elapsedSeconds += sweepIntervalMs / 1000;
    }
  }

  return {
    header: {
      kind: "trace-header",
      formatVersion: 1,
      vin,
      sessionId,
      startedAt,
      source: "synthetic",
      mileage: options.mileage,
      groundTruth: options.groundTruth ?? {
        fault: fault?.id ?? null,
        onsetSessionIndex: null,
        affectedSignals: fault?.affectedSignals ?? [],
        description: fault
          ? `${fault.description} at severity ${severity.toFixed(2)}`
          : "Healthy session",
      },
    },
    samples,
  };
}

export interface HistoryOptions {
  vin: string;
  /** Total sessions to generate. */
  sessionCount: number;
  /** Index at which the fault begins; null for an entirely healthy history. */
  onsetSessionIndex: number | null;
  fault?: FaultModel | null;
  seed?: number;
  /** Milliseconds between session start times. Defaults to one week. */
  sessionIntervalMs?: number;
  startedAt?: number;
  /** Kilometres added per session. */
  mileagePerSession?: number;
  startMileage?: number;
  /** Severity reached by the final session. */
  peakSeverity?: number;
  /** Sudden faults jump straight to peak severity at onset. */
  abrupt?: boolean;
  intraSweepSkewMs?: number;
}

/**
 * Generate a history of sessions with a known degradation onset.
 *
 * This is the fixture a detector is scored against: it knows which session the
 * fault started in, so hits, misses and false alarms are countable rather than
 * a matter of opinion.
 */
export function generateHistory(options: HistoryOptions): Trace[] {
  const {
    vin,
    sessionCount,
    onsetSessionIndex,
    fault = null,
    seed = 1,
    sessionIntervalMs = 7 * 24 * 60 * 60 * 1000,
    startedAt = Date.UTC(2025, 0, 6, 8, 0, 0),
    mileagePerSession = 420,
    startMileage = 218_000,
    peakSeverity = 1,
    abrupt = false,
    intraSweepSkewMs = 0,
  } = options;

  const groundTruth: TraceGroundTruth = {
    fault: fault?.id ?? null,
    onsetSessionIndex,
    affectedSignals: fault?.affectedSignals ?? [],
    description: fault
      ? `${fault.description}; onset at session ${onsetSessionIndex}`
      : "Healthy history, no fault injected",
  };

  const traces: Trace[] = [];

  for (let index = 0; index < sessionCount; index++) {
    let severity = 0;
    if (fault && onsetSessionIndex !== null && index >= onsetSessionIndex) {
      if (abrupt) {
        severity = peakSeverity;
      } else {
        // The onset session already carries a small severity rather than
        // exactly zero: a fault that is declared to start at session N but is
        // literally absent there would make the ground truth disagree with the
        // data, and every detector would score a false miss on session N.
        const steps = Math.max(1, sessionCount - onsetSessionIndex);
        const progress = (index - onsetSessionIndex + 1) / steps;
        severity = Math.min(peakSeverity, progress * peakSeverity);
      }
    }

    traces.push(
      generateSession({
        vin,
        sessionId: `${vin}-s${String(index).padStart(3, "0")}`,
        startedAt: startedAt + index * sessionIntervalMs,
        // Each session gets its own stream so adding a session does not shift
        // the noise in the others.
        seed: seed * 7919 + index * 104_729,
        mileage: startMileage + index * mileagePerSession,
        fault,
        severity,
        intraSweepSkewMs,
        groundTruth,
      })
    );
  }

  return traces;
}

/** Re-derive the condition of every sample, e.g. after threshold changes. */
export function conditionsIn(trace: Trace): Set<string> {
  const conditions = new Set<string>();
  for (const sample of trace.samples)
    conditions.add(classifyCondition(sample.context));
  return conditions;
}
