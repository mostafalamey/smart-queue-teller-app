/**
 * useQueue — reactive queue state and teller action handlers.
 *
 * Phase 6.3:  queue summary + waiting ticket list (read-only).
 * Phase 6.4:  action handlers (callNext, startServing, recall, skipNoShow,
 *             complete) with optimistic currentTicket updates.
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
import type { ApiError, ApiErrorCode, QueueSummary, QueueTicket, WaitingTicket } from "../data/types";

/* -------------------------------------------------------------------------- */
/*  Type guard                                                                */
/* -------------------------------------------------------------------------- */

const KNOWN_API_ERROR_CODES = new Set<ApiErrorCode>([
  "INVALID_REQUEST", "INVALID_CREDENTIALS", "FORBIDDEN", "SESSION_EXPIRED",
  "ACCOUNT_LOCKED", "ROLE_SELECTION_REQUIRED", "QUEUE_EMPTY",
  "INVALID_STATUS_TRANSITION", "TICKET_NOT_FOUND", "STATION_NOT_FOUND",
  "DEVICE_NOT_CONFIGURED", "ACTIVE_TICKET_EXISTS", "NETWORK_ERROR",
  "TIMEOUT", "UNKNOWN",
]);

function isApiError(e: unknown): e is ApiError {
  return (
    typeof e === "object" &&
    e !== null &&
    typeof (e as Record<string, unknown>).code === "string" &&
    KNOWN_API_ERROR_CODES.has((e as Record<string, unknown>).code as ApiErrorCode) &&
    typeof (e as Record<string, unknown>).message === "string"
  );
}

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
  /**
   * Current active ticket at this station. Updated immediately on action
   * success for instant UI feedback; re-synced from summary on each fetch.
   */
  currentTicket: QueueTicket | null;
  /** True while a teller action API call is in-flight. */
  isActionInFlight: boolean;
  /** Last teller action error; cleared automatically when the next action starts. */
  actionError: ApiError | null;
  /** Bound service ID (null until station resolves). */
  serviceId: string | null;
  refresh(): void;
  provider: TellerProvider;
  /* Phase 6.4 teller actions */
  callNext(): Promise<void>;
  startServing(): Promise<void>;
  recall(): Promise<void>;
  skipNoShow(): Promise<void>;
  complete(): Promise<void>;
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

  /* ---- Current-ticket state (optimistic, synced from fetch + actions) --- */

  const [currentTicket, setCurrentTicketState] = useState<QueueTicket | null>(null);
  // Ref lets action callbacks read the latest ticket id without listing
  // currentTicket in their dep arrays (avoids recreating handlers on every
  // ticket status change).
  const currentTicketRef = useRef<QueueTicket | null>(null);

  const [isActionInFlight, setIsActionInFlight] = useState(false);
  const [actionError, setActionError] = useState<ApiError | null>(null);

  const setCurrentTicket = useCallback((t: QueueTicket | null) => {
    currentTicketRef.current = t;
    setCurrentTicketState(t);
  }, []);

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
      // Keep currentTicket in sync with what the backend says is now-serving
      // at this station. Covers external changes (another teller's action
      // affecting this station) as well as natural lifecycle transitions.
      setCurrentTicket(summary.nowServing ?? null);
    } catch (err: unknown) {
      const apiError: ApiError = isApiError(err)
        ? err
        : { code: "UNKNOWN", message: "Failed to fetch queue data" };
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: apiError,
      }));
    }
  }, [setCurrentTicket]);

  /* ---- Generic teller action runner ------------------------------------ */

  /**
   * Wraps a teller action call with:
   *  - in-flight flag management (disables buttons)
   *  - error capture
   *  - optimistic currentTicket update  (null for terminal actions)
   *  - background fetchAll to refresh summary counts
   */
  const runAction = useCallback(
    async (fn: () => Promise<QueueTicket | null>) => {
      setIsActionInFlight(true);
      setActionError(null);
      try {
        const ticket = await fn();
        setCurrentTicket(ticket);
        void fetchAll();
      } catch (err: unknown) {
        setActionError(
          isApiError(err)
            ? err
            : { code: "UNKNOWN", message: "Action failed" },
        );
      } finally {
        setIsActionInFlight(false);
      }
    },
    [fetchAll, setCurrentTicket],
  );

  /* ---- Teller action handlers ------------------------------------------ */

  const callNextHandler = useCallback(async () => {
    const svcId = serviceIdRef.current;
    if (!svcId) return;
    await runAction(() => providerRef.current!.callNext(svcId));
  }, [runAction]);

  const startServingHandler = useCallback(async () => {
    const ticketId = currentTicketRef.current?.id;
    if (!ticketId) return;
    await runAction(() => providerRef.current!.startServing(ticketId));
  }, [runAction]);

  const recallHandler = useCallback(async () => {
    const ticketId = currentTicketRef.current?.id;
    if (!ticketId) return;
    await runAction(() => providerRef.current!.recall(ticketId));
  }, [runAction]);

  const skipNoShowHandler = useCallback(async () => {
    const ticketId = currentTicketRef.current?.id;
    if (!ticketId) return;
    // Terminal action — clear the current ticket immediately on success.
    await runAction(async () => {
      await providerRef.current!.skipNoShow(ticketId);
      return null;
    });
  }, [runAction]);

  const completeHandler = useCallback(async () => {
    const ticketId = currentTicketRef.current?.id;
    if (!ticketId) return;
    // Terminal action — clear the current ticket immediately on success.
    await runAction(async () => {
      await providerRef.current!.complete(ticketId);
      return null;
    });
  }, [runAction]);

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
    currentTicket,
    isActionInFlight,
    actionError,
    serviceId: binding?.serviceId ?? null,
    refresh: fetchAll,
    provider: providerRef.current!,
    callNext: callNextHandler,
    startServing: startServingHandler,
    recall: recallHandler,
    skipNoShow: skipNoShowHandler,
    complete: completeHandler,
  };
}
