/**
 * Authenticated HTTP client for the Teller App.
 *
 * Features:
 * - Attaches `Authorization: Bearer <accessToken>` to all requests.
 * - Intercepts 401 responses and attempts a single silent token refresh,
 *   then retries the original request once.
 * - Configurable timeout (default 8 s).
 * - Parses typed `ApiError` objects from backend error responses.
 * - Emits `auth:unauthorized` custom event when refresh also fails so that
 *   the AuthContext can force-logout.
 */

import type { ApiError, ApiErrorCode } from "./types";
import { DEFAULT_REQUEST_TIMEOUT_MS } from "../lib/constants";

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

export interface ApiClientConfig {
  /** e.g. "http://localhost:3000" — no trailing slash */
  baseUrl: string;
  /** Returns the current in-memory access token (or null). */
  getAccessToken(): string | null;
  /**
   * Called when the client needs a fresh access token (silent refresh).
   * Returns the new access token or throws if refresh cannot be performed.
   */
  refreshAccessToken(): Promise<string>;
  /** Milliseconds before a request is aborted. Default: 8000 */
  timeoutMs?: number;
}

type RequestMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

interface RequestOptions {
  /** Additional headers merged on top of defaults */
  headers?: Record<string, string>;
  /** Whether to skip attaching the Authorization header (e.g. login endpoint) */
  skipAuth?: boolean;
  /** Override timeout for this specific request */
  timeoutMs?: number;
  /** Whether this is a retry after token refresh (prevents infinite loops) */
  _isRetry?: boolean;
}

/* -------------------------------------------------------------------------- */
/*  Error helpers                                                             */
/* -------------------------------------------------------------------------- */

function buildApiError(
  code: ApiErrorCode,
  message: string,
  status?: number,
  extra?: Partial<ApiError>,
): ApiError {
  return { code, message, status, ...extra };
}

async function parseErrorResponse(res: Response): Promise<ApiError> {
  let body: { code?: string; message?: string; lockedUntilSeconds?: number } =
    {};

  try {
    body = (await res.json()) as typeof body;
  } catch {
    /* JSON parse failure — use generic message */
  }

  const code = (body.code ?? "UNKNOWN") as ApiErrorCode;
  const message =
    body.message ?? `Request failed with status ${res.status}`;

  return buildApiError(code, message, res.status, {
    lockedUntilSeconds: body.lockedUntilSeconds,
  });
}

/* -------------------------------------------------------------------------- */
/*  ApiClient class                                                           */
/* -------------------------------------------------------------------------- */

export class ApiClient {
  private readonly baseUrl: string;
  private readonly getAccessToken: () => string | null;
  private readonly refreshAccessToken: () => Promise<string>;
  private readonly timeoutMs: number;

  /** Tracks an in-flight silent refresh so concurrent 401s share one refresh */
  private refreshPromise: Promise<string> | null = null;

  constructor(config: ApiClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.getAccessToken = config.getAccessToken;
    this.refreshAccessToken = config.refreshAccessToken;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  }

  /* ---------------------------------------------------------------------- */
  /*  Public request methods                                                 */
  /* ---------------------------------------------------------------------- */

  async get<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>("GET", path, undefined, options);
  }

  async post<T>(
    path: string,
    body?: unknown,
    options?: RequestOptions,
  ): Promise<T> {
    return this.request<T>("POST", path, body, options);
  }

  async put<T>(
    path: string,
    body?: unknown,
    options?: RequestOptions,
  ): Promise<T> {
    return this.request<T>("PUT", path, body, options);
  }

  async delete<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>("DELETE", path, undefined, options);
  }

  /* ---------------------------------------------------------------------- */
  /*  Core request implementation                                            */
  /* ---------------------------------------------------------------------- */

  private async request<T>(
    method: RequestMethod,
    path: string,
    body?: unknown,
    options: RequestOptions = {},
  ): Promise<T> {
    const { skipAuth = false, timeoutMs, _isRetry = false } = options;
    const effectiveTimeout = timeoutMs ?? this.timeoutMs;

    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      effectiveTimeout,
    );

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...options.headers,
    };

    if (!skipAuth) {
      const token = this.getAccessToken();
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
    }

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        throw buildApiError(
          "TIMEOUT",
          `Request to ${path} timed out after ${effectiveTimeout}ms`,
        );
      }
      throw buildApiError(
        "NETWORK_ERROR",
        (err as Error).message ?? "Network request failed",
      );
    } finally {
      clearTimeout(timeoutId);
    }

    /* ---- 401 handling — attempt silent token refresh ------------------- */
    if (res.status === 401 && !skipAuth && !_isRetry) {
      try {
        const newToken = await this.silentRefresh();
        // Retry original request with the new token
        return this.request<T>(method, path, body, {
          ...options,
          headers: { ...options.headers, Authorization: `Bearer ${newToken}` },
          _isRetry: true,
        });
      } catch {
        // Refresh failed → force logout via custom event
        window.dispatchEvent(new CustomEvent("auth:unauthorized"));
        throw buildApiError(
          "FORBIDDEN",
          "Session expired. Please sign in again.",
          401,
        );
      }
    }

    /* ---- Non-2xx error handling ---------------------------------------- */
    if (!res.ok) {
      throw await parseErrorResponse(res);
    }

    /* ---- 204 No Content ------------------------------------------------- */
    if (res.status === 204) {
      return undefined as unknown as T;
    }

    return res.json() as Promise<T>;
  }

  /* ---------------------------------------------------------------------- */
  /*  Silent refresh — shared in-flight promise                             */
  /* ---------------------------------------------------------------------- */

  private silentRefresh(): Promise<string> {
    if (!this.refreshPromise) {
      this.refreshPromise = this.refreshAccessToken().finally(() => {
        this.refreshPromise = null;
      });
    }
    return this.refreshPromise;
  }
}

/* -------------------------------------------------------------------------- */
/*  Factory                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Create the singleton ApiClient used throughout the renderer.
 * Called once from AuthContext after the runtime config is available.
 */
export function createApiClient(config: ApiClientConfig): ApiClient {
  return new ApiClient(config);
}
