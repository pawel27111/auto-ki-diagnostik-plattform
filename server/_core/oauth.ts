import { OAUTH_STATE_COOKIE, OAUTH_STATE_TTL_MS, SESSION_TTL_MS } from "@shared/const";
import { COOKIE_NAME } from "@shared/const";
import type { Express, Request, Response } from "express";
import { randomUUID } from "node:crypto";
import * as db from "../db";
import { getOAuthStateCookieOptions, getSessionCookieOptions, isSecureRequest } from "./cookies";
import { ENV } from "./env";
import { sdk } from "./sdk";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

function currentOrigin(req: Request): string {
  const forwardedHost = req.headers["x-forwarded-host"];
  const host = (typeof forwardedHost === "string" ? forwardedHost : req.headers.host) ?? "";
  const proto = isSecureRequest(req) ? "https" : "http";
  return `${proto}://${host}`;
}

/**
 * The OAuth `state` parameter.
 *
 * It carries two things: an unguessable nonce that is compared against a cookie
 * on the way back, and the redirect URI the token exchange has to echo. The
 * previous implementation used `base64(redirectUri)` alone, which an attacker
 * could reproduce exactly — so it proved nothing and left the callback open to
 * a login-CSRF, where a victim is silently signed into the attacker's account.
 */
interface OAuthState {
  nonce: string;
  redirectUri: string;
}

function encodeState(state: OAuthState): string {
  return Buffer.from(JSON.stringify(state), "utf8").toString("base64url");
}

function decodeState(raw: string): OAuthState | null {
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as unknown;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof (parsed as OAuthState).nonce !== "string" ||
      typeof (parsed as OAuthState).redirectUri !== "string"
    ) {
      return null;
    }
    return parsed as OAuthState;
  } catch {
    return null;
  }
}

/**
 * Constant-time string comparison, so a mismatch cannot be narrowed down by
 * timing the response.
 */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Only this deployment's own callback, plus any explicitly allowed origin, may
 * be used as a redirect target. Without the check the callback is an open
 * redirect that can be pointed at an attacker's host with a live auth code.
 */
function isAllowedRedirect(req: Request, redirectUri: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(redirectUri);
  } catch {
    return false;
  }

  if (parsed.pathname !== "/api/oauth/callback") return false;

  const allowed = new Set([currentOrigin(req), ...ENV.allowedOrigins]);
  return allowed.has(parsed.origin);
}

export function registerOAuthRoutes(app: Express) {
  /**
   * Start the login flow.
   *
   * Building the authorise URL here rather than in the browser is what makes
   * the nonce meaningful: the server is the only party that knows both the
   * nonce it issued and the cookie it set.
   */
  app.get("/api/oauth/login", (req: Request, res: Response) => {
    const redirectUri = `${currentOrigin(req)}/api/oauth/callback`;
    const nonce = randomUUID();
    const state = encodeState({ nonce, redirectUri });

    res.cookie(OAUTH_STATE_COOKIE, nonce, {
      ...getOAuthStateCookieOptions(req),
      maxAge: OAUTH_STATE_TTL_MS,
    });

    const portalUrl = process.env.VITE_OAUTH_PORTAL_URL ?? ENV.oAuthServerUrl;
    const url = new URL(`${portalUrl.replace(/\/+$/, "")}/app-auth`);
    url.searchParams.set("appId", ENV.appId);
    url.searchParams.set("redirectUri", redirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set("type", "signIn");

    res.redirect(302, url.toString());
  });

  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const rawState = getQueryParam(req, "state");

    if (!code || !rawState) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }

    const state = decodeState(rawState);
    if (!state) {
      res.status(400).json({ error: "Malformed state parameter" });
      return;
    }

    const expectedNonce = req.headers.cookie
      ?.split(";")
      .map(part => part.trim().split("="))
      .find(([name]) => name === OAUTH_STATE_COOKIE)?.[1];

    if (!expectedNonce || !safeEqual(decodeURIComponent(expectedNonce), state.nonce)) {
      console.warn("[OAuth] State nonce mismatch — rejecting callback");
      res.status(403).json({ error: "Invalid or expired login attempt. Please try again." });
      return;
    }

    // Single use: clear it before the exchange so a replayed callback fails.
    res.clearCookie(OAUTH_STATE_COOKIE, getOAuthStateCookieOptions(req));

    if (!isAllowedRedirect(req, state.redirectUri)) {
      console.warn(`[OAuth] Rejected redirect URI: ${state.redirectUri}`);
      res.status(400).json({ error: "Invalid redirect URI" });
      return;
    }

    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state.redirectUri);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);

      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }

      await db.upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: new Date(),
      });

      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: SESSION_TTL_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: SESSION_TTL_MS });

      res.redirect(302, "/dashboard");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}
