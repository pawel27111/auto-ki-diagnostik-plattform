import type { NextFunction, Request, Response } from "express";
import { ENV } from "./env";

/**
 * Origin check for state-changing requests.
 *
 * The session cookie is `SameSite=None` in production (the deployment is not
 * always same-site with its gateway), so the browser attaches it to cross-site
 * requests too. That removes the cookie policy as a CSRF defence, and this
 * check replaces it: every mutating request must carry an Origin or Referer
 * this server recognises.
 *
 * Fetch and XHR always send `Origin` on cross-origin requests and cannot forge
 * it, while a cross-site form post cannot set the JSON content type tRPC needs.
 */

function allowedOrigins(req: Request): Set<string> {
  const origins = new Set(ENV.allowedOrigins);

  // The deployment's own origin, derived from the proxy headers.
  const forwardedProto = req.headers["x-forwarded-proto"];
  const proto = Array.isArray(forwardedProto)
    ? forwardedProto[0]
    : (forwardedProto?.split(",")[0].trim() ?? req.protocol);
  const host = req.headers["x-forwarded-host"] ?? req.headers.host;
  if (typeof host === "string" && host.length > 0) {
    origins.add(`${proto}://${host}`);
  }

  return origins;
}

function originOf(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function requireSameOrigin(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Safe methods do not change state, so they do not need the check.
  if (
    req.method === "GET" ||
    req.method === "HEAD" ||
    req.method === "OPTIONS"
  ) {
    next();
    return;
  }

  const candidate =
    originOf(req.headers.origin) ?? originOf(req.headers.referer);

  if (!candidate) {
    // Browsers always send one of the two on a cross-origin mutation. Absence
    // means a non-browser client, which is not what CSRF targets — but in
    // production we still refuse rather than guess.
    if (ENV.isProduction) {
      res.status(403).json({ error: "Missing Origin header" });
      return;
    }
    next();
    return;
  }

  if (!allowedOrigins(req).has(candidate)) {
    console.warn(
      `[CSRF] Rejected ${req.method} ${req.path} from origin ${candidate}`
    );
    res.status(403).json({ error: "Cross-origin request rejected" });
    return;
  }

  next();
}
