/**
 * Teller data provider — HTTP and mock implementations.
 *
 * Queue-read endpoints (Phase 6.3):
 *   GET /queue/services/:serviceId/summary
 *   GET /queue/services/:serviceId/waiting
 *
 * Teller-action endpoints (Phase 6.4 — fully implemented so they can be
 * wired up in the action panel without touching this file again):
 *   POST /teller/call-next         → ticket returned with status CALLED
 *   POST /teller/start-serving     → ticket returned with status SERVING (explicit user action)
 *   POST /teller/recall            → re-announces patient; ticket status unchanged
 *   POST /teller/skip-no-show
 *   POST /teller/complete
 *   POST /teller/transfer
 */

import type { ApiClient } from "./api-client";
import type {
  Department,
  QueueSummary,
  QueueTicket,
  Service,
  TransferInput,
  TransferResult,
  WaitingTicket,
} from "./types";

/* -------------------------------------------------------------------------- */
/*  Provider interface                                                        */
/* -------------------------------------------------------------------------- */

export interface TellerProvider {
  /* Queue reads */
  getQueueSummary(serviceId: string): Promise<QueueSummary>;
  getWaitingTickets(serviceId: string): Promise<WaitingTicket[]>;

  /* Teller actions */
  callNext(serviceId: string): Promise<QueueTicket>;
  recall(ticketId: string): Promise<QueueTicket>;
  /** Explicit user action: transitions CALLED → SERVING and sets servingStartedAt. */
  startServing(ticketId: string): Promise<QueueTicket>;
  skipNoShow(ticketId: string): Promise<QueueTicket>;
  complete(ticketId: string): Promise<QueueTicket>;
  transfer(input: TransferInput): Promise<TransferResult>;

  /* Reference data */
  getDepartments(): Promise<Department[]>;
  getServices(departmentId: string): Promise<Service[]>;
}

/* -------------------------------------------------------------------------- */
/*  Backend response shapes                                                   */
/* -------------------------------------------------------------------------- */

interface QueueSummaryResponse {
  requestId?: string;
  serviceId: string;
  waitingCount: number;
  calledCount: number;
  servingCount: number;
  completedToday?: number;
  noShowsToday?: number;
  nowServing?: QueueTicket;
}

interface WaitingTicketsResponse {
  requestId?: string;
  tickets: WaitingTicket[];
}

/* -------------------------------------------------------------------------- */
/*  HTTP implementation                                                       */
/* -------------------------------------------------------------------------- */

export function createTellerProvider(apiClient: ApiClient): TellerProvider {
  const provider: TellerProvider = {
    /* ---- Queue reads ------------------------------------------------------ */

    async getQueueSummary(serviceId: string): Promise<QueueSummary> {
      const res = await apiClient.get<QueueSummaryResponse>(
        `/queue/services/${encodeURIComponent(serviceId)}/summary`,
      );
      return {
        serviceId: res.serviceId,
        waitingCount: res.waitingCount,
        calledCount: res.calledCount,
        servingCount: res.servingCount,
        completedToday: res.completedToday,
        noShowsToday: res.noShowsToday,
        nowServing: res.nowServing,
      };
    },

    async getWaitingTickets(serviceId: string): Promise<WaitingTicket[]> {
      const res = await apiClient.get<WaitingTicketsResponse>(
        `/queue/services/${encodeURIComponent(serviceId)}/waiting`,
      );
      return res.tickets;
    },

    /* ---- Teller actions --------------------------------------------------- */

    async callNext(serviceId: string): Promise<QueueTicket> {
      // Returns a CALLED ticket. The teller must explicitly click
      // "Start Serving" (POST /teller/start-serving) once the patient
      // arrives at the counter to transition the ticket to SERVING.
      return apiClient.post<QueueTicket>("/teller/call-next", { serviceId });
    },

    async recall(ticketId: string): Promise<QueueTicket> {
      // Backend only inserts a RECALLED event; ticket status and timestamps
      // are unchanged. The teller clicks "Start Serving" again once the
      // patient returns to the counter, which resets servingStartedAt.
      return apiClient.post<QueueTicket>("/teller/recall", { ticketId });
    },

    async startServing(ticketId: string): Promise<QueueTicket> {
      return apiClient.post<QueueTicket>("/teller/start-serving", { ticketId });
    },

    async skipNoShow(ticketId: string): Promise<QueueTicket> {
      return apiClient.post<QueueTicket>("/teller/skip-no-show", { ticketId });
    },

    async complete(ticketId: string): Promise<QueueTicket> {
      return apiClient.post<QueueTicket>("/teller/complete", { ticketId });
    },

    async transfer(input: TransferInput): Promise<TransferResult> {
      return apiClient.post<TransferResult>("/teller/transfer", {
        ticketId: input.ticketId,
        destination: input.destination,
      });
    },

    /* ---- Reference data --------------------------------------------------- */

    async getDepartments(): Promise<Department[]> {
      return apiClient.get<Department[]>("/departments");
    },

    async getServices(departmentId: string): Promise<Service[]> {
      return apiClient.get<Service[]>(
        `/departments/${encodeURIComponent(departmentId)}/services`,
      );
    },
  };

  return provider;
}

/* -------------------------------------------------------------------------- */
/*  Mock implementation (USE_MOCK_API=true)                                  */
/* -------------------------------------------------------------------------- */

const _now = new Date();
const _thirtySecAgo = new Date(_now.getTime() - 30_000).toISOString();
const _fiveMinsAgo = new Date(_now.getTime() - 5 * 60_000).toISOString();
const _tenMinsAgo = new Date(_now.getTime() - 10 * 60_000).toISOString();

const MOCK_NOW_SERVING: QueueTicket = {
  id: "mock-ticket-001",
  ticketNumber: "G042",
  status: "SERVING",
  serviceId: "mock-service-001",
  stationId: "mock-station-001",
  priorityWeight: 10,
  calledAt: _thirtySecAgo,
  servingStartedAt: _thirtySecAgo,
  createdAt: _tenMinsAgo,
  patientPhone: "05****1234",
};

const MOCK_WAITING: WaitingTicket[] = [
  { id: "mock-t-002", ticketNumber: "G043", priorityWeight: 100, createdAt: _tenMinsAgo },
  { id: "mock-t-003", ticketNumber: "G044", priorityWeight: 50, createdAt: _fiveMinsAgo },
  { id: "mock-t-004", ticketNumber: "G045", priorityWeight: 10, createdAt: _fiveMinsAgo },
  { id: "mock-t-005", ticketNumber: "G046", priorityWeight: 10, createdAt: _fiveMinsAgo },
  { id: "mock-t-006", ticketNumber: "G047", priorityWeight: 10, createdAt: _fiveMinsAgo },
  { id: "mock-t-007", ticketNumber: "G048", priorityWeight: 10, createdAt: _fiveMinsAgo },
];

function mockDelay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createMockTellerProvider(): TellerProvider {
  // Mutable local state for simulating queue mutations.
  let currentTicket: QueueTicket | undefined = MOCK_NOW_SERVING;
  let waiting: WaitingTicket[] = [...MOCK_WAITING];
  let completedToday = 24;
  let noShowsToday = 3;

  const provider: TellerProvider = {
    async getQueueSummary(_serviceId: string): Promise<QueueSummary> {
      await mockDelay(300);
      return {
        serviceId: "mock-service-001",
        waitingCount: waiting.length,
        calledCount: 0,
        servingCount: currentTicket ? 1 : 0,
        completedToday,
        noShowsToday,
        nowServing: currentTicket,
      };
    },

    async getWaitingTickets(_serviceId: string): Promise<WaitingTicket[]> {
      await mockDelay(200);
      return [...waiting];
    },

    async callNext(_serviceId: string): Promise<QueueTicket> {
      await mockDelay(400);
      const next = waiting.shift();
      if (!next) throw { code: "QUEUE_EMPTY", message: "No patients waiting in queue" };
      // Returns CALLED — teller must explicitly click Start Serving.
      currentTicket = {
        id: next.id,
        ticketNumber: next.ticketNumber,
        status: "CALLED",
        serviceId: "mock-service-001",
        stationId: "mock-station-001",
        priorityWeight: next.priorityWeight,
        calledAt: new Date().toISOString(),
        createdAt: next.createdAt,
        patientPhone: "05****5678",
      };
      return currentTicket;
    },

    async recall(_ticketId: string): Promise<QueueTicket> {
      await mockDelay(300);
      if (!currentTicket) throw { code: "TICKET_NOT_FOUND", message: "No active ticket" };
      // Backend only records the event; status and timestamps unchanged.
      return currentTicket;
    },

    async startServing(ticketId: string): Promise<QueueTicket> {
      await mockDelay(200);
      if (!currentTicket || currentTicket.id !== ticketId)
        throw { code: "TICKET_NOT_FOUND", message: "Ticket not found" };
      currentTicket = {
        ...currentTicket,
        status: "SERVING",
        servingStartedAt: new Date().toISOString(),
      };
      return currentTicket;
    },

    async skipNoShow(ticketId: string): Promise<QueueTicket> {
      await mockDelay(300);
      if (!currentTicket || currentTicket.id !== ticketId)
        throw { code: "TICKET_NOT_FOUND", message: "Ticket not found" };
      const skipped: QueueTicket = { ...currentTicket, status: "NO_SHOW" };
      currentTicket = undefined;
      noShowsToday++;
      return skipped;
    },

    async complete(ticketId: string): Promise<QueueTicket> {
      await mockDelay(300);
      if (!currentTicket || currentTicket.id !== ticketId)
        throw { code: "TICKET_NOT_FOUND", message: "Ticket not found" };
      const done: QueueTicket = {
        ...currentTicket,
        status: "COMPLETED",
        completedAt: new Date().toISOString(),
      };
      currentTicket = undefined;
      completedToday++;
      return done;
    },

    async transfer(input: TransferInput): Promise<TransferResult> {
      await mockDelay(400);
      if (!currentTicket)
        throw { code: "TICKET_NOT_FOUND", message: "No active ticket" };
      const src: QueueTicket = { ...currentTicket, status: "TRANSFERRED_OUT" };
      currentTicket = undefined;
      return {
        sourceTicket: src,
        destinationTicket: {
          ...src,
          id: "mock-dest-" + Date.now(),
          ticketNumber: "B001",
          serviceId: input.destination.serviceId,
          status: "WAITING",
        },
      };
    },

    async getDepartments(): Promise<Department[]> {
      await mockDelay(200);
      return [
        { id: "mock-dept-001", nameEn: "Outpatient Clinic", nameAr: "العيادة الخارجية", code: "OPC" },
        { id: "mock-dept-002", nameEn: "Internal Medicine", nameAr: "الطب الداخلي", code: "INT" },
      ];
    },

    async getServices(departmentId: string): Promise<Service[]> {
      await mockDelay(200);
      return [
        { id: "mock-service-001", nameEn: "General Medicine", nameAr: "الطب العام", ticketPrefix: "G", departmentId, isActive: true },
        { id: "mock-service-002", nameEn: "Cardiology", nameAr: "قسم القلب", ticketPrefix: "C", departmentId, isActive: true },
      ];
    },
  };

  return provider;
}
