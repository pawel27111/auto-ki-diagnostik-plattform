import {
  signalKey,
  type OperatingCondition,
  type Trace,
  type VehicleSignalSample,
} from "./vehicleState";

/**
 * Vehicle Baseline — what *this* vehicle normally does.
 *
 * The premise of the whole approach: factory diagnostic thresholds are set wide
 * enough to avoid warranty false positives, so a component can degrade a long
 * way while every reading stays "in spec". The informative comparison is not
 * against the catalogue but against the same car's own history, under
 * comparable operating conditions.
 *
 * Everything here is deterministic statistics. No model, no LLM. That is
 * deliberate: an anomaly score that feeds a diagnosis has to be reproducible
 * and explainable, and a rolling mean is both.
 */

/**
 * Samples required in a cell before it may be used as a reference.
 *
 * With fewer, the standard deviation is dominated by sampling noise and a
 * threshold built on it is arbitrary. A cell below this reports
 * `insufficient_data` rather than a confident-looking number — the honest
 * answer while a baseline is still filling up, which for a real vehicle is
 * weeks to months.
 */
export const MIN_SAMPLES_FOR_BASELINE = 30;

/**
 * Sessions required before cross-session trend claims are made.
 *
 * A trend fitted through three points is a line through noise.
 */
export const MIN_SESSIONS_FOR_TREND = 5;

/** Statistics for one (signal × operating condition) cell. */
export interface BaselineCell {
  signal: string;
  condition: OperatingCondition;
  unit: string;
  count: number;
  mean: number;
  stdDev: number;
  min: number;
  max: number;
  /** Robust centre, less sensitive to the odd outlier than the mean. */
  median: number;
  /** Robust spread: median absolute deviation, scaled to be comparable to σ. */
  madStdDev: number;
  /** Sessions that contributed, so a cell filled by one session is visible. */
  sessionCount: number;
  /** Scaling contracts seen. More than one means the cell mixes definitions. */
  schemaVersions: string[];
  sufficient: boolean;
}

export interface VehicleBaseline {
  vin: string;
  /** Keyed by `${ecu}:${signal}|${condition}`. */
  cells: Map<string, BaselineCell>;
  sessionIds: string[];
  /** Samples rejected during construction, with the reason. */
  rejected: { reason: string; count: number }[];
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  const next = sorted[base + 1];
  return next !== undefined
    ? sorted[base] + rest * (next - sorted[base])
    : sorted[base];
}

/** Scale factor making MAD comparable to a standard deviation for normal data. */
const MAD_TO_SIGMA = 1.4826;

export function cellKey(
  ecu: string,
  signal: string,
  condition: OperatingCondition
): string {
  return `${signalKey(ecu, signal)}|${condition}`;
}

export interface BuildBaselineOptions {
  /**
   * Allow synthetic or replayed samples into the baseline.
   *
   * Off by default and should stay off outside tests: a baseline is a claim
   * about a physical vehicle, and generated data would make that claim false
   * while still looking well-populated.
   */
  allowNonLiveSources?: boolean;
  minSamples?: number;
}

/**
 * Build a baseline from recorded sessions.
 *
 * Rejections are counted and returned rather than silently dropped, because
 * "the baseline is thin" and "most samples were discarded as unclassifiable"
 * are very different situations that look identical from the cell counts alone.
 */
export function buildBaseline(
  vin: string,
  traces: Trace[],
  options: BuildBaselineOptions = {}
): VehicleBaseline {
  const { allowNonLiveSources = false, minSamples = MIN_SAMPLES_FOR_BASELINE } =
    options;

  const buckets = new Map<
    string,
    {
      signal: string;
      condition: OperatingCondition;
      unit: string;
      values: number[];
      sessions: Set<string>;
      schemaVersions: Set<string>;
    }
  >();

  const rejections = new Map<string, number>();
  const reject = (reason: string) =>
    rejections.set(reason, (rejections.get(reason) ?? 0) + 1);
  const sessionIds: string[] = [];

  for (const trace of traces) {
    if (!allowNonLiveSources && trace.header.source !== "live") {
      reject(`trace source is "${trace.header.source}", not live`);
      continue;
    }
    if (trace.header.vin !== vin) {
      reject("trace belongs to a different VIN");
      continue;
    }
    sessionIds.push(trace.header.sessionId);

    for (const sample of trace.samples) {
      if (!allowNonLiveSources && sample.source !== "live") {
        reject("sample is not from a live source");
        continue;
      }
      // An unclassifiable reading has no population to belong to. Folding it
      // into a bucket anyway is how idle and full-load values end up averaged
      // together.
      if (sample.condition === "unknown") {
        reject("operating condition unknown");
        continue;
      }
      if (!Number.isFinite(sample.value)) {
        reject("value is not finite");
        continue;
      }

      const key = cellKey(sample.ecu, sample.signal, sample.condition);
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = {
          signal: signalKey(sample.ecu, sample.signal),
          condition: sample.condition,
          unit: sample.unit,
          values: [],
          sessions: new Set(),
          schemaVersions: new Set(),
        };
        buckets.set(key, bucket);
      }
      bucket.values.push(sample.value);
      bucket.sessions.add(sample.sessionId);
      bucket.schemaVersions.add(sample.signalSchemaVersion);
    }
  }

  const cells = new Map<string, BaselineCell>();
  for (const [key, bucket] of buckets) {
    const values = bucket.values;
    const count = values.length;
    const mean = values.reduce((sum, value) => sum + value, 0) / count;
    const variance =
      values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / count;
    const stdDev = Math.sqrt(variance);

    const sorted = [...values].sort((a, b) => a - b);
    const median = quantile(sorted, 0.5);
    const deviations = values
      .map(value => Math.abs(value - median))
      .sort((a, b) => a - b);
    const madStdDev = quantile(deviations, 0.5) * MAD_TO_SIGMA;

    cells.set(key, {
      signal: bucket.signal,
      condition: bucket.condition,
      unit: bucket.unit,
      count,
      mean,
      stdDev,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      median,
      madStdDev,
      sessionCount: bucket.sessions.size,
      schemaVersions: [...bucket.schemaVersions],
      sufficient: count >= minSamples,
    });
  }

  return {
    vin,
    cells,
    sessionIds,
    rejected: [...rejections.entries()].map(([reason, count]) => ({
      reason,
      count,
    })),
  };
}

// ── Anomaly detection ───────────────────────────────────────────────────────

export type AnomalyVerdict =
  | "normal"
  | "elevated"
  | "anomalous"
  | "insufficient_data";

export interface AnomalyResult {
  signal: string;
  condition: OperatingCondition;
  verdict: AnomalyVerdict;
  observed: number;
  unit: string;
  /** Baseline centre the observation was compared against. */
  reference: number | null;
  /** Signed deviation in robust standard deviations. */
  zScore: number | null;
  /** Deviation as a percentage of the reference. */
  deviationPercent: number | null;
  samplesInBaseline: number;
  /** Plain-language reason, for the explainability requirement. */
  explanation: string;
}

/**
 * How far from its own baseline a reading has to fall before it is reported.
 *
 * Deliberately wide. A car is not a laboratory: the reading population is
 * skewed, and a 2σ threshold on a signal sampled thousands of times per session
 * would fire constantly. The cost of a false alarm here is a mechanic pulling a
 * good part.
 */
export const ANOMALY_THRESHOLDS = {
  elevated: 3,
  anomalous: 4.5,
} as const;

/**
 * Compare one reading against the vehicle's own baseline.
 *
 * Uses the median and MAD rather than mean and σ: a baseline built while a
 * fault was already developing has its mean dragged along, and the robust
 * statistics resist that.
 */
export function detectAnomaly(
  baseline: VehicleBaseline,
  sample: Pick<
    VehicleSignalSample,
    "ecu" | "signal" | "condition" | "value" | "unit"
  >
): AnomalyResult {
  const key = cellKey(sample.ecu, sample.signal, sample.condition);
  const cell = baseline.cells.get(key);
  const signal = signalKey(sample.ecu, sample.signal);

  const base = {
    signal,
    condition: sample.condition,
    observed: sample.value,
    unit: sample.unit,
  };

  if (!cell || !cell.sufficient) {
    return {
      ...base,
      verdict: "insufficient_data",
      reference: cell?.median ?? null,
      zScore: null,
      deviationPercent: null,
      samplesInBaseline: cell?.count ?? 0,
      explanation: cell
        ? `Only ${cell.count} baseline samples for ${signal} at ${sample.condition}; ${MIN_SAMPLES_FOR_BASELINE} needed before a comparison means anything.`
        : `No baseline yet for ${signal} at ${sample.condition}.`,
    };
  }

  // A cell whose spread collapsed to zero (a constant signal) would divide by
  // zero; fall back to a small fraction of the median so the comparison stays
  // defined and conservative.
  const spread =
    cell.madStdDev > 0 ? cell.madStdDev : Math.abs(cell.median) * 0.02 || 1;
  const zScore = (sample.value - cell.median) / spread;
  const deviationPercent =
    cell.median !== 0
      ? ((sample.value - cell.median) / Math.abs(cell.median)) * 100
      : null;

  const magnitude = Math.abs(zScore);
  const verdict: AnomalyVerdict =
    magnitude >= ANOMALY_THRESHOLDS.anomalous
      ? "anomalous"
      : magnitude >= ANOMALY_THRESHOLDS.elevated
        ? "elevated"
        : "normal";

  const direction = zScore > 0 ? "above" : "below";
  const explanation =
    verdict === "normal"
      ? `${signal} at ${sample.condition} is within this vehicle's normal range (${cell.median.toFixed(2)} ± ${spread.toFixed(2)} ${cell.unit}, ${cell.count} samples).`
      : `${signal} at ${sample.condition} reads ${sample.value.toFixed(2)} ${cell.unit}, ${magnitude.toFixed(1)}σ ${direction} this vehicle's own baseline of ${cell.median.toFixed(2)} ${cell.unit} (${cell.count} samples over ${cell.sessionCount} sessions).`;

  return {
    ...base,
    verdict,
    reference: cell.median,
    zScore,
    deviationPercent,
    samplesInBaseline: cell.count,
    explanation,
  };
}

// ── Trend detection across sessions ─────────────────────────────────────────

export interface SessionAggregate {
  sessionId: string;
  sessionIndex: number;
  startedAt: number;
  mileage?: number;
  /** Median per `${ecu}:${signal}|${condition}`. */
  medians: Map<string, number>;
}

/**
 * Reduce a session to one robust value per signal and condition.
 *
 * Trend analysis works on session medians rather than raw samples: within a
 * session, consecutive readings are heavily autocorrelated, so treating them as
 * independent observations inflates confidence enormously.
 */
export function aggregateSession(
  trace: Trace,
  sessionIndex: number
): SessionAggregate {
  const buckets = new Map<string, number[]>();

  for (const sample of trace.samples) {
    if (sample.condition === "unknown" || !Number.isFinite(sample.value))
      continue;
    const key = cellKey(sample.ecu, sample.signal, sample.condition);
    const existing = buckets.get(key);
    if (existing) existing.push(sample.value);
    else buckets.set(key, [sample.value]);
  }

  const medians = new Map<string, number>();
  for (const [key, values] of buckets) {
    medians.set(
      key,
      quantile(
        [...values].sort((a, b) => a - b),
        0.5
      )
    );
  }

  return {
    sessionId: trace.header.sessionId,
    sessionIndex,
    startedAt: trace.header.startedAt,
    mileage: trace.header.mileage,
    medians,
  };
}

export interface TrendResult {
  key: string;
  /** Change per session in the signal's own unit. */
  slopePerSession: number;
  /**
   * Total change measured in the signal's own early-session spread.
   *
   * This, not the percentage, is what magnitude decisions are made on. Fuel
   * trims sit at roughly zero when healthy, so a percentage change against them
   * explodes to meaningless numbers (a drift from 0.1% to 8% is "+7900%") while
   * a percentage against a coolant temperature of 90 °C understates the same
   * physical significance. Spread-relative change is comparable across both.
   */
  changeInReferenceSigmas: number;
  /**
   * Total change as a percentage of the first session, for display only.
   *
   * Null when the reference sits too close to zero for a ratio to mean
   * anything.
   */
  totalChangePercent: number | null;
  /** Change in the signal's own unit, always meaningful. */
  totalChangeAbsolute: number;
  /** Goodness of fit, 0..1. Low means the change is not a clean trend. */
  rSquared: number;
  sessionsAnalysed: number;
  /** First session index whose value left the early-session reference band. */
  onsetSessionIndex: number | null;
  explanation: string;
}

/**
 * Find a monotonic drift across sessions and estimate when it started.
 *
 * Onset is not taken from the regression: a line fitted over the whole history
 * is pulled backwards by later, larger deviations and would date the onset too
 * early. Instead the first sessions form a reference band and onset is the
 * first session that leaves it and does not come back — which is much closer to
 * the question a mechanic asks.
 */
export function detectTrend(
  aggregates: SessionAggregate[],
  key: string,
  options: { referenceSessions?: number; onsetSigma?: number } = {}
): TrendResult | null {
  const { referenceSessions = 4, onsetSigma = 4 } = options;

  const points = aggregates
    .map(aggregate => ({
      x: aggregate.sessionIndex,
      y: aggregate.medians.get(key),
    }))
    .filter(
      (point): point is { x: number; y: number } =>
        point.y !== undefined && Number.isFinite(point.y)
    );

  if (points.length < MIN_SESSIONS_FOR_TREND) return null;

  const n = points.length;
  const meanX = points.reduce((sum, p) => sum + p.x, 0) / n;
  const meanY = points.reduce((sum, p) => sum + p.y, 0) / n;

  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (const point of points) {
    const dx = point.x - meanX;
    const dy = point.y - meanY;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }

  const slope = sxx === 0 ? 0 : sxy / sxx;
  const rSquared = sxx === 0 || syy === 0 ? 0 : (sxy * sxy) / (sxx * syy);

  const first = points[0].y;
  const last = points[points.length - 1].y;
  const totalChangeAbsolute = last - first;

  // Reference band from the earliest sessions, assumed healthy.
  const reference = points.slice(0, Math.min(referenceSessions, points.length));
  const refMean = reference.reduce((sum, p) => sum + p.y, 0) / reference.length;
  const refSpreadRaw = Math.sqrt(
    reference.reduce((sum, p) => sum + (p.y - refMean) ** 2, 0) /
      reference.length
  );

  // Floor the spread. Estimated from only a handful of sessions it can come out
  // implausibly small by chance, and every later deviation then measures as a
  // huge number of sigmas. The floor keeps a lucky-quiet reference from
  // manufacturing significance.
  const refSpread = Math.max(refSpreadRaw, Math.abs(refMean) * 0.01, 1e-6);

  const changeInReferenceSigmas = totalChangeAbsolute / refSpread;

  // A ratio against a reference that is itself within noise of zero is not
  // informative — it reports thousands of percent for a physically small move.
  const percentIsMeaningful = Math.abs(refMean) > 2 * refSpread && first !== 0;
  const totalChangePercent = percentIsMeaningful
    ? (totalChangeAbsolute / Math.abs(first)) * 100
    : null;

  let onsetSessionIndex: number | null = null;
  for (let i = reference.length; i < points.length; i++) {
    if (Math.abs(points[i].y - refMean) < onsetSigma * refSpread) continue;
    // Require the departure to persist, so a single noisy session does not
    // count as the start of a degradation.
    const persists = points
      .slice(i)
      .every(p => Math.abs(p.y - refMean) >= onsetSigma * refSpread);
    if (persists) {
      onsetSessionIndex = points[i].x;
      break;
    }
  }

  const magnitudeText =
    totalChangePercent !== null
      ? `${totalChangePercent.toFixed(1)}%`
      : `${totalChangeAbsolute.toFixed(2)} units (${changeInReferenceSigmas.toFixed(1)}σ)`;

  return {
    key,
    slopePerSession: slope,
    changeInReferenceSigmas,
    totalChangePercent,
    totalChangeAbsolute,
    rSquared,
    sessionsAnalysed: n,
    onsetSessionIndex,
    explanation:
      onsetSessionIndex === null
        ? `${key} shows no persistent departure from its early-session reference (${refMean.toFixed(2)} ± ${refSpread.toFixed(2)}).`
        : `${key} left its reference band of ${refMean.toFixed(2)} ± ${refSpread.toFixed(2)} at session ${onsetSessionIndex} and stayed out; total change ${magnitudeText} over ${n} sessions (R²=${rSquared.toFixed(2)}).`,
  };
}

/**
 * Signals that define the operating condition rather than being observed in it.
 *
 * `classifyCondition` buckets a reading using coolant temperature, engine
 * speed, load and throttle. Trending one of those *within its own bucket* is
 * circular: a "warmup" bucket is defined as the span where coolant temperature
 * is rising, so its session median is a property of where the bucket
 * boundaries fell, not of the vehicle's health. It moves with sampling noise
 * and produces confident-looking findings about nothing.
 *
 * Matched as a suffix so adapter-specific prefixes still hit. Faults in these
 * signals are real, but they are found by comparing across conditions or
 * against physical limits, not by trending inside one bucket.
 */
export const DEFAULT_CONTEXT_SIGNALS = [
  "RPM",
  "COOLANT_TEMP",
  "ENGINE_LOAD",
  "THROTTLE",
  "VEHICLE_SPEED",
] as const;

function isContextSignal(
  key: string,
  contextSignals: readonly string[]
): boolean {
  // Key shape is `ecu:SIGNAL|condition`.
  const signal = key.split("|")[0]?.split(":").slice(1).join(":") ?? "";
  return contextSignals.some(
    context => signal === context || signal.endsWith(`_${context}`)
  );
}

/**
 * Run trend detection over every signal a history contains.
 *
 * Four conditions must hold before a drift is reported as a finding:
 *
 * - the signal is an observation, not one of the condition-defining inputs;
 * - it fits a trend (`rSquared`), so noise is not mistaken for movement;
 * - it moved far relative to the signal's own early-session spread, which is
 *   the only scale-free way to compare a fuel trim against a temperature; and
 * - a persistent onset session can be named. Without one there is no
 *   degradation story to tell, only a number that differs — and a finding that
 *   cannot say when it started is not actionable.
 */
export function detectAllTrends(
  aggregates: SessionAggregate[],
  options: {
    minRSquared?: number;
    minChangeSigmas?: number;
    contextSignals?: readonly string[];
  } = {}
): TrendResult[] {
  const {
    minRSquared = 0.5,
    minChangeSigmas = 6,
    contextSignals = DEFAULT_CONTEXT_SIGNALS,
  } = options;

  const keys = new Set<string>();
  for (const aggregate of aggregates)
    for (const key of aggregate.medians.keys()) keys.add(key);

  const results: TrendResult[] = [];
  for (const key of keys) {
    if (isContextSignal(key, contextSignals)) continue;
    const trend = detectTrend(aggregates, key);
    if (!trend) continue;
    if (trend.onsetSessionIndex === null) continue;
    if (trend.rSquared < minRSquared) continue;
    if (Math.abs(trend.changeInReferenceSigmas) < minChangeSigmas) continue;
    results.push(trend);
  }

  return results.sort(
    (a, b) =>
      Math.abs(b.changeInReferenceSigmas) - Math.abs(a.changeInReferenceSigmas)
  );
}
