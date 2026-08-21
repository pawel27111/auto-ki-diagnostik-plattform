import type { NextFunction, Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The middleware reads ENV at call time, so configure it before importing.
process.env.ALLOWED_ORIGINS = "https://app.example.com";
const { requireSameOrigin } = await import("../_core/csrf");

function run(overrides: Partial<Request>) {
  const req = {
    method: "POST",
    path: "/api/trpc/obd.vehicles.create",
    protocol: "https",
    headers: { host: "autoki.example.com" },
    ...overrides,
  } as unknown as Request;

  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;

  const next = vi.fn() as unknown as NextFunction;

  requireSameOrigin(req, res, next);
  return { res, next };
}

describe("requireSameOrigin", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lets safe methods through without an Origin", () => {
    const { next, res } = run({
      method: "GET",
      headers: { host: "autoki.example.com" },
    });
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("accepts a mutation from the deployment's own origin", () => {
    const { next } = run({
      headers: {
        host: "autoki.example.com",
        origin: "https://autoki.example.com",
      },
    });
    expect(next).toHaveBeenCalled();
  });

  it("accepts a mutation from a configured allowed origin", () => {
    const { next } = run({
      headers: {
        host: "autoki.example.com",
        origin: "https://app.example.com",
      },
    });
    expect(next).toHaveBeenCalled();
  });

  it("rejects a mutation from an unrelated origin", () => {
    const { next, res } = run({
      headers: {
        host: "autoki.example.com",
        origin: "https://evil.example.net",
      },
    });
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("falls back to the Referer when Origin is absent", () => {
    const { next } = run({
      headers: {
        host: "autoki.example.com",
        referer: "https://autoki.example.com/dashboard",
      },
    });
    expect(next).toHaveBeenCalled();
  });

  it("rejects a Referer from an unrelated origin", () => {
    const { next, res } = run({
      headers: {
        host: "autoki.example.com",
        referer: "https://evil.example.net/attack",
      },
    });
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("honours the forwarded proto and host behind a proxy", () => {
    const { next } = run({
      protocol: "http",
      headers: {
        host: "internal:3000",
        "x-forwarded-proto": "https",
        "x-forwarded-host": "autoki.example.com",
        origin: "https://autoki.example.com",
      },
    });
    expect(next).toHaveBeenCalled();
  });

  it("is not fooled by an origin that merely starts with an allowed one", () => {
    const { next, res } = run({
      headers: {
        host: "autoki.example.com",
        origin: "https://autoki.example.com.evil.net",
      },
    });
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
