import { describe, expect, it } from "vitest";
import { TraceReplaySource, collectSamples } from "../core/signalSource";
import { generateHistory, vanosWearFault } from "../core/syntheticTrace";
import {
  groupBySweep,
  isCorrelatable,
  parseTrace,
  serializeTrace,
} from "../core/vehicleState";

const VIN = "WBAREPLAY00000001";

describe("TraceReplaySource", () => {
  const trace = generateHistory({
    vin: VIN,
    sessionCount: 1,
    onsetSessionIndex: null,
  })[0];

  it("replays sweeps in recorded order", async () => {
    const source = new TraceReplaySource(trace);
    await source.open();

    const first = await source.readSweep([]);
    const second = await source.readSweep([]);

    expect(first?.sweep).toBe(0);
    expect(second?.sweep).toBe(1);
    await source.close();
  });

  it("returns null once exhausted rather than blocking or repeating", async () => {
    const short = generateHistory({
      vin: VIN,
      sessionCount: 1,
      onsetSessionIndex: null,
    })[0];
    const source = new TraceReplaySource({
      header: short.header,
      samples: short.samples.slice(0, 12),
    });
    await source.open();

    expect(await source.readSweep([])).not.toBeNull();
    expect(await source.readSweep([])).toBeNull();
    await source.close();
  });

  it("restamps replayed samples so they cannot be mistaken for live data", async () => {
    const source = new TraceReplaySource(trace);
    await source.open();
    const sweep = await source.readSweep([]);

    expect(sweep?.samples.every(s => s.source === "replay")).toBe(true);
    await source.close();
  });

  it("preserves the original stamp when explicitly asked", async () => {
    const source = new TraceReplaySource(trace, { preserveSource: true });
    await source.open();
    const sweep = await source.readSweep([]);

    expect(sweep?.samples.every(s => s.source === "synthetic")).toBe(true);
    await source.close();
  });

  it("filters to the requested signals", async () => {
    const source = new TraceReplaySource(trace);
    await source.open();

    const sweep = await source.readSweep([{ ecu: "DME", signal: "RPM" }]);
    expect(sweep?.samples).toHaveLength(1);
    expect(sweep?.samples[0].signal).toBe("RPM");
    await source.close();
  });

  it("yields nothing for a signal the recording does not contain, rather than substituting", async () => {
    const source = new TraceReplaySource(trace);
    await source.open();

    const sweep = await source.readSweep([
      { ecu: "DME", signal: "NOT_RECORDED" },
    ]);
    expect(sweep?.samples).toHaveLength(0);
    await source.close();
  });

  it("refuses to read before it is opened", async () => {
    const source = new TraceReplaySource(trace);
    await expect(source.readSweep([])).rejects.toThrow(/not open/);
  });

  it("advertises the signals the recording actually holds", () => {
    const source = new TraceReplaySource(trace);
    expect(source.capabilities.availableSignals).toContain("DME:RPM");
    expect(source.capabilities.availableSignals).toContain(
      "DME:VANOS_EX_SETTLE_MS"
    );
  });
});

describe("replay round trip through the file format", () => {
  it("survives serialisation and reproduces the same readings", async () => {
    const original = generateHistory({
      vin: VIN,
      sessionCount: 1,
      onsetSessionIndex: 0,
      fault: vanosWearFault,
    })[0];

    const { trace: reloaded } = parseTrace(serializeTrace(original));
    const source = new TraceReplaySource(reloaded, { preserveSource: true });
    await source.open();

    const replayed = await collectSamples(source, []);
    expect(replayed).toEqual(original.samples);
    await source.close();
  });

  it("preserves the recorded skew, so correlation stays decidable after replay", async () => {
    // Skew is a property of how the data was captured; a replay that quietly
    // re-timestamped samples would make every recording look correlatable.
    const skewed = generateHistory({
      vin: VIN,
      sessionCount: 1,
      onsetSessionIndex: null,
      intraSweepSkewMs: 40,
    })[0];

    const source = new TraceReplaySource(skewed);
    await source.open();
    const sweep = await source.readSweep([]);
    await source.close();

    expect(sweep).not.toBeNull();
    expect(isCorrelatable(sweep!.samples)).toBe(false);
  });

  it("keeps sweep grouping intact", async () => {
    const trace = generateHistory({
      vin: VIN,
      sessionCount: 1,
      onsetSessionIndex: null,
    })[0];
    const sweepsInFile = groupBySweep(trace.samples).size;

    const source = new TraceReplaySource(trace);
    await source.open();

    let count = 0;
    while ((await source.readSweep([])) !== null) count++;
    await source.close();

    expect(count).toBe(sweepsInFile);
  });
});
