/**
 * Application-wide constants for the Teller App renderer.
 */

/* -------------------------------------------------------------------------- */
/*  Secure storage keys                                                       */
/* -------------------------------------------------------------------------- */

/** Key used to persist the refresh token in Electron safeStorage */
export const SECURE_STORAGE_REFRESH_TOKEN_KEY = "auth:refreshToken";

/* -------------------------------------------------------------------------- */
/*  Token refresh timing                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Proactive refresh threshold: refresh the access token when it has consumed
 * this fraction of its lifetime (0.8 = 80 % elapsed → refresh at 12 min for
 * a 15 min TTL).
 */
export const ACCESS_TOKEN_REFRESH_THRESHOLD = 0.8;

/* -------------------------------------------------------------------------- */
/*  Request defaults                                                          */
/* -------------------------------------------------------------------------- */

/** Default request timeout in milliseconds */
export const DEFAULT_REQUEST_TIMEOUT_MS = 8_000;

/* -------------------------------------------------------------------------- */
/*  Retry / back-off                                                         */
/* -------------------------------------------------------------------------- */

export const MAX_REFRESH_RETRY_ATTEMPTS = 3;
export const INITIAL_RETRY_DELAY_MS = 1_000;
