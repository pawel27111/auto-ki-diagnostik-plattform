/**
 * Environment configuration.
 *
 * Values are read once at import time. {@link assertRequiredEnv} is called
 * during startup so a missing secret fails the boot with a clear message
 * instead of surfacing as a confusing auth error on the first login.
 */

function parseList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map(entry => entry.trim())
    .filter(entry => entry.length > 0);
}

function parseInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Development login bypass.
 *
 * Sign-in normally goes through an external OAuth server, which a local
 * checkout does not have credentials for — leaving no way to obtain a session
 * and therefore no way to exercise the app at all. With this flag the login
 * route issues a session for a fixed local user instead.
 *
 * It is refused outright in production (see {@link assertRequiredEnv}), and the
 * route re-checks before acting, so enabling it by accident on a deployed
 * instance fails the boot rather than silently opening a back door.
 */
const devAuthRequested = process.env.DEV_AUTH_ENABLED === "true";

/** Stand-in client id, so the session JWT still carries a stable `appId`. */
const DEV_APP_ID = "autoki-dev";

export const ENV = {
  appId: process.env.VITE_APP_ID || (devAuthRequested ? DEV_APP_ID : ""),
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",

  /**
   * Origins allowed to open a Socket.io connection. Empty means same-origin
   * only, which is what a single-deployment setup wants.
   */
  allowedOrigins: parseList(process.env.ALLOWED_ORIGINS),

  /**
   * Serial ports the OBD manager may open, as an explicit allow list.
   *
   * The port to open arrives from the browser, so without this a client could
   * name any device file on the server host. Empty disables hardware access.
   */
  obdAllowedPorts: parseList(process.env.OBD_ALLOWED_PORTS),

  /** See {@link devAuthRequested}. Never active in production. */
  devAuth: {
    enabled: devAuthRequested,
    openId: process.env.DEV_AUTH_OPEN_ID || "dev-user",
    name: process.env.DEV_AUTH_NAME || "Entwickler",
    email: process.env.DEV_AUTH_EMAIL || "dev@localhost",
  },

  llm: {
    provider: (process.env.LLM_PROVIDER ?? "auto") as
      | "openrouter"
      | "lmstudio"
      | "auto",
    openRouterApiKey: process.env.OPENROUTER_API_KEY ?? "",
    openRouterModel: process.env.OPENROUTER_MODEL ?? "",
    lmStudioBaseUrl: process.env.LMSTUDIO_BASE_URL ?? "",
    lmStudioModel: process.env.LMSTUDIO_MODEL ?? "",
    /** Analyses per user per hour. */
    rateLimitPerHour: parseInteger(process.env.LLM_RATE_LIMIT_PER_HOUR, 60),
  },
} as const;

/**
 * Variables the server cannot run without.
 *
 * The two OAuth values are only needed for the real sign-in flow, so they are
 * waived when the development login is active — that is the whole point of it.
 */
const REQUIRED_VARS: {
  key: string;
  value: string;
  hint: string;
  waivedByDevAuth?: boolean;
}[] = [
  {
    key: "JWT_SECRET",
    value: ENV.cookieSecret,
    hint: "used to sign session cookies; use at least 32 random characters",
  },
  {
    key: "VITE_APP_ID",
    value: ENV.appId,
    hint: "OAuth client id for this app",
    waivedByDevAuth: true,
  },
  {
    key: "OAUTH_SERVER_URL",
    value: ENV.oAuthServerUrl,
    hint: "base URL of the OAuth server",
    waivedByDevAuth: true,
  },
  {
    key: "DATABASE_URL",
    value: ENV.databaseUrl,
    hint: "mysql://user:pass@host:3306/database",
  },
];

const MIN_SECRET_LENGTH = 32;

/**
 * Validate configuration and abort the process when something required is
 * missing. Called from the server entry point before any listener is bound.
 */
export function assertRequiredEnv(): void {
  const problems: string[] = [];

  // Checked first and fatally: a production instance that accepts an
  // unauthenticated login is worse than one that refuses to start.
  if (ENV.devAuth.enabled && ENV.isProduction) {
    console.error(
      "[Env] DEV_AUTH_ENABLED is set while NODE_ENV=production. The development\n" +
        "      login grants a session to anyone who opens /api/oauth/login, so it\n" +
        "      must never run in production. Refusing to start."
    );
    process.exit(1);
  }

  for (const { key, value, hint, waivedByDevAuth } of REQUIRED_VARS) {
    if (value) continue;
    if (waivedByDevAuth && ENV.devAuth.enabled) continue;
    problems.push(`  ${key} is not set — ${hint}`);
  }

  if (ENV.devAuth.enabled) {
    console.warn(
      `[Env] Development login is ENABLED — /api/oauth/login signs in as ` +
        `"${ENV.devAuth.openId}" without any credentials. For local testing only.`
    );
  }

  if (ENV.cookieSecret && ENV.cookieSecret.length < MIN_SECRET_LENGTH) {
    problems.push(
      `  JWT_SECRET is only ${ENV.cookieSecret.length} characters — use at least ${MIN_SECRET_LENGTH}`
    );
  }

  if (ENV.isProduction && ENV.allowedOrigins.length === 0) {
    console.warn(
      "[Env] ALLOWED_ORIGINS is empty: WebSocket connections are restricted to same-origin requests."
    );
  }

  if (problems.length > 0) {
    console.error(
      `[Env] Cannot start, ${problems.length} configuration problem(s):\n${problems.join("\n")}`
    );
    console.error(
      "[Env] See .env.example for the full list of supported variables."
    );
    process.exit(1);
  }
}
