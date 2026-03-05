/**
 * Auth data provider — HTTP implementation.
 *
 * All calls are routed through the plain `fetch` API (no ApiClient) because
 * auth endpoints either don't need a Bearer token (login) or carry their own
 * credentials (refresh, logout, change-password).
 *
 * Endpoint contract:
 *   POST /auth/login            → LoginResult
 *   POST /auth/refresh          → LoginResult
 *   POST /auth/logout           → { success: boolean }
 *   POST /auth/change-password  → 200 OK (no body)
 */

import type {
  ApiErrorCode,
  ChangePasswordInput,
  LoginInput,
  LoginResult,
  RefreshInput,
} from "./types";

const API_ERROR_CODES = new Set<ApiErrorCode>([
  "INVALID_REQUEST",
  "INVALID_CREDENTIALS",
  "FORBIDDEN",
  "SESSION_EXPIRED",
  "ACCOUNT_LOCKED",
  "ROLE_SELECTION_REQUIRED",
  "QUEUE_EMPTY",
  "INVALID_STATUS_TRANSITION",
  "TICKET_NOT_FOUND",
  "STATION_NOT_FOUND",
  "DEVICE_NOT_CONFIGURED",
  "ACTIVE_TICKET_EXISTS",
  "NETWORK_ERROR",
  "TIMEOUT",
  "UNKNOWN",
]);

function toApiErrorCode(value: unknown): ApiErrorCode {
  if (typeof value === "string" && API_ERROR_CODES.has(value as ApiErrorCode)) {
    return value as ApiErrorCode;
  }
  return "UNKNOWN";
}
import { DEFAULT_REQUEST_TIMEOUT_MS } from "../lib/constants";

/* -------------------------------------------------------------------------- */
/*  Internal helpers                                                           */
/* -------------------------------------------------------------------------- */

async function authRequest<T>(
  baseUrl: string,
  path: string,
  body: unknown,
  bearerToken?: string,
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    DEFAULT_REQUEST_TIMEOUT_MS,
  );

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  if (bearerToken) {
    headers["Authorization"] = `Bearer ${bearerToken}`;
  }

  let res: Response;
  try {
    res = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    const name = (err as Error).name;
    if (name === "AbortError") {
      throw {
        code: "TIMEOUT",
        message: `Auth request timed out after ${DEFAULT_REQUEST_TIMEOUT_MS}ms`,
      };
    }
    throw {
      code: "NETWORK_ERROR",
      message: (err as Error).message ?? "Network request failed",
    };
  } finally {
    clearTimeout(timeoutId);
  }

  if (!res.ok) {
    let body: {
      code?: string;
      message?: string;
      lockedUntilSeconds?: number;
    } = {};
    try {
      body = (await res.json()) as typeof body;
    } catch {
      /* ignore */
    }
    throw {
      code: toApiErrorCode(body.code),
      message: body.message ?? `Request failed with status ${res.status}`,
      status: res.status,
      lockedUntilSeconds: body.lockedUntilSeconds,
    };
  }

  if (res.status === 204) return undefined as unknown as T;
  return res.json() as Promise<T>;
}

/* -------------------------------------------------------------------------- */
/*  Auth provider                                                             */
/* -------------------------------------------------------------------------- */

export interface AuthProvider {
  login(input: LoginInput): Promise<LoginResult>;
  refresh(input: RefreshInput): Promise<LoginResult>;
  logout(refreshToken: string, accessToken: string): Promise<void>;
  changePassword(
    input: ChangePasswordInput,
    accessToken: string,
  ): Promise<void>;
}

export function createAuthProvider(baseUrl: string): AuthProvider {
  const base = baseUrl.replace(/\/$/, "");

  return {
    login(input) {
      return authRequest<LoginResult>(base, "/auth/login", {
        email: input.email,
        password: input.password,
        ...(input.stationId ? { stationId: input.stationId } : {}),
        ...(input.requestedRole ? { requestedRole: input.requestedRole } : {}),
      });
    },

    refresh(input) {
      return authRequest<LoginResult>(base, "/auth/refresh", {
        refreshToken: input.refreshToken,
        ...(input.stationId ? { stationId: input.stationId } : {}),
      });
    },

    async logout(refreshToken, accessToken) {
      await authRequest<{ success: boolean }>(
        base,
        "/auth/logout",
        { refreshToken },
        accessToken,
      );
    },

    async changePassword(input, accessToken) {
      await authRequest<void>(
        base,
        "/auth/change-password",
        {
          currentPassword: input.currentPassword,
          newPassword: input.newPassword,
          ...(input.name ? { name: input.name } : {}),
        },
        accessToken,
      );
    },
  };
}
