/**
 * Unit tests for useQueue.ts
 *
 * Coverage:
 *  - Initial fetch on mount (getQueueSummary + getWaitingTickets)
 *  - currentTicket syncs from summary.nowServing
 *  - runAction: synchronous re-entry guard prevents duplicate API calls
 *  - runAction: TICKET_NOT_FOUND clears currentTicket immediately
 *  - runAction: STATION_NOT_FOUND dispatches station:mismatch DOM event
 *  - runAction: 409 non-domain conflict gets human-friendly error message
 *  - Terminal actions (complete, skipNoShow) clear currentTicket on success
 *  - fetchAll is called in finally (reconciles state on both success + failure)
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

/* -------------------------------------------------------------------------- */
/*  Module mocks (hoisted automatically by Vitest)                           */
/* -------------------------------------------------------------------------- */

// Mock the teller provider factory so we can inject our own spy provider.
const mockProvider = {
  getQueueSummary: vi.fn(),
  getWaitingTickets: vi.fn(),
  callNext: vi.fn(),
  startServing: vi.fn(),
  recall: vi.fn(),
  skipNoShow: vi.fn(),
  complete: vi.fn(),
  transfer: vi.fn(),
  getDepartments: vi.fn(),
  getServices: vi.fn(),
  getTransferReasons: vi.fn(),
};

vi.mock("../../data/teller-provider", () => ({
  createTellerProvider: () => mockProvider,
  createMockTellerProvider: () => mockProvider,
}));

vi.mock("../../data/api-client", () => ({
  createApiClient: () => ({}),
}));

vi.mock("../useAuth", () => ({
  useAuth: () => ({
    getAccessToken: () => "test-token",
    refreshAccessToken: () => Promise.resolve("new-token"),
  }),
}));

vi.mock("../useStation", () => ({
  useStation: () => ({
    binding: {
      serviceId: "svc-1",
      stationId: "sta-1",
      counterCode: "C01",
    },
  }),
}));

vi.mock("../../providers/SocketContext", () => ({
  useSocketContext: () => ({ socket: null }),
}));

/* -------------------------------------------------------------------------- */
/*  Import the hook AFTER mocks are declared (mocks are hoisted by Vitest)  */
/* -------------------------------------------------------------------------- */

import { useQueue } from "../useQueue";
import type { QueueSummary, QueueTicket } from "../../data/types";

/* -------------------------------------------------------------------------- */
/*  Test fixtures                                                             */
/* -------------------------------------------------------------------------- */

const EMPTY_SUMMARY: QueueSummary = {
  serviceId: "svc-1",
  waitingCount: 3,
  calledCount: 0,
  servingCount: 0,
  nowServing: undefined,
  completedToday: 5,
  noShowsToday: 1,
};

const CALLED_TICKET: QueueTicket = {
  id: "ticket-1",
  ticketNumber: "A001",
  status: "CALLED",
  serviceId: "svc-1",
  stationId: "sta-1",
  priorityWeight: 0,
  calledAt: new Date().toISOString(),
  createdAt: new Date().toISOString(),
};

const SERVING_TICKET: QueueTicket = {
  ...CALLED_TICKET,
  status: "SERVING",
  servingStartedAt: new Date().toISOString(),
};

/** Wait for all pending microtasks / resolved promises. */
function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/* -------------------------------------------------------------------------- */
/*  Setup                                                                    */
/* -------------------------------------------------------------------------- */

beforeAll(() => {
  // Provide a minimal tellerRuntime so the hook doesn't hit undefined.
  Object.defineProperty(window, "tellerRuntime", {
    configurable: true,
    value: {
      config: { useMockApi: false, apiBaseUrl: "http://localhost:3000" },
    },
  });
});

beforeEach(() => {
  vi.clearAllMocks();
  // Default: empty queue, no active ticket.
  mockProvider.getQueueSummary.mockResolvedValue(EMPTY_SUMMARY);
  mockProvider.getWaitingTickets.mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

/* -------------------------------------------------------------------------- */
/*  Tests                                                                     */
/* -------------------------------------------------------------------------- */

describe("useQueue", () => {
  /* ---- Initial fetch ---------------------------------------------------- */

  it("fetches queue summary and waiting tickets on mount", async () => {
    const { result } = renderHook(() => useQueue());

    await act(async () => {
      await flushPromises();
    });

    expect(mockProvider.getQueueSummary).toHaveBeenCalledWith("svc-1");
    expect(mockProvider.getWaitingTickets).toHaveBeenCalledWith("svc-1");
    expect(result.current.summary).toEqual(EMPTY_SUMMARY);
    expect(result.current.waitingTickets).toEqual([]);
  });

  it("sets currentTicket from summary.nowServing after fetch", async () => {
    mockProvider.getQueueSummary.mockResolvedValue({
      ...EMPTY_SUMMARY,
      nowServing: CALLED_TICKET,
      calledCount: 1,
    });

    const { result } = renderHook(() => useQueue());

    await act(async () => {
      await flushPromises();
    });

    expect(result.current.currentTicket).toEqual(CALLED_TICKET);
  });

  it("exposes the correct serviceId from the station binding", async () => {
    const { result } = renderHook(() => useQueue());
    expect(result.current.serviceId).toBe("svc-1");
  });

  /* ---- Re-entry guard --------------------------------------------------- */

  it("blocks re-entry: a second callNext call while the first is in-flight is ignored", async () => {
    let resolveFirstCall!: (t: QueueTicket) => void;
    mockProvider.callNext.mockImplementation(
      () =>
        new Promise<QueueTicket>((res) => {
          resolveFirstCall = res;
        }),
    );

    const { result } = renderHook(() => useQueue());
    await act(async () => {
      await flushPromises();
    });

    // Both calls issued in the same synchronous block.
    // The first sets actionInFlightRef=true; the second immediately returns.
    let firstAction!: Promise<void>;
    act(() => {
      firstAction = result.current.callNext();
      void result.current.callNext(); // re-entry — should be silently blocked
    });

    expect(mockProvider.callNext).toHaveBeenCalledOnce();

    // Clean up: resolve the pending API call.
    await act(async () => {
      resolveFirstCall(CALLED_TICKET);
      await firstAction;
      await flushPromises();
    });
  });

  /* ---- TICKET_NOT_FOUND ------------------------------------------------- */

  it("clears currentTicket immediately when action fails with TICKET_NOT_FOUND", async () => {
    // Mount with an active ticket.
    mockProvider.getQueueSummary.mockResolvedValue({
      ...EMPTY_SUMMARY,
      nowServing: CALLED_TICKET,
      calledCount: 1,
    });
    mockProvider.startServing.mockRejectedValue({
      code: "TICKET_NOT_FOUND",
      message: "Ticket no longer exists",
    });
    // After the failed action, fetchAll re-runs with no active ticket.
    mockProvider.getQueueSummary.mockResolvedValueOnce({
      ...EMPTY_SUMMARY,
      nowServing: CALLED_TICKET, // initial fetch
    });
    mockProvider.getQueueSummary.mockResolvedValue(EMPTY_SUMMARY); // post-action fetch

    const { result } = renderHook(() => useQueue());
    await act(async () => {
      await flushPromises();
    });

    expect(result.current.currentTicket).toEqual(CALLED_TICKET);

    await act(async () => {
      await result.current.startServing();
      await flushPromises();
    });

    expect(result.current.currentTicket).toBeNull();
    expect(result.current.actionError).toMatchObject({
      code: "TICKET_NOT_FOUND",
    });
  });

  /* ---- STATION_NOT_FOUND ------------------------------------------------ */

  it("dispatches station:mismatch DOM event when action fails with STATION_NOT_FOUND", async () => {
    mockProvider.callNext.mockRejectedValue({
      code: "STATION_NOT_FOUND",
      message: "Station not found",
    });

    const dispatchSpy = vi.spyOn(window, "dispatchEvent");

    const { result } = renderHook(() => useQueue());
    await act(async () => {
      await flushPromises();
    });

    await act(async () => {
      await result.current.callNext();
      await flushPromises();
    });

    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: "station:mismatch" }),
    );
  });

  /* ---- 409 concurrent teller conflict ----------------------------------- */

  it("overrides the error message for 409 non-domain conflicts", async () => {
    mockProvider.callNext.mockRejectedValue({
      code: "UNKNOWN",
      message: "Conflict",
      status: 409,
    });

    const { result } = renderHook(() => useQueue());
    await act(async () => {
      await flushPromises();
    });

    await act(async () => {
      await result.current.callNext();
      await flushPromises();
    });

    expect(result.current.actionError?.message).toBe(
      "This ticket was already handled by another teller.",
    );
  });

  it("does NOT override the message for 409 with ACTIVE_TICKET_EXISTS code", async () => {
    const originalMsg = "You already have an active ticket at this station";
    mockProvider.callNext.mockRejectedValue({
      code: "ACTIVE_TICKET_EXISTS",
      message: originalMsg,
      status: 409,
    });

    const { result } = renderHook(() => useQueue());
    await act(async () => {
      await flushPromises();
    });

    await act(async () => {
      await result.current.callNext();
      await flushPromises();
    });

    expect(result.current.actionError?.message).toBe(originalMsg);
  });

  /* ---- Terminal actions clear currentTicket ----------------------------- */

  it("clears currentTicket after complete succeeds (terminal action)", async () => {
    mockProvider.getQueueSummary.mockResolvedValue({
      ...EMPTY_SUMMARY,
      nowServing: SERVING_TICKET,
      servingCount: 1,
    });
    mockProvider.complete.mockResolvedValue(undefined);
    // After terminal action, fetchAll returns no active ticket.
    let fetchCount = 0;
    mockProvider.getQueueSummary.mockImplementation(async () => {
      fetchCount++;
      if (fetchCount === 1) return { ...EMPTY_SUMMARY, nowServing: SERVING_TICKET };
      return EMPTY_SUMMARY; // post-action
    });

    const { result } = renderHook(() => useQueue());
    await act(async () => {
      await flushPromises();
    });

    expect(result.current.currentTicket).toEqual(SERVING_TICKET);

    await act(async () => {
      await result.current.complete();
      await flushPromises();
    });

    // Optimistic clear happens immediately; fetchAll confirms it.
    expect(result.current.currentTicket).toBeNull();
  });

  it("clears currentTicket after skipNoShow succeeds (terminal action)", async () => {
    mockProvider.getQueueSummary.mockResolvedValue({
      ...EMPTY_SUMMARY,
      nowServing: CALLED_TICKET,
      calledCount: 1,
    });
    mockProvider.skipNoShow.mockResolvedValue(undefined);
    let fetchCount = 0;
    mockProvider.getQueueSummary.mockImplementation(async () => {
      fetchCount++;
      if (fetchCount === 1) return { ...EMPTY_SUMMARY, nowServing: CALLED_TICKET };
      return EMPTY_SUMMARY;
    });

    const { result } = renderHook(() => useQueue());
    await act(async () => {
      await flushPromises();
    });

    await act(async () => {
      await result.current.skipNoShow();
      await flushPromises();
    });

    expect(result.current.currentTicket).toBeNull();
  });

  /* ---- fetchAll in finally ---------------------------------------------- */

  it("calls fetchAll in the finally block even when an action succeeds", async () => {
    const calledTicketReturned = { ...CALLED_TICKET };
    mockProvider.callNext.mockResolvedValue(calledTicketReturned);

    const { result } = renderHook(() => useQueue());
    await act(async () => {
      await flushPromises();
    });

    const fetchCallsBefore = mockProvider.getQueueSummary.mock.calls.length;

    await act(async () => {
      await result.current.callNext();
      await flushPromises();
    });

    // fetchAll should have run at least once more after the action.
    expect(mockProvider.getQueueSummary.mock.calls.length).toBeGreaterThan(
      fetchCallsBefore,
    );
  });

  it("calls fetchAll in the finally block even when an action fails", async () => {
    mockProvider.callNext.mockRejectedValue({
      code: "QUEUE_EMPTY",
      message: "Empty",
    });

    const { result } = renderHook(() => useQueue());
    await act(async () => {
      await flushPromises();
    });

    const fetchCallsBefore = mockProvider.getQueueSummary.mock.calls.length;

    await act(async () => {
      await result.current.callNext();
      await flushPromises();
    });

    expect(mockProvider.getQueueSummary.mock.calls.length).toBeGreaterThan(
      fetchCallsBefore,
    );
  });

  /* ---- actionError cleared on next action ------------------------------- */

  it("clears actionError at the start of the next action", async () => {
    mockProvider.callNext
      .mockRejectedValueOnce({ code: "QUEUE_EMPTY", message: "Empty" })
      .mockResolvedValue(CALLED_TICKET);

    const { result } = renderHook(() => useQueue());
    await act(async () => {
      await flushPromises();
    });

    // First call — produces an error.
    await act(async () => {
      await result.current.callNext();
      await flushPromises();
    });
    expect(result.current.actionError).not.toBeNull();

    // Second call — error should be cleared immediately.
    await act(async () => {
      await result.current.callNext();
      await flushPromises();
    });
    expect(result.current.actionError).toBeNull();
  });
});
