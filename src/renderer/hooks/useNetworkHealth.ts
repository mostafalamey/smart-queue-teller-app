/**
 * useNetworkHealth — combined network status derived from WebSocket connection
 * state + periodic HTTP health-check pings.
 *
 * Status semantics:
 *   "online"   — WebSocket is connected (real-time updates flowing normally).
 *   "degraded" — WebSocket is down but the HTTP server is still reachable
 *                (teller can still mutate; no live updates).
 *   "offline"  — Both WebSocket and HTTP are unreachable.
 *
 * The WebSocket state is the primary indicator because it represents the
 * liveness of the real-time channel. The HTTP ping disambiguates between
 * "server reachable but WS dropped" (degraded) and true network loss (offline).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { ConnectionState } from "./useSocket";

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

export type NetworkStatus = "online" | "degraded" | "offline";

export interface UseNetworkHealthReturn {
  networkStatus: NetworkStatus;
  lastCheckedAt: Date | null;
}

export interface UseNetworkHealthOptions {
  /** Backend base URL used for the HTTP health ping (no trailing slash). */
  apiBaseUrl: string;
  /** Live WebSocket connection state from useSocket. */
  wsConnectionState: ConnectionState;
  /** How often to run the HTTP health ping, in ms. Default: 30_000. */
  pollIntervalMs?: number;
  /** When false, health checks are suspended and status is "offline". */
  enabled: boolean;
}

/* -------------------------------------------------------------------------- */
/*  Hook                                                                      */
/* -------------------------------------------------------------------------- */

export function useNetworkHealth({
  apiBaseUrl,
  wsConnectionState,
  pollIntervalMs = 30_000,
  enabled,
}: UseNetworkHealthOptions): UseNetworkHealthReturn {
  /**
   * null  = not yet checked / no data
   * true  = last ping succeeded
   * false = last ping failed
   */
  const [httpReachable, setHttpReachable] = useState<boolean | null>(null);
  const [lastCheckedAt, setLastCheckedAt] = useState<Date | null>(null);

  // Abort controller ref so we can cancel in-flight pings on unmount/disable.
  const abortRef = useRef<AbortController | null>(null);

  const checkHttp = useCallback(async () => {
    // Abort any previous in-flight request.
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const res = await fetch(`${apiBaseUrl}/health`, {
        signal: ac.signal,
        cache: "no-store",
        // Short timeout via internal signal race is handled by the server
        // timeout; we rely on AbortController for cancellation on unmount.
      });
      setHttpReachable(res.ok);
    } catch (err) {
      // AbortError means this check was intentionally cancelled — don't
      // flip httpReachable to false in that case, just bail silently.
      if (err instanceof Error && err.name === "AbortError") return;
      setHttpReachable(false);
    }
    setLastCheckedAt(new Date());
  }, [apiBaseUrl]);

  /* ---- Periodic health poll -------------------------------------------- */

  useEffect(() => {
    if (!enabled) {
      // Reset so stale ping results don't affect next mount.
      setHttpReachable(null);
      abortRef.current?.abort();
      return;
    }

    // Fire immediately on mount / when re-enabled.
    void checkHttp();

    const intervalId = setInterval(() => void checkHttp(), pollIntervalMs);

    return () => {
      clearInterval(intervalId);
      abortRef.current?.abort();
    };
  }, [enabled, checkHttp, pollIntervalMs]);

  /* ---- Also ping when the browser's network interface comes back online - */

  useEffect(() => {
    if (!enabled) return;
    const handleOnline = () => void checkHttp();
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [enabled, checkHttp]);

  /* ---- Derive combined status ------------------------------------------ */

  let networkStatus: NetworkStatus;

  if (!enabled) {
    networkStatus = "offline";
  } else if (wsConnectionState === "connected") {
    // WS alive → we're fully online regardless of the HTTP ping result.
    networkStatus = "online";
  } else if (httpReachable === true) {
    // HTTP reachable but WS is down/reconnecting → degraded.
    networkStatus = "degraded";
  } else if (httpReachable === false) {
    // Both channels failed → offline.
    networkStatus = "offline";
  } else {
    // httpReachable is null (no ping result yet).
    // Use the WS connecting state as a proxy: if we're trying to connect we
    // can't declare offline yet; otherwise treat as offline.
    networkStatus = wsConnectionState === "connecting" ? "degraded" : "offline";
  }

  return { networkStatus, lastCheckedAt };
}
