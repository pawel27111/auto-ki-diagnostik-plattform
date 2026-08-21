/**
 * In-memory sliding-window rate limiter.
 *
 * Sufficient for a single-process deployment. Running more than one instance
 * needs a shared store (Redis) — the limit here is per process.
 */
export class RateLimiter {
  private hits: Map<string, number[]> = new Map();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number
  ) {}

  /**
   * Record an attempt for `key`.
   *
   * @returns whether the attempt is within the limit, plus seconds until the
   * oldest hit in the window expires so callers can tell the user when to retry.
   */
  check(
    key: string,
    now = Date.now()
  ): { allowed: boolean; retryAfterSeconds: number } {
    const cutoff = now - this.windowMs;
    const recent = (this.hits.get(key) ?? []).filter(
      timestamp => timestamp > cutoff
    );

    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((recent[0] + this.windowMs - now) / 1000)
      );
      return { allowed: false, retryAfterSeconds };
    }

    recent.push(now);
    this.hits.set(key, recent);
    return { allowed: true, retryAfterSeconds: 0 };
  }

  /** Drop entries with no hits left in the window, so the map cannot grow forever. */
  prune(now = Date.now()): void {
    const cutoff = now - this.windowMs;
    for (const [key, timestamps] of this.hits) {
      const recent = timestamps.filter(timestamp => timestamp > cutoff);
      if (recent.length === 0) this.hits.delete(key);
      else this.hits.set(key, recent);
    }
  }
}
