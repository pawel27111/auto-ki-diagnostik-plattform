import { describe, expect, it } from "vitest";
import { RateLimiter } from "../_core/rateLimit";

describe("RateLimiter", () => {
  it("allows up to the limit and then refuses", () => {
    const limiter = new RateLimiter(3, 1000);
    const now = 1_000_000;

    expect(limiter.check("user", now).allowed).toBe(true);
    expect(limiter.check("user", now).allowed).toBe(true);
    expect(limiter.check("user", now).allowed).toBe(true);
    expect(limiter.check("user", now).allowed).toBe(false);
  });

  it("keeps separate budgets per key", () => {
    const limiter = new RateLimiter(1, 1000);
    const now = 1_000_000;

    expect(limiter.check("a", now).allowed).toBe(true);
    expect(limiter.check("b", now).allowed).toBe(true);
    expect(limiter.check("a", now).allowed).toBe(false);
  });

  it("frees the budget once the window has passed", () => {
    const limiter = new RateLimiter(1, 1000);
    const now = 1_000_000;

    expect(limiter.check("user", now).allowed).toBe(true);
    expect(limiter.check("user", now + 500).allowed).toBe(false);
    expect(limiter.check("user", now + 1001).allowed).toBe(true);
  });

  it("reports when the next attempt will be accepted", () => {
    const limiter = new RateLimiter(1, 10_000);
    const now = 1_000_000;

    limiter.check("user", now);
    const { allowed, retryAfterSeconds } = limiter.check("user", now + 2000);
    expect(allowed).toBe(false);
    expect(retryAfterSeconds).toBe(8);
  });

  it("drops keys with no hits left in the window", () => {
    const limiter = new RateLimiter(1, 1000);
    const now = 1_000_000;

    limiter.check("user", now);
    limiter.prune(now + 5000);
    // A pruned key starts fresh rather than staying blocked.
    expect(limiter.check("user", now + 5000).allowed).toBe(true);
  });
});
