export const COOKIE_NAME = "app_session_id";
/** Short-lived cookie holding the OAuth CSRF nonce during the login round trip. */
export const OAUTH_STATE_COOKIE = "app_oauth_state";
export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
export const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;
/** Session lifetime. Shorter than the old one year: a leaked cookie stays valid until it expires. */
export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;
export const AXIOS_TIMEOUT_MS = 30_000;
export const UNAUTHED_ERR_MSG = "Please login (10001)";
export const NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";
/** Server-side endpoint that starts the OAuth flow. */
export const LOGIN_PATH = "/api/oauth/login";
