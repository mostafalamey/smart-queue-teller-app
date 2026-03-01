/**
 * AuthContext — central authentication state for the Teller App.
 *
 * Responsibilities:
 * - Stores access token in memory only (never written to disk).
 * - Persists refresh token via Electron safeStorage (OS-encrypted).
 * - On app launch: reads stored refresh token → silent refresh → sets state.
 * - Proactive access-token refresh at ACCESS_TOKEN_REFRESH_THRESHOLD of TTL.
 * - Exposes: user, isAuthenticated, isLoading, accessToken getters; login() / logout() / changePassword().
 * - Listens for `auth:unauthorized` custom DOM event (emitted by ApiClient on 401 retry failure).
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { createAuthProvider } from "../data/auth-provider";
import { createApiClient } from "../data/api-client";
import type {
  ApiError,
  AuthUser,
  ChangePasswordInput,
  LoginInput,
} from "../data/types";
import {
  ACCESS_TOKEN_REFRESH_THRESHOLD,
  SECURE_STORAGE_REFRESH_TOKEN_KEY,
} from "../lib/constants";

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

interface AuthState {
  user: AuthUser | null;
  /** In-memory access token */
  accessToken: string | null;
  /** Seconds until access token expires */
  accessTokenExpiresInSeconds: number | null;
  isAuthenticated: boolean;
  /** True during initial silent-refresh check on app launch */
  isBootstrapping: boolean;
  /** True when an explicit login/logout action is in flight */
  isLoading: boolean;
  error: ApiError | null;
}

export interface AuthContextValue extends AuthState {
  login(input: LoginInput): Promise<void>;
  logout(): Promise<void>;
  changePassword(input: ChangePasswordInput): Promise<void>;
  clearError(): void;
  /** Direct accessor used by ApiClient for token refresh */
  getAccessToken(): string | null;
  /** Called by ApiClient when it needs to perform a silent refresh */
  refreshAccessToken(): Promise<string>;
}

/* -------------------------------------------------------------------------- */
/*  Context                                                                   */
/* -------------------------------------------------------------------------- */

const AuthContext = createContext<AuthContextValue | null>(null);

/* -------------------------------------------------------------------------- */
/*  Provider                                                                  */
/* -------------------------------------------------------------------------- */

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    accessToken: null,
    accessTokenExpiresInSeconds: null,
    isAuthenticated: false,
    isBootstrapping: true,
    isLoading: false,
    error: null,
  });

  /* ---- Refs — stable across renders ------------------------------------ */
  const accessTokenRef = useRef<string | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ---- Auth provider & API base URL ------------------------------------ */
  const apiBaseUrl =
    window.tellerRuntime?.config.apiBaseUrl ?? "http://localhost:3000";
  const authProvider = createAuthProvider(apiBaseUrl);

  /* ---------------------------------------------------------------------- */
  /*  Helpers                                                                */
  /* ---------------------------------------------------------------------- */

  const clearRefreshTimer = useCallback(() => {
    if (refreshTimerRef.current !== null) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  }, []);

  /**
   * Store auth state in memory and queue a proactive refresh timer.
   */
  const applyAuthResult = useCallback(
    (
      user: AuthUser,
      accessToken: string,
      expiresInSeconds: number,
      refreshToken: string,
    ) => {
      // Store tokens
      accessTokenRef.current = accessToken;

      // Persist refresh token via Electron safeStorage
      window.tellerRuntime?.secureStorage
        .set(SECURE_STORAGE_REFRESH_TOKEN_KEY, refreshToken)
        .catch((err: unknown) => {
          console.error("[auth] Failed to persist refresh token:", err);
        });

      // Update React state
      setState((prev) => ({
        ...prev,
        user,
        accessToken,
        accessTokenExpiresInSeconds: expiresInSeconds,
        isAuthenticated: true,
        isBootstrapping: false,
        isLoading: false,
        error: null,
      }));

      // Schedule proactive refresh
      clearRefreshTimer();
      const refreshDelay =
        expiresInSeconds * ACCESS_TOKEN_REFRESH_THRESHOLD * 1000;

      refreshTimerRef.current = setTimeout(() => {
        // Attempt silent background refresh
        void silentRefreshFromStorage();
      }, refreshDelay);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clearRefreshTimer],
  );

  /**
   * Reads the stored refresh token and performs a silent access-token refresh.
   * Returns the new access token on success.
   * Throws `ApiError` if no stored token or refresh fails.
   */
  const silentRefreshFromStorage = useCallback(async (): Promise<string> => {
    const storedRefreshToken = await window.tellerRuntime?.secureStorage
      .get(SECURE_STORAGE_REFRESH_TOKEN_KEY)
      .catch(() => null);

    if (!storedRefreshToken) {
      throw { code: "FORBIDDEN", message: "No stored refresh token" };
    }

    const result = await authProvider.refresh({ refreshToken: storedRefreshToken });
    applyAuthResult(
      result.user,
      result.auth.accessToken,
      result.auth.accessTokenExpiresInSeconds,
      result.auth.refreshToken,
    );
    return result.auth.accessToken;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applyAuthResult]);

  /* ---------------------------------------------------------------------- */
  /*  App bootstrap — attempt silent sign-in from stored refresh token      */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      try {
        await silentRefreshFromStorage();
      } catch {
        // No stored token or refresh failed — user must log in manually
        if (!cancelled) {
          setState((prev) => ({
            ...prev,
            isBootstrapping: false,
          }));
        }
      }
    };

    void bootstrap();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------------------------------------------------------------- */
  /*  Listen for `auth:unauthorized` from ApiClient                        */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    const handleUnauthorized = () => {
      void performLogout(true /* forced */);
    };
    window.addEventListener("auth:unauthorized", handleUnauthorized);
    return () => {
      window.removeEventListener("auth:unauthorized", handleUnauthorized);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------------------------------------------------------------- */
  /*  Cleanup on unmount                                                     */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    return () => {
      clearRefreshTimer();
    };
  }, [clearRefreshTimer]);

  /* ---------------------------------------------------------------------- */
  /*  Actions                                                                */
  /* ---------------------------------------------------------------------- */

  const login = useCallback(
    async (input: LoginInput): Promise<void> => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));
      try {
        const result = await authProvider.login(input);
        applyAuthResult(
          result.user,
          result.auth.accessToken,
          result.auth.accessTokenExpiresInSeconds,
          result.auth.refreshToken,
        );
      } catch (err) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: err as ApiError,
        }));
        throw err;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [applyAuthResult],
  );

  const performLogout = useCallback(
    async (forced = false): Promise<void> => {
      clearRefreshTimer();

      const currentAccessToken = accessTokenRef.current;
      const storedRefreshToken = await window.tellerRuntime?.secureStorage
        .get(SECURE_STORAGE_REFRESH_TOKEN_KEY)
        .catch(() => null);

      // Clear memory immediately (don't wait for server response)
      accessTokenRef.current = null;
      setState({
        user: null,
        accessToken: null,
        accessTokenExpiresInSeconds: null,
        isAuthenticated: false,
        isBootstrapping: false,
        isLoading: false,
        error: forced
          ? {
              code: "FORBIDDEN",
              message: "Your session has expired. Please sign in again.",
            }
          : null,
      });

      // Clear secure storage
      await window.tellerRuntime?.secureStorage
        .delete(SECURE_STORAGE_REFRESH_TOKEN_KEY)
        .catch(() => undefined);

      // Fire-and-forget server-side revocation
      if (storedRefreshToken && currentAccessToken) {
        void authProvider
          .logout(storedRefreshToken, currentAccessToken)
          .catch((err: unknown) => {
            console.warn("[auth] Server-side logout failed (ignored):", err);
          });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clearRefreshTimer],
  );

  const logout = useCallback(() => performLogout(false), [performLogout]);

  const changePassword = useCallback(
    async (input: ChangePasswordInput): Promise<void> => {
      const token = accessTokenRef.current;
      if (!token) throw { code: "FORBIDDEN", message: "Not authenticated" };
      setState((prev) => ({ ...prev, isLoading: true, error: null }));
      try {
        await authProvider.changePassword(input, token);
        // Mark mustChangePassword as resolved
        setState((prev) => ({
          ...prev,
          isLoading: false,
          user: prev.user
            ? { ...prev.user, mustChangePassword: false }
            : null,
        }));
      } catch (err) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: err as ApiError,
        }));
        throw err;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  const getAccessToken = useCallback(() => accessTokenRef.current, []);

  const refreshAccessToken = useCallback(
    () => silentRefreshFromStorage(),
    [silentRefreshFromStorage],
  );

  /* ---------------------------------------------------------------------- */
  /*  Build the singleton ApiClient and expose it on context               */
  /* ---------------------------------------------------------------------- */
  // (ApiClient is created here so providers/hooks can import it from context)
  const apiClientRef = useRef(
    createApiClient({
      baseUrl: apiBaseUrl,
      getAccessToken: () => accessTokenRef.current,
      refreshAccessToken: () => silentRefreshFromStorage(),
    }),
  );

  // Keep the apiClient reference stable but update callbacks when they change
  // (callbacks are already stable refs via useCallback)

  const value: AuthContextValue = {
    ...state,
    login,
    logout,
    changePassword,
    clearError,
    getAccessToken,
    refreshAccessToken,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/* -------------------------------------------------------------------------- */
/*  Hooks                                                                     */
/* -------------------------------------------------------------------------- */

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx)
    throw new Error("useAuth must be used within an <AuthProvider>");
  return ctx;
}

/**
 * Convenience hook that returns the singleton ApiClient shared across the app.
 * The client is already configured with auth interceptors.
 */
export { AuthContext };
