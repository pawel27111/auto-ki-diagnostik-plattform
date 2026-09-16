import type { Express } from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { COOKIE_NAME } from "../../shared/const";

/**
 * The development login hands out a session to anyone who asks, so the tests
 * that matter are the ones proving it stays switched off unless it was asked
 * for explicitly, and that it cannot be reached in production at all.
 *
 * ENV is read from process.env at import time, so every case sets the
 * environment and then re-imports the modules under test.
 */

type Handler = (req: FakeRequest, res: FakeResponse) => void;

interface FakeRequest {
  query: Record<string, string>;
  headers: Record<string, string | undefined>;
  protocol: string;
  hostname: string;
}

interface ResponseState {
  status: number | null;
  redirectedTo: string | null;
  cookies: { name: string; value: string; options: Record<string, unknown> }[];
  body: unknown;
}

interface FakeResponse {
  cookie: (n: string, v: string, o: Record<string, unknown>) => void;
  clearCookie: (n: string, o?: Record<string, unknown>) => void;
  redirect: (code: number, url: string) => void;
  status: (code: number) => FakeResponse;
  json: (body: unknown) => void;
}

function createRequest(): FakeRequest {
  return {
    query: {},
    headers: { host: "192.168.1.42:3000" },
    protocol: "http",
    hostname: "192.168.1.42",
  };
}

/**
 * `done` resolves once the handler has produced a response.
 *
 * The route is fire-and-forget, so awaiting the terminal call is the only way
 * to observe the finished state; sleeping instead lets assertions run while the
 * handler is still mid-flight.
 */
function createResponse(): {
  res: FakeResponse;
  state: ResponseState;
  done: Promise<void>;
} {
  const state: ResponseState = {
    status: null,
    redirectedTo: null,
    cookies: [],
    body: null,
  };

  let finish!: () => void;
  const done = new Promise<void>(resolve => {
    finish = resolve;
  });

  const res: FakeResponse = {
    cookie: (name, value, options) => {
      state.cookies.push({ name, value, options });
    },
    clearCookie: () => {},
    redirect: (code, url) => {
      state.status = code;
      state.redirectedTo = url;
      finish();
    },
    status: code => {
      state.status = code;
      return res;
    },
    json: body => {
      state.body = body;
      finish();
    },
  };

  return { res, state, done };
}

/** The session cookie, if the handler set one. */
function sessionCookie(state: ResponseState) {
  return state.cookies.find(cookie => cookie.name === COOKIE_NAME);
}

const BASE_ENV = {
  JWT_SECRET: "0123456789abcdef0123456789abcdef0123456789",
  DATABASE_URL: "mysql://user:pass@localhost:3306/autoki",
  VITE_APP_ID: undefined,
  OAUTH_SERVER_URL: undefined,
  DEV_AUTH_ENABLED: undefined,
  NODE_ENV: "development",
} satisfies Record<string, string | undefined>;

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  vi.resetModules();
  vi.doUnmock("../db");
});

/** Applies `env`, re-imports the route module and returns the login handler. */
async function loadLoginRoute(env: Record<string, string | undefined>) {
  process.env = { ...originalEnv };
  for (const [key, value] of Object.entries({ ...BASE_ENV, ...env })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  vi.resetModules();

  const upsertUser = vi.fn(async () => {});
  vi.doMock("../db", () => ({ upsertUser }));

  const { registerOAuthRoutes } = await import("../_core/oauth");

  // Only `get` is exercised; the rest of the Express surface is not reached.
  const routes = new Map<string, Handler>();
  registerOAuthRoutes({
    get: (path: string, handler: Handler) => routes.set(path, handler),
  } as unknown as Express);

  const login = routes.get("/api/oauth/login");
  if (!login) throw new Error("login route was not registered");
  return { login, upsertUser };
}

describe("development login", () => {
  it("is off by default — login still redirects to the OAuth portal", async () => {
    const { login, upsertUser } = await loadLoginRoute({
      VITE_APP_ID: "real-app",
      OAUTH_SERVER_URL: "https://oauth.example.com",
    });

    const { res, state, done } = createResponse();
    login(createRequest(), res);
    await done;

    expect(state.redirectedTo).toContain("https://oauth.example.com");
    expect(sessionCookie(state)).toBeUndefined();
    expect(upsertUser).not.toHaveBeenCalled();
  });

  it("issues a session cookie when explicitly enabled outside production", async () => {
    const { login, upsertUser } = await loadLoginRoute({
      DEV_AUTH_ENABLED: "true",
    });

    const { res, state, done } = createResponse();
    login(createRequest(), res);
    await done;

    // The user row must exist before the cookie is handed out, or the first
    // authenticated request would fall back to the OAuth server this bypasses.
    expect(upsertUser).toHaveBeenCalledOnce();
    expect(sessionCookie(state)?.value).toBeTruthy();
    expect(state.redirectedTo).toBe("/dashboard");
  });

  it("refuses to sign anyone in when NODE_ENV is production", async () => {
    const { login, upsertUser } = await loadLoginRoute({
      DEV_AUTH_ENABLED: "true",
      NODE_ENV: "production",
      VITE_APP_ID: "real-app",
      OAUTH_SERVER_URL: "https://oauth.example.com",
    });

    const { res, state, done } = createResponse();
    login(createRequest(), res);
    await done;

    // Falls through to the real OAuth redirect, which is the safe outcome —
    // no session is minted and the local user is never touched.
    expect(sessionCookie(state)).toBeUndefined();
    expect(upsertUser).not.toHaveBeenCalled();
    expect(state.redirectedTo).not.toBe("/dashboard");
  });
});

describe("assertRequiredEnv", () => {
  /** Replaces process.exit for one call, recording whether it fired. */
  async function runAssert(env: Record<string, string | undefined>) {
    process.env = { ...originalEnv };
    for (const [key, value] of Object.entries({ ...BASE_ENV, ...env })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }

    vi.resetModules();
    const { assertRequiredEnv } = await import("../_core/env");

    const exit = vi
      .spyOn(process, "exit")
      .mockImplementation((() => {
        throw new Error("process.exit");
      }) as never);
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnings = vi.spyOn(console, "warn").mockImplementation(() => {});

    let exited = false;
    try {
      assertRequiredEnv();
    } catch {
      exited = true;
    } finally {
      exit.mockRestore();
      errors.mockRestore();
      warnings.mockRestore();
    }
    return exited;
  }

  it("refuses to start when the development login is combined with production", async () => {
    expect(
      await runAssert({
        DEV_AUTH_ENABLED: "true",
        NODE_ENV: "production",
        VITE_APP_ID: "real-app",
        OAUTH_SERVER_URL: "https://oauth.example.com",
      })
    ).toBe(true);
  });

  it("waives the OAuth settings when the development login is on", async () => {
    expect(await runAssert({ DEV_AUTH_ENABLED: "true" })).toBe(false);
  });

  it("still demands the OAuth settings when it is off", async () => {
    expect(await runAssert({})).toBe(true);
  });
});
