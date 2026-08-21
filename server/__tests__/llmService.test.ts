import { describe, expect, it } from "vitest";
import { LLMService } from "../llm/llmService";

/**
 * These exercise the paths that do not need a provider: the fallback catalogue
 * and the severity floor. The HTTP paths are covered by the shape validation in
 * llmService itself, which rejects anything that is not the expected JSON.
 */
describe("LLMService fallback", () => {
  const service = new LLMService({ provider: "auto" });

  it("reports itself unavailable without a configured provider", () => {
    expect(service.isAvailable()).toBe(false);
  });

  it("never throws — an unreachable provider still yields an analysis", async () => {
    const analysis = await service.analyzeErrorCode("P0300", "Misfire");
    expect(analysis.source).toBe("fallback");
    expect(analysis.recommendations.length).toBeGreaterThan(0);
  });

  it("uses the stored entry for a known code", async () => {
    const analysis = await service.analyzeErrorCode("P0420");
    expect(analysis.rootCause).toMatch(/catalytic/i);
    expect(analysis.severity).toBe("error");
  });

  it("stays generic for an unknown code instead of inventing a repair", async () => {
    const analysis = await service.analyzeErrorCode("P0999");
    expect(analysis.estimatedRepairCost).toBe("Unknown");
    expect(analysis.rootCause).toMatch(/no stored interpretation/i);
  });

  it("derives severity from the code for unknown codes", () => {
    expect(service.getDefaultAnalysis("U0100").severity).toBe("error");
    expect(service.getDefaultAnalysis("P0301").severity).toBe("critical");
  });

  it("refuses to switch to a provider that is not configured", () => {
    expect(service.switchProvider("openrouter")).toBe(false);
  });
});
