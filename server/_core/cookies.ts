import type { CookieOptions, Request } from "express";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function isIpAddress(host: string) {
  // Basic IPv4 check and IPv6 presence detection.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;
  return host.includes(":");
}

export function isSecureRequest(req: Request) {
  if (req.protocol === "https") return true;

  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;

  const protoList = Array.isArray(forwardedProto)
    ? forwardedProto
    : forwardedProto.split(",");

  return protoList.some(proto => proto.trim().toLowerCase() === "https");
}

/** True for plain-HTTP requests to localhost, i.e. local development. */
function isLocalDevRequest(req: Request) {
  const host = req.hostname ?? "";
  return !isSecureRequest(req) && (LOCAL_HOSTS.has(host) || isIpAddress(host));
}

/**
 * Options for the session cookie.
 *
 * `sameSite` is chosen per request rather than fixed:
 * - Over HTTPS the cookie is `None; Secure`, which the deployment needs because
 *   the app and its gateway are not always same-site.
 * - Over plain HTTP (local development) `None` without `Secure` is rejected
 *   outright by browsers, which used to make local login fail silently. `Lax`
 *   is both accepted and the safer default there.
 *
 * `SameSite=None` means the cookie rides along on cross-site requests, so CSRF
 * protection cannot come from the cookie policy — see requireSameOrigin in
 * csrf.ts, which guards every state-changing endpoint.
 */
export function getSessionCookieOptions(
  req: Request
): Pick<CookieOptions, "domain" | "httpOnly" | "path" | "sameSite" | "secure"> {
  const secure = isSecureRequest(req);

  return {
    httpOnly: true,
    path: "/",
    sameSite: secure ? "none" : "lax",
    secure,
  };
}

/**
 * Options for the OAuth state cookie.
 *
 * Always `Lax`: the cookie only has to survive the redirect back from the OAuth
 * portal, which is a top-level GET navigation.
 */
export function getOAuthStateCookieOptions(
  req: Request
): Pick<CookieOptions, "httpOnly" | "path" | "sameSite" | "secure"> {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: isSecureRequest(req),
  };
}

export { isLocalDevRequest };
