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

export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
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

/** Variables the server cannot run without, regardless of environment. */
const REQUIRED_VARS: { key: string; value: string; hint: string }[] = [
  {
    key: "JWT_SECRET",
    value: ENV.cookieSecret,
    hint: "used to sign session cookies; use at least 32 random characters",
  },
  {
    key: "VITE_APP_ID",
    value: ENV.appId,
    hint: "OAuth client id for this app",
  },
  {
    key: "OAUTH_SERVER_URL",
    value: ENV.oAuthServerUrl,
    hint: "base URL of the OAuth server",
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

  for (const { key, value, hint } of REQUIRED_VARS) {
    if (!value) problems.push(`  ${key} is not set — ${hint}`);
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
