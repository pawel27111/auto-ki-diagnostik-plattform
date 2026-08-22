import {
  classifyCondition,
  type EngineContext,
  type SignalSource as SampleSource,
  type Trace,
  type VehicleSignalSample,
} from "./vehicleState";

/**
 * The adapter boundary.
 *
 * Everything above this interface is vehicle-protocol agnostic. Below it sit
 * the concrete adapters — an ELM327 over OBD-II today, an EDIABAS adapter for
 * BMW-specific jobs later, a trace replay for development without hardware.
 *
 * Drawing this line now rather than later is the whole reason the reasoning
 * core can be developed and tested with no car attached.
 */

/**
 * A group of signals requested as one unit.
 *
 * The sweep is the unit of correlation, not the individual reading. An adapter
 * that can fetch several values in one protocol round trip (an EDIABAS job
 * returning target and actual together) reports them in one sweep with nearly
 * identical timestamps; an adapter that must poll sequentially reports the real
 * skew. Consumers then decide, per sweep, whether cross-signal comparison is
 * meaningful — see `isCorrelatable`.
 */
export interface SignalSweep {
  sweep: number;
  samples: VehicleSignalSample[];
}

/** A signal an adapter has been asked to read. */
export interface SignalRequest {
  ecu: string;
  signal: string;
}

export interface SignalSourceCapabilities {
  /**
   * Whether the adapter can return several signals from one protocol round
   * trip. False for ELM327 (one PID per request), true for EDIABAS jobs that
   * return multiple results.
   */
  atomicMultiSignalRead: boolean;
  /** Signals this source can produce, as `ecu:signal` keys. */
  availableSignals: string[];
  /** Human-readable adapter name, for logs and provenance. */
  name: string;
}

/**
 * A source of vehicle signals.
 *
 * Implementations must be safe to call concurrently only insofar as they
 * serialise internally — the underlying transports (serial, EDIABAS) all
 * answer one request at a time.
 */
export interface VehicleSignalSource {
  readonly capabilities: SignalSourceCapabilities;
  /** Which kind of data this source produces; stamped onto every sample. */
  readonly sampleSource: SampleSource;

  open(): Promise<void>;
  close(): Promise<void>;

  /**
   * Read one sweep.
   *
   * Returns null when the source is exhausted (a replay reaching the end of its
   * trace). A live source blocks until it has values or throws.
   */
  readSweep(requests: SignalRequest[]): Promise<SignalSweep | null>;
}

/**
 * Builds samples with consistent bookkeeping.
 *
 * Sequence numbers, sweep numbers and condition classification are easy to get
 * subtly wrong per adapter, so they are done once here instead.
 */
export class SampleBuilder {
  private seq = 0;
  private sweep = 0;

  constructor(
    private readonly vin: string,
    private readonly sessionId: string,
    private readonly source: SampleSource
  ) {}

  /** Begin a new sweep and return its index. */
  nextSweep(): number {
    return this.sweep++;
  }

  build(input: {
    sweep: number;
    acquiredAt: number;
    ecu: string;
    request: string;
    signal: string;
    name: string;
    raw: string | null;
    value: number;
    unit: string;
    signalSchemaVersion: string;
    context: EngineContext;
  }): VehicleSignalSample {
    return {
      vin: this.vin,
      sessionId: this.sessionId,
      seq: this.seq++,
      sweep: input.sweep,
      acquiredAt: input.acquiredAt,
      ecu: input.ecu,
      request: input.request,
      signal: input.signal,
      name: input.name,
      raw: input.raw,
      value: input.value,
      unit: input.unit,
      signalSchemaVersion: input.signalSchemaVersion,
      condition: classifyCondition(input.context),
      context: input.context,
      source: this.source,
    };
  }
}

/**
 * Replays a recorded or generated trace through the live interface.
 *
 * This is what makes the layers above testable without a vehicle: the same code
 * path that will run against an ECU runs against a file, with the same sweep
 * grouping and the same timestamps, so skew and correlation behave exactly as
 * they did during the recording.
 *
 * Samples are re-stamped as `replay` unless `preserveSource` is set, so replayed
 * data can never be mistaken for a fresh live measurement. Tests that need the
 * original marking (verifying that a generator produced `synthetic`) opt in.
 */
export class TraceReplaySource implements VehicleSignalSource {
  readonly capabilities: SignalSourceCapabilities;
  readonly sampleSource: SampleSource;

  private sweeps: SignalSweep[] = [];
  private cursor = 0;
  private opened = false;

  constructor(
    private readonly trace: Trace,
    private readonly options: { preserveSource?: boolean } = {}
  ) {
    this.sampleSource = options.preserveSource ? trace.header.source : "replay";

    const signals = new Set<string>();
    for (const sample of trace.samples)
      signals.add(`${sample.ecu}:${sample.signal}`);

    this.capabilities = {
      name: `replay(${trace.header.sessionId})`,
      // A replay reproduces whatever grouping the recording had, so it behaves
      // as if it could read atomically — the recorded skew is what matters.
      atomicMultiSignalRead: true,
      availableSignals: [...signals],
    };
  }

  async open(): Promise<void> {
    const bySweep = new Map<number, VehicleSignalSample[]>();
    for (const sample of this.trace.samples) {
      const stamped = this.options.preserveSource
        ? sample
        : { ...sample, source: "replay" as const };
      const existing = bySweep.get(sample.sweep);
      if (existing) existing.push(stamped);
      else bySweep.set(sample.sweep, [stamped]);
    }

    this.sweeps = [...bySweep.entries()]
      .sort(([a], [b]) => a - b)
      .map(([sweep, samples]) => ({ sweep, samples }));
    this.cursor = 0;
    this.opened = true;
  }

  async close(): Promise<void> {
    this.opened = false;
    this.sweeps = [];
    this.cursor = 0;
  }

  /**
   * Return the next recorded sweep, filtered to the requested signals.
   *
   * A replay cannot invent readings that were never recorded, so a request for
   * a signal absent from the trace yields nothing for that signal rather than a
   * substituted value.
   */
  async readSweep(requests: SignalRequest[]): Promise<SignalSweep | null> {
    if (!this.opened) throw new Error("TraceReplaySource is not open");
    if (this.cursor >= this.sweeps.length) return null;

    const wanted = new Set(
      requests.map(request => `${request.ecu}:${request.signal}`)
    );
    const next = this.sweeps[this.cursor++];

    return {
      sweep: next.sweep,
      samples:
        wanted.size === 0
          ? next.samples
          : next.samples.filter(sample =>
              wanted.has(`${sample.ecu}:${sample.signal}`)
            ),
    };
  }

  /** Sweeps not yet consumed. Used by tests and progress reporting. */
  get remaining(): number {
    return Math.max(0, this.sweeps.length - this.cursor);
  }
}

/**
 * Drain a source into a flat sample list.
 *
 * `maxSweeps` bounds a replay of unknown length so a runaway source cannot
 * exhaust memory.
 */
export async function collectSamples(
  source: VehicleSignalSource,
  requests: SignalRequest[],
  maxSweeps = 100_000
): Promise<VehicleSignalSample[]> {
  const samples: VehicleSignalSample[] = [];
  for (let i = 0; i < maxSweeps; i++) {
    const sweep = await source.readSweep(requests);
    if (!sweep) break;
    samples.push(...sweep.samples);
  }
  return samples;
}
