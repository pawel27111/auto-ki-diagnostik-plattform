import { z } from "zod";

/**
 * Vehicle State Model — the one shape every diagnostic reading takes.
 *
 * Everything above this layer (baselines, anomaly detection, hypotheses) reads
 * only this structure, never an adapter's native format. That is what lets an
 * ELM327 adapter and an EDIABAS adapter feed the same reasoning core.
 *
 * Four fields exist because getting them wrong silently corrupts every layer
 * above:
 *
 * - `acquiredAt` / `seq`  — a reading's own acquisition time, not the session's.
 *   Adapters poll sequentially, so two signals from "the same moment" can be
 *   hundreds of milliseconds apart. Correlating them without knowing the skew
 *   produces confident nonsense.
 * - `signalSchemaVersion` — scaling and units differ between ECU software
 *   versions. A changed scaling must invalidate affected baselines rather than
 *   blend with them.
 * - `source` — synthetic and replayed readings must never reach a baseline that
 *   is meant to describe a real vehicle.
 * - `condition` — a reading is only comparable to other readings taken under
 *   comparable operating conditions. Idle and full load are different
 *   populations, not noise around one mean.
 */

/** Where a reading came from. Only "live" may contribute to a baseline. */
export const SIGNAL_SOURCES = ["live", "replay", "synthetic"] as const;
export type SignalSource = (typeof SIGNAL_SOURCES)[number];

/**
 * Operating conditions a reading is bucketed into.
 *
 * Deliberately coarse. A finer grid multiplies the number of baseline cells,
 * and every cell needs its own samples before it says anything — see
 * MIN_SAMPLES_FOR_BASELINE in baseline.ts. Start coarse, split later if the
 * data supports it.
 */
export const OPERATING_CONDITIONS = [
  "cold_start",
  "warmup",
  "idle_warm",
  "part_load",
  "high_load",
  "deceleration",
  "unknown",
] as const;
export type OperatingCondition = (typeof OPERATING_CONDITIONS)[number];

/**
 * Engine-side context a reading was taken in.
 *
 * Carried alongside every sample so the condition can be re-derived later: if
 * the bucketing rules change, historical traces can be re-classified instead of
 * being thrown away.
 */
export interface EngineContext {
  /** Engine speed in min^-1. */
  rpm?: number;
  /** Coolant temperature in °C. */
  coolantTemp?: number;
  /** Oil temperature in °C. Several faults are oil-temperature dependent. */
  oilTemp?: number;
  /** Calculated engine load in %. */
  load?: number;
  /** Throttle position in %. */
  throttle?: number;
  /** Vehicle speed in km/h. */
  speed?: number;
  /** Seconds since the engine was started, when known. */
  secondsSinceStart?: number;
}

export const engineContextSchema = z.object({
  rpm: z.number().finite().optional(),
  coolantTemp: z.number().finite().optional(),
  oilTemp: z.number().finite().optional(),
  load: z.number().finite().optional(),
  throttle: z.number().finite().optional(),
  speed: z.number().finite().optional(),
  secondsSinceStart: z.number().finite().optional(),
});

/** One measured value, fully self-describing. */
export interface VehicleSignalSample {
  /** Vehicle identity. Baselines are per VIN — that is the whole point. */
  vin: string;
  /** Recording session this reading belongs to. */
  sessionId: string;
  /**
   * Monotonic index within the session. Two samples with the same `sweep` were
   * requested as one unit; see SignalSweep in signalSource.ts.
   */
  seq: number;
  /** Sweep this sample belongs to, for correlation. */
  sweep: number;
  /** Unix milliseconds at which the adapter received this value. */
  acquiredAt: number;
  /** Control unit, e.g. "DME". Generic OBD-II readings use "OBD". */
  ecu: string;
  /**
   * Adapter-native request that produced the value: an EDIABAS job name, or an
   * OBD-II mode+PID such as "01 0C". Kept so a reading can be traced back to
   * exactly what was asked.
   */
  request: string;
  /** Stable signal identifier, unique per ECU. */
  signal: string;
  /** Human-readable name for display. */
  name: string;
  /** Adapter-native value before scaling, for auditability. */
  raw: string | null;
  /** Normalised physical value. */
  value: number;
  /** SI-ish unit the value is expressed in. */
  unit: string;
  /** Scaling contract this value was produced under. */
  signalSchemaVersion: string;
  condition: OperatingCondition;
  context: EngineContext;
  source: SignalSource;
}

export const vehicleSignalSampleSchema = z.object({
  vin: z.string().min(1).max(17),
  sessionId: z.string().min(1).max(64),
  seq: z.number().int().nonnegative(),
  sweep: z.number().int().nonnegative(),
  acquiredAt: z.number().int().nonnegative(),
  ecu: z.string().min(1).max(32),
  request: z.string().min(1).max(128),
  signal: z.string().min(1).max(64),
  name: z.string().min(1).max(128),
  raw: z.string().max(256).nullable(),
  value: z.number().finite(),
  unit: z.string().max(16),
  signalSchemaVersion: z.string().min(1).max(32),
  condition: z.enum(OPERATING_CONDITIONS),
  context: engineContextSchema,
  source: z.enum(SIGNAL_SOURCES),
});

/**
 * Header written as the first line of a trace file.
 *
 * `groundTruth` is only ever populated by the synthetic generator. Real
 * recordings do not know when a fault began — that is precisely why synthetic
 * traces are needed to evaluate a detector.
 */
export interface TraceHeader {
  kind: "trace-header";
  formatVersion: 1;
  vin: string;
  sessionId: string;
  startedAt: number;
  source: SignalSource;
  vehicle?: { make?: string; model?: string; year?: number; engine?: string };
  mileage?: number;
  notes?: string;
  groundTruth?: TraceGroundTruth;
}

/** What a synthetic trace is known to contain, for scoring a detector. */
export interface TraceGroundTruth {
  /** Fault injected, or null for a healthy trace. */
  fault: string | null;
  /** Session index at which the fault starts becoming observable. */
  onsetSessionIndex: number | null;
  /** Signals the fault actually affects. */
  affectedSignals: string[];
  description: string;
}

export const traceGroundTruthSchema = z.object({
  fault: z.string().nullable(),
  onsetSessionIndex: z.number().int().nonnegative().nullable(),
  affectedSignals: z.array(z.string()),
  description: z.string(),
});

export const traceHeaderSchema = z.object({
  kind: z.literal("trace-header"),
  formatVersion: z.literal(1),
  vin: z.string().min(1).max(17),
  sessionId: z.string().min(1).max(64),
  startedAt: z.number().int().nonnegative(),
  source: z.enum(SIGNAL_SOURCES),
  vehicle: z
    .object({
      make: z.string().optional(),
      model: z.string().optional(),
      year: z.number().int().optional(),
      engine: z.string().optional(),
    })
    .optional(),
  mileage: z.number().int().nonnegative().optional(),
  notes: z.string().optional(),
  groundTruth: traceGroundTruthSchema.optional(),
});

export interface Trace {
  header: TraceHeader;
  samples: VehicleSignalSample[];
}

// ── Operating condition classification ──────────────────────────────────────

/**
 * Thresholds for bucketing a reading.
 *
 * Values are for a warm-running petrol engine and are deliberately conservative:
 * a sample that does not clearly belong somewhere becomes "unknown" rather than
 * contaminating a bucket. An "unknown" reading is excluded from baselines.
 */
export const CONDITION_THRESHOLDS = {
  /** Below this the engine has not reached operating temperature. */
  coldCoolantTemp: 60,
  /** At or above this the engine is considered warm. */
  warmCoolantTemp: 80,
  /** Engine speed at or below this counts as idle. */
  idleRpmMax: 1100,
  /** Load at or below this counts as idle/overrun rather than driving. */
  idleLoadMax: 30,
  /** Load at or above this counts as high load. */
  highLoadMin: 70,
  /** Throttle at or below this with raised rpm indicates overrun. */
  decelThrottleMax: 3,
  decelRpmMin: 1200,
  /** Seconds after start during which a reading still counts as cold start. */
  coldStartWindowSeconds: 60,
} as const;

/**
 * Bucket a reading by the engine context it was taken in.
 *
 * Order matters: the checks run from most specific to least. Deceleration is
 * tested before load buckets because an overrun sample has low load but is a
 * different population from idle — fuel is cut, so mixture signals mean
 * something else entirely.
 */
export function classifyCondition(context: EngineContext): OperatingCondition {
  const { rpm, coolantTemp, load, throttle, secondsSinceStart } = context;

  // Without a temperature the warm/cold distinction cannot be made, and it is
  // the distinction that matters most for nearly every signal.
  if (coolantTemp === undefined) return "unknown";

  if (
    coolantTemp < CONDITION_THRESHOLDS.coldCoolantTemp &&
    secondsSinceStart !== undefined &&
    secondsSinceStart <= CONDITION_THRESHOLDS.coldStartWindowSeconds
  ) {
    return "cold_start";
  }

  if (coolantTemp < CONDITION_THRESHOLDS.warmCoolantTemp) return "warmup";

  if (rpm === undefined) return "unknown";

  if (
    throttle !== undefined &&
    throttle <= CONDITION_THRESHOLDS.decelThrottleMax &&
    rpm >= CONDITION_THRESHOLDS.decelRpmMin
  ) {
    return "deceleration";
  }

  if (load === undefined) return "unknown";

  if (
    rpm <= CONDITION_THRESHOLDS.idleRpmMax &&
    load <= CONDITION_THRESHOLDS.idleLoadMax
  ) {
    return "idle_warm";
  }

  if (load >= CONDITION_THRESHOLDS.highLoadMin) return "high_load";

  return "part_load";
}

/**
 * Re-classify every sample in a trace.
 *
 * Used when the bucketing rules change: because each sample carries its own
 * `context`, historical traces can be re-bucketed instead of discarded.
 */
export function reclassifyTrace(trace: Trace): Trace {
  return {
    header: trace.header,
    samples: trace.samples.map(sample => ({
      ...sample,
      condition: classifyCondition(sample.context),
    })),
  };
}

// ── JSONL serialisation ─────────────────────────────────────────────────────

/**
 * Serialise a trace as JSON Lines: header first, then one sample per line.
 *
 * Line-oriented so a long recording can be appended to as it runs and streamed
 * back without loading it all into memory, and so a truncated file (a session
 * that lost power) still yields every complete line before the break.
 */
export function serializeTrace(trace: Trace): string {
  const lines = [JSON.stringify(trace.header)];
  for (const sample of trace.samples) lines.push(JSON.stringify(sample));
  return lines.join("\n") + "\n";
}

export class TraceFormatError extends Error {
  constructor(
    message: string,
    readonly line: number
  ) {
    super(`${message} (line ${line})`);
    this.name = "TraceFormatError";
  }
}

/**
 * Parse a JSONL trace.
 *
 * `lenient` skips malformed sample lines instead of failing the whole file, so
 * one corrupt line in a long recording does not cost the rest of the session.
 * Skipped lines are reported rather than silently dropped.
 */
export function parseTrace(
  text: string,
  options: { lenient?: boolean } = {}
): { trace: Trace; skipped: { line: number; reason: string }[] } {
  const lines = text.split("\n").filter(line => line.trim().length > 0);
  if (lines.length === 0) throw new TraceFormatError("Trace is empty", 0);

  let headerJson: unknown;
  try {
    headerJson = JSON.parse(lines[0]);
  } catch {
    throw new TraceFormatError("Trace header is not valid JSON", 1);
  }

  const header = traceHeaderSchema.safeParse(headerJson);
  if (!header.success) {
    throw new TraceFormatError(
      `Trace header is invalid: ${header.error.issues[0]?.message ?? "unknown"}`,
      1
    );
  }

  const samples: VehicleSignalSample[] = [];
  const skipped: { line: number; reason: string }[] = [];

  for (let i = 1; i < lines.length; i++) {
    const lineNumber = i + 1;
    let parsed: unknown;
    try {
      parsed = JSON.parse(lines[i]);
    } catch {
      if (!options.lenient)
        throw new TraceFormatError("Sample is not valid JSON", lineNumber);
      skipped.push({ line: lineNumber, reason: "not valid JSON" });
      continue;
    }

    const sample = vehicleSignalSampleSchema.safeParse(parsed);
    if (!sample.success) {
      const reason = sample.error.issues[0]?.message ?? "unknown";
      if (!options.lenient)
        throw new TraceFormatError(`Sample is invalid: ${reason}`, lineNumber);
      skipped.push({ line: lineNumber, reason });
      continue;
    }

    samples.push(sample.data);
  }

  return { trace: { header: header.data, samples }, skipped };
}

// ── Queries used by the layers above ────────────────────────────────────────

/** Group samples by sweep, preserving order. Used for correlation checks. */
export function groupBySweep(
  samples: VehicleSignalSample[]
): Map<number, VehicleSignalSample[]> {
  const sweeps = new Map<number, VehicleSignalSample[]>();
  for (const sample of samples) {
    const existing = sweeps.get(sample.sweep);
    if (existing) existing.push(sample);
    else sweeps.set(sample.sweep, [sample]);
  }
  return sweeps;
}

/**
 * Largest gap in acquisition time within a sweep, in milliseconds.
 *
 * This is the number that decides whether signals in a sweep may be compared
 * against each other at all. See `isCorrelatable`.
 */
export function sweepSkewMs(samples: VehicleSignalSample[]): number {
  if (samples.length < 2) return 0;
  let min = samples[0].acquiredAt;
  let max = samples[0].acquiredAt;
  for (const sample of samples) {
    if (sample.acquiredAt < min) min = sample.acquiredAt;
    if (sample.acquiredAt > max) max = sample.acquiredAt;
  }
  return max - min;
}

/**
 * Default limit for treating readings in one sweep as simultaneous.
 *
 * At 3000 min^-1 the crankshaft turns 50 times per second, so 100 ms spans
 * roughly five engine revolutions. Beyond that, comparing a target against an
 * actual describes two different operating points rather than one error.
 */
export const DEFAULT_MAX_CORRELATION_SKEW_MS = 100;

/**
 * Whether readings in a sweep were taken close enough together to be compared.
 *
 * Callers must check this before computing any cross-signal quantity. Returning
 * "not correlatable" is a real answer — silently correlating skewed samples is
 * how a diagnosis becomes confidently wrong.
 */
export function isCorrelatable(
  samples: VehicleSignalSample[],
  maxSkewMs: number = DEFAULT_MAX_CORRELATION_SKEW_MS
): boolean {
  return sweepSkewMs(samples) <= maxSkewMs;
}

/** Latest sample per signal, for "current state" views. */
export function latestBySignal(
  samples: VehicleSignalSample[]
): Map<string, VehicleSignalSample> {
  const latest = new Map<string, VehicleSignalSample>();
  for (const sample of samples) {
    const key = `${sample.ecu}:${sample.signal}`;
    const existing = latest.get(key);
    if (!existing || sample.acquiredAt >= existing.acquiredAt)
      latest.set(key, sample);
  }
  return latest;
}

/** Stable key for a signal across ECUs. */
export function signalKey(ecu: string, signal: string): string {
  return `${ecu}:${signal}`;
}
