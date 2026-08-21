import { describe, expect, it } from "vitest";
import { toPercent } from "../../client/src/lib/format";

describe("toPercent", () => {
  it("maps a value onto its range", () => {
    expect(toPercent(50, 0, 100)).toBe(50);
    expect(toPercent(0, 0, 100)).toBe(0);
    expect(toPercent(100, 0, 100)).toBe(100);
  });

  it("handles ranges that do not start at zero", () => {
    expect(toPercent(0, -40, 60)).toBe(40);
  });

  it("clamps values outside the range", () => {
    expect(toPercent(150, 0, 100)).toBe(100);
    expect(toPercent(-20, 0, 100)).toBe(0);
  });

  // This is what produced `width: NaN%` in the parameter bars, which browsers
  // discard, leaving the bar at full width for a missing reading.
  it("returns 0 rather than NaN for missing input", () => {
    expect(toPercent(null, 0, 100)).toBe(0);
    expect(toPercent(undefined, 0, 100)).toBe(0);
    expect(toPercent(50, null, null)).toBe(50);
    expect(toPercent(Number.NaN, 0, 100)).toBe(0);
  });

  it("returns 0 for a degenerate range instead of dividing by zero", () => {
    expect(toPercent(5, 10, 10)).toBe(0);
    expect(toPercent(5, 100, 0)).toBe(0);
  });
});
