/**
 * StationContext — device-binding and station resolution state machine.
 *
 * Lifecycle:
 *   1. On mount: read Device ID from Electron IPC
 *   2. Call GET /teller/station?deviceId=<id> to resolve CounterStation
 *   3. Success        → status "bound",       binding is populated
 *      DEVICE_NOT_CONFIGURED → status "unregistered", binding null
 *      Network / other error → status "error",        binding null
 *
 * Mock mode (USE_MOCK_API=true): skips the HTTP call and returns a hardcoded
 * binding so UI development can proceed without a running backend.
 *
 * Architecture note: StationProvider must wrap AuthProvider so that auth
 * bootstrap only starts after the station is resolved, ensuring the resolved
 * stationId can be passed to token-refresh calls.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  MOCK_STATION_BINDING,
  resolveStationBinding,
} from "../data/station-provider";
import type { ApiError, StationBinding } from "../data/types";

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

function isApiError(err: unknown): err is ApiError {
  return (
    typeof err === "object" &&
    err !== null &&
    typeof (err as Record<string, unknown>)["code"] === "string" &&
    typeof (err as Record<string, unknown>)["message"] === "string"
  );
}

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

export type StationStatus =
  | "idle"          // Before resolution starts (brief initial state)
  | "resolving"     // HTTP call in flight
  | "bound"         // Resolved successfully; binding is non-null
  | "unregistered"  // Backend returned DEVICE_NOT_CONFIGURED
  | "error";        // Network / unexpected error

export interface StationState {
  binding: StationBinding | null;
  deviceId: string | null;
  deviceIdPersisted: boolean;
  status: StationStatus;
  error: ApiError | null;
}

export interface StationContextValue extends StationState {
  /** Re-run the device binding resolution (e.g., after IT registers the device). */
  retry(): void;
}

/* -------------------------------------------------------------------------- */
/*  Context                                                                   */
/* -------------------------------------------------------------------------- */

const StationContext = createContext<StationContextValue | null>(null);

/* -------------------------------------------------------------------------- */
/*  Provider                                                                  */
/* -------------------------------------------------------------------------- */

export function StationProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<StationState>({
    binding: null,
    deviceId: null,
    deviceIdPersisted: true,
    status: "idle",
    error: null,
  });

  // Tracks the active attempt so stale async results are discarded on retry.
  const attemptRef = useRef(0);

  const resolve = useCallback(async () => {
    const attemptId = ++attemptRef.current;

    setState((prev) => ({
      ...prev,
      status: "resolving",
      error: null,
      binding: null,
    }));

    const apiBaseUrl =
      window.tellerRuntime?.config.apiBaseUrl ?? "http://localhost:3000";
    const useMock = window.tellerRuntime?.config.useMockApi ?? false;

    /* ── Resolve Device ID ─────────────────────────────────────────────── */
    let deviceId = "unknown";
    let deviceIdPersisted = true;

    try {
      const status = await window.tellerRuntime?.getDeviceIdStatus();
      if (status) {
        deviceId = status.id;
        deviceIdPersisted = status.persisted;
      } else {
        deviceId = (await window.tellerRuntime?.getDeviceId()) ?? "unknown";
      }
    } catch {
      /* If the IPC bridge is unavailable (e.g., plain browser dev) keep the
         "unknown" placeholder — the backend call will return DEVICE_NOT_CONFIGURED
         which triggers the setup screen. */
    }

    if (attemptRef.current !== attemptId) return; // stale — a newer attempt started

    /* ── Mock short-circuit ────────────────────────────────────────────── */
    if (useMock) {
      setState({
        binding: MOCK_STATION_BINDING,
        deviceId,
        deviceIdPersisted,
        status: "bound",
        error: null,
      });
      return;
    }

    /* ── Real HTTP resolution ──────────────────────────────────────────── */
    try {
      const binding = await resolveStationBinding(deviceId, apiBaseUrl);
      if (attemptRef.current !== attemptId) return;
      setState({ binding, deviceId, deviceIdPersisted, status: "bound", error: null });
    } catch (err) {
      if (attemptRef.current !== attemptId) return;
      const apiError: ApiError = isApiError(err)
        ? err
        : {
            code: "UNKNOWN",
            message:
              err instanceof Error
                ? err.message
                : "An unexpected error occurred during station resolution.",
          };
      setState({
        binding: null,
        deviceId,
        deviceIdPersisted,
        status:
          apiError.code === "DEVICE_NOT_CONFIGURED" ? "unregistered" : "error",
        error: apiError,
      });
    }
  }, []);

  /* Run once on mount */
  useEffect(() => {
    void resolve();
  }, [resolve]);

  const retry = useCallback(() => {
    void resolve();
  }, [resolve]);

  const value: StationContextValue = { ...state, retry };

  return (
    <StationContext.Provider value={value}>{children}</StationContext.Provider>
  );
}

/* -------------------------------------------------------------------------- */
/*  Hook                                                                      */
/* -------------------------------------------------------------------------- */

export function useStation(): StationContextValue {
  const ctx = useContext(StationContext);
  if (!ctx)
    throw new Error("useStation must be used within a <StationProvider>");
  return ctx;
}
