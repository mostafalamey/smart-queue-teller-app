/**
 * Shared TypeScript types for the Teller App renderer.
 *
 * Aligned with backend domain model and API contracts.
 * See: smart-queue-backend/src/auth/types.ts, login.ts, tokens.ts
 */

/* -------------------------------------------------------------------------- */
/*  Enums (mirror Prisma schema values)                                       */
/* -------------------------------------------------------------------------- */

export type AppRole = "ADMIN" | "IT" | "MANAGER" | "STAFF";

export type TicketStatus =
  | "WAITING"
  | "CALLED"
  | "SERVING"
  | "COMPLETED"
  | "NO_SHOW"
  | "CANCELLED"
  | "TRANSFERRED_OUT";

/* -------------------------------------------------------------------------- */
/*  Auth                                                                      */
/* -------------------------------------------------------------------------- */

export interface IssuedAuthTokens {
  tokenType: "Bearer";
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresInSeconds: number;
  refreshTokenExpiresInSeconds: number;
}

export interface AuthUser {
  id: string;
  email: string;
  role: AppRole;
  /** Only set when role is MANAGER */
  departmentId?: string;
  mustChangePassword: boolean;
}

export interface LoginResult {
  user: AuthUser;
  auth: IssuedAuthTokens;
}

export interface LoginInput {
  email: string;
  password: string;
  /** Device ID passed so backend can embed stationId in the JWT */
  stationId?: string;
  requestedRole?: AppRole;
}

export interface RefreshInput {
  refreshToken: string;
  stationId?: string;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

/* -------------------------------------------------------------------------- */
/*  Queue / Tickets                                                           */
/* -------------------------------------------------------------------------- */

export interface QueueTicket {
  id: string;
  ticketNumber: string;
  status: TicketStatus;
  serviceId: string;
  stationId?: string;
  priorityWeight: number;
  calledAt?: string;
  servingStartedAt?: string;
  completedAt?: string;
  /** ISO date string */
  createdAt: string;
  /** Origin ticket (set when this ticket resulted from a transfer) */
  originTicketId?: string;
  /** Patient contact — partially masked in the UI (e.g. 05****1234) */
  patientPhone?: string;
  /** Recall timestamp — set to the occurredAt of the latest RECALLED event */
  lastRecalledAt?: string;
}

export interface QueueSummary {
  serviceId: string;
  waitingCount: number;
  calledCount: number;
  servingCount: number;
  nowServing?: QueueTicket;
  /** Tickets completed today (midnight-scoped) */
  completedToday?: number;
  /** No-shows today (midnight-scoped) */
  noShowsToday?: number;
}

export interface WaitingTicket {
  id: string;
  ticketNumber: string;
  priorityWeight: number;
  /** Approximate wait time in minutes */
  estimatedWaitMinutes?: number;
  createdAt: string;
}

/* -------------------------------------------------------------------------- */
/*  Departments & Services                                                    */
/* -------------------------------------------------------------------------- */

export interface Department {
  id: string;
  nameEn: string;
  nameAr: string;
  code: string;
}

export interface Service {
  id: string;
  nameEn: string;
  nameAr: string;
  ticketPrefix: string;
  departmentId: string;
  isActive: boolean;
}

export interface CounterStation {
  id: string;
  code: string;
  nameEn?: string;
  nameAr?: string;
  serviceId: string;
  service?: Service;
  department?: Department;
}

/**
 * Resolved device → counter station binding.
 * Returned by GET /teller/station?deviceId=<uuid>
 */
export interface StationBinding {
  stationId: string;
  counterCode: string;
  serviceId: string;
  serviceNameEn: string;
  serviceNameAr: string;
  ticketPrefix: string;
  departmentId: string;
  departmentNameEn: string;
  departmentNameAr: string;
}

/* -------------------------------------------------------------------------- */
/*  Transfer                                                                  */
/* -------------------------------------------------------------------------- */

export interface TransferInput {
  ticketId: string;
  destination: {
    departmentId: string;
    serviceId: string;
    /** ISO date string — defaults to today */
    ticketDate?: string;
  };
}

export interface TransferResult {
  sourceTicket: QueueTicket;
  destinationTicket: QueueTicket;
}

/* -------------------------------------------------------------------------- */
/*  API Error                                                                 */
/* -------------------------------------------------------------------------- */

export type ApiErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_CREDENTIALS"
  | "FORBIDDEN"
  | "SESSION_EXPIRED"
  | "ACCOUNT_LOCKED"
  | "ROLE_SELECTION_REQUIRED"
  | "QUEUE_EMPTY"
  | "INVALID_STATUS_TRANSITION"
  | "TICKET_NOT_FOUND"
  | "STATION_NOT_FOUND"
  | "DEVICE_NOT_CONFIGURED"
  | "ACTIVE_TICKET_EXISTS"
  | "NETWORK_ERROR"
  | "TIMEOUT"
  | "UNKNOWN";

export interface ApiError {
  code: ApiErrorCode;
  message: string;
  /** HTTP status code (undefined for network errors) */
  status?: number;
  /** If ACCOUNT_LOCKED — seconds until unlock */
  lockedUntilSeconds?: number;
}

/* -------------------------------------------------------------------------- */
/*  TellerDataProvider interface                                              */
/* -------------------------------------------------------------------------- */

export interface TellerDataProvider {
  /* Auth */
  login(input: LoginInput): Promise<LoginResult>;
  refresh(input: RefreshInput): Promise<LoginResult>;
  logout(refreshToken: string): Promise<void>;
  changePassword(input: ChangePasswordInput): Promise<void>;

  /* Queue */
  getQueueSummary(serviceId: string): Promise<QueueSummary>;
  getWaitingTickets(serviceId: string): Promise<WaitingTicket[]>;

  /* Teller actions */
  callNext(serviceId: string): Promise<QueueTicket>;         // returns CALLED ticket
  startServing(ticketId: string): Promise<QueueTicket>;      // explicit user action: CALLED → SERVING
  recall(ticketId: string): Promise<QueueTicket>;            // RECALLED event only; status unchanged
  skipNoShow(ticketId: string): Promise<QueueTicket>;
  complete(ticketId: string): Promise<QueueTicket>;
  transfer(input: TransferInput): Promise<TransferResult>;

  /* Reference data */
  getDepartments(): Promise<Department[]>;
  getServices(departmentId: string): Promise<Service[]>;
}
