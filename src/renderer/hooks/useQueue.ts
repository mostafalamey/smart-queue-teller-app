/**
 * useQueue — reactive queue state for the teller's bound service.
 *
 * Phase 6.3:  queue summary + waiting ticket list (read-only).
 * Phase 6.4:  action handlers (callNext, recall, skipNoShow, complete, transfer)
 *             will be added here and exposed via QueueActionsContext.
 *
 * Data flow:
 *  1. On mount (and whenever serviceId becomes available): fetch summary + waiting.
 *  2. On `queue.updated` / `now-serving.updated` WebSocket events: re-fetch.
 *  3. Exposes a manual `refresh()` for error-recovery retries.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createApiClient } from "../data/api-client";
import {
  createMockTellerProvider,
  createTellerProvider,
  type TellerProvider,
} from "../data/teller-provider";
import { useAuth } from "./useAuth";
import { useStation } from "./useStation";
import { useSocketContext } from "../providers/SocketContext";
import type { ApiError, QueueSummary, WaitingTicket } from "../data/types";

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

export interface QueueState {
  summary: QueueSummary | null;
  waitingTickets: WaitingTicket[];
  isLoading: boolean;
  error: ApiError | null;
  lastRefreshedAt: Date | null;
}

export interface UseQueueReturn extends QueueState {
  refresh(): void;
  /** Exposed for Phase 6.4 action panel — executes a teller action and refreshes. */
  provider: TellerProvider;
}

/* -------------------------------------------------------------------------- */
/*  Hook                                                                      */
/* -------------------------------------------------------------------------- */

export function useQueue(): UseQueueReturn {
  const { getAccessToken, refreshAccessToken } = useAuth();
  const { binding } = useStation();
  const { socket } = useSocketContext();

  const useMock =
    window.tellerRuntime?.config.useMockApi ?? false;

  /* ---- Build a stable TellerProvider once per mount -------------------- */
  const providerRef = useRef<TellerProvider | null>(null);
  if (!providerRef.current) {
    if (useMock) {
      providerRef.current = createMockTellerProvider();
    } else {
      const apiBaseUrl =
        window.tellerRuntime?.config.apiBaseUrl ?? "http://localhost:3000";
      const apiClient = createApiClient({
        baseUrl: apiBaseUrl,
        // `getAccessToken` and `refreshAccessToken` are stable useCallback refs
        // that always read from the latest accessTokenRef in AuthContext — safe
        // to capture in the ApiClient created once at mount.
        getAccessToken,
        refreshAccessToken,
      });
      providerRef.current = createTellerProvider(apiClient);
    }
  }

  /* ---- Queue state ------------------------------------------------------ */

  const [state, setState] = useState<QueueState>({
    summary: null,
    waitingTickets: [],
    isLoading: false,
    error: null,
    lastRefreshedAt: null,
  });

  const serviceIdRef = useRef<string | null>(binding?.serviceId ?? null);
  useEffect(() => {
    serviceIdRef.current = binding?.serviceId ?? null;
  }, [binding?.serviceId]);

  /* ---------------------------------------------------------------------- */
  /*  fetchAll — load summary + waiting tickets for the bound service       */
  /* ---------------------------------------------------------------------- */

  const fetchAll = useCallback(async () => {
    const svcId = serviceIdRef.current;
    if (!svcId) return;

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const [summary, waitingTickets] = await Promise.all([
        providerRef.current!.getQueueSummary(svcId),
        providerRef.current!.getWaitingTickets(svcId),
      ]);

      setState({
        summary,
        waitingTickets,
        isLoading: false,
        error: null,
        lastRefreshedAt: new Date(),
      });
    } catch (err: unknown) {
      const apiError = err as ApiError | null;
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: apiError ?? { code: "UNKNOWN", message: "Failed to fetch queue data" },
      }));
    }
  }, []);

  /* ---- Initial fetch ---------------------------------------------------- */

  useEffect(() => {
    if (binding?.serviceId) {
      void fetchAll();
    }
  }, [binding?.serviceId, fetchAll]);

  /* ---- WebSocket event subscriptions ------------------------------------ */

  useEffect(() => {
    if (!socket) return;

    const handleUpdate = () => {
      void fetchAll();
    };

    socket.on("queue.updated", handleUpdate);
    socket.on("now-serving.updated", handleUpdate);

    return () => {
      socket.off("queue.updated", handleUpdate);
      socket.off("now-serving.updated", handleUpdate);
    };
  }, [socket, fetchAll]);

  return {
    ...state,
    refresh: fetchAll,
    provider: providerRef.current!,
  };
}
