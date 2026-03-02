/**
 * QueueDashboard — primary teller view.
 *
 * Layout:
 *   ┌──────────────────────────────────────────────────┐
 *   │  Summary metrics (4 cards)                       │
 *   ├────────────────────────┬─────────────────────────┤
 *   │  Currently Serving     │  Waiting Queue          │
 *   │  (hero ticket display) │  (scrollable list)      │
 *   ├────────────────────────┤                         │
 *   │  Action Panel          │                         │
 *   └────────────────────────┴─────────────────────────┘
 *
 * Data: sourced entirely from useQueue() — no props.
 * Real-time: socket events trigger re-fetches inside useQueue.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { Card } from "./ui/card";
import { Spinner } from "./ui/spinner";
import { useQueue } from "../hooks/useQueue";
import { ActionPanel } from "./ActionPanel";
import { TransferDialog } from "./TransferDialog";
import { ShortcutReferencePanel } from "./ShortcutReferencePanel";
import { OfflineBanner } from "./OfflineBanner";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { useNetworkHealthContext } from "../providers/NetworkHealthContext";
import { cn } from "../lib/utils";
import type { QueueTicket, WaitingTicket } from "../data/types";
import {
  Users,
  CheckCircle2,
  XCircle,
  MonitorCheck,
  ClockArrowUp,
  RefreshCcw,
  ArrowRightLeft,
} from "lucide-react";

/* -------------------------------------------------------------------------- */
/*  Priority helpers                                                          */
/* -------------------------------------------------------------------------- */

type Priority = "emergency" | "vip" | "normal";

function getPriority(weight: number): Priority {
  if (weight >= 100) return "emergency";
  if (weight >= 50) return "vip";
  return "normal";
}

const PRIORITY_LABEL: Record<Priority, string> = {
  emergency: "Emergency",
  vip: "VIP",
  normal: "Normal",
};

const PRIORITY_BADGE_CLASS: Record<Priority, string> = {
  emergency:
    "bg-red-500/15 text-red-500 ring-1 ring-red-500/30",
  vip: "bg-amber-400/15 text-amber-500 ring-1 ring-amber-400/30",
  normal: "bg-secondary text-muted-foreground",
};

function PriorityBadge({ weight, className }: { weight: number; className?: string }) {
  const priority = getPriority(weight);
  if (priority === "normal") return null;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
        PRIORITY_BADGE_CLASS[priority],
        className,
      )}
    >
      {PRIORITY_LABEL[priority]}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/*  Serving timer                                                             */
/* -------------------------------------------------------------------------- */

function useServingTimer(ticket: QueueTicket | null | undefined): string {
  const [elapsed, setElapsed] = useState(0);
  const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!ticket) {
      setElapsed(0);
      if (tickerRef.current) {
        clearInterval(tickerRef.current);
        tickerRef.current = null;
      }
      return;
    }

    // Anchor on servingStartedAt once the teller clicks Start Serving;
    // fall back to calledAt while the ticket is still in CALLED state.
    const anchorIso = ticket.servingStartedAt ?? ticket.calledAt;
    const anchor = anchorIso ? new Date(anchorIso).getTime() : Date.now();

    const update = () => {
      setElapsed(Math.floor((Date.now() - anchor) / 1000));
    };
    update();
    tickerRef.current = setInterval(update, 1_000);

    return () => {
      if (tickerRef.current) clearInterval(tickerRef.current);
    };
  }, [ticket?.id, ticket?.servingStartedAt, ticket?.calledAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

/* -------------------------------------------------------------------------- */
/*  Relative time helper                                                      */
/* -------------------------------------------------------------------------- */

function relativeTime(isoDate: string): string {
  const diffSec = Math.floor((Date.now() - new Date(isoDate).getTime()) / 1000);
  if (diffSec < 60) return `${diffSec}s`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m`;
  return `${Math.floor(diffSec / 3600)}h`;
}

/* -------------------------------------------------------------------------- */
/*  Summary card                                                              */
/* -------------------------------------------------------------------------- */

interface MetricCardProps {
  icon: React.ReactNode;
  label: string;
  value: number;
  accent?: string;
}

function MetricCard({ icon, label, value, accent }: MetricCardProps) {
  return (
    <Card className="flex flex-1 items-center gap-3 px-4 py-3">
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary",
          accent,
        )}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <p className="text-xl font-bold tabular-nums text-foreground leading-none mt-0.5">
          {value}
        </p>
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/*  Currently serving card                                                    */
/* -------------------------------------------------------------------------- */

interface CurrentTicketCardProps {
  ticket: QueueTicket | null | undefined;
  timer: string;
  /** ActionPanel content slotted into the bottom of the card. */
  actions: React.ReactNode;
}

function CurrentTicketCard({ ticket, timer, actions }: CurrentTicketCardProps) {
  if (!ticket) {
    return (
      <Card className="flex flex-1 flex-col overflow-hidden">
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-10 text-center">
          <MonitorCheck size={32} className="text-muted-foreground/30" />
          <p className="text-sm font-medium text-foreground">Counter ready</p>
          <p className="text-xs text-muted-foreground">No active ticket</p>
        </div>
        {actions}
      </Card>
    );
  }

  const priority = getPriority(ticket.priorityWeight);

  return (
    <Card
      className={cn(
        "flex flex-1 flex-col gap-0 overflow-hidden",
        priority === "emergency" && "ring-1 ring-red-500/40",
        priority === "vip" && "ring-1 ring-amber-400/30",
      )}
    >
      {/* Priority accent bar */}
      {priority !== "normal" && (
        <div
          className={cn(
            "h-1 w-full",
            priority === "emergency" && "bg-red-500",
            priority === "vip" && "bg-amber-400",
          )}
        />
      )}

      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-8">
        {/* Status + priority */}
        <div className="flex items-center gap-2">
          {ticket.status === "SERVING" ? (
            <span className="rounded-full bg-blue-500/15 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-blue-500 ring-1 ring-blue-500/25">
              Serving
            </span>
          ) : (
            <span className="rounded-full bg-amber-400/15 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-500 ring-1 ring-amber-400/30">
              Called
            </span>
          )}
          <PriorityBadge weight={ticket.priorityWeight} />
        </div>

        {/* Ticket number — hero */}
        <p className="font-mono text-6xl font-black tracking-tight text-foreground leading-none">
          {ticket.ticketNumber}
        </p>

        {/* Timer */}
        <div className="flex items-center gap-1.5">
          <ClockArrowUp size={13} className="text-muted-foreground/60" />
          <p className="font-mono text-sm tabular-nums text-muted-foreground">
            {timer}
          </p>
        </div>

        {/* Phone */}
        {ticket.patientPhone && (
          <p className="text-xs text-muted-foreground/60">
            {ticket.patientPhone}
          </p>
        )}
      </div>

      {actions}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/*  Waiting queue list                                                        */
/* -------------------------------------------------------------------------- */

interface WaitingListProps {
  tickets: WaitingTicket[];
  isLoading: boolean;
}

function WaitingList({ tickets, isLoading }: WaitingListProps) {
  return (
    <Card className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/50 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Users size={13} className="text-muted-foreground/60" />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Waiting
          </span>
        </div>
        {isLoading && <Spinner size={12} className="text-muted-foreground/50" />}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {tickets.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-1.5 py-10">
            <CheckCircle2 size={24} className="text-emerald-500/40" />
            <p className="text-xs text-muted-foreground/60">Queue is empty</p>
          </div>
        ) : (
          <ul className="divide-y divide-border/40">
            {tickets.map((t, idx) => {
              const priority = getPriority(t.priorityWeight);
              return (
                <li
                  key={t.id}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors"
                >
                  {/* Position number */}
                  <span className="w-5 text-right text-[10px] tabular-nums text-muted-foreground/50 shrink-0">
                    {idx + 1}
                  </span>

                  {/* Priority dot */}
                  <span
                    className={cn(
                      "h-1.5 w-1.5 shrink-0 rounded-full",
                      priority === "emergency" && "bg-red-500",
                      priority === "vip" && "bg-amber-400",
                      priority === "normal" && "bg-muted-foreground/30",
                    )}
                    // aria-label={PRIORITY_LABEL[priority]}
                    aria-hidden="true"
                  />
                   <span className="sr-only">{PRIORITY_LABEL[priority]} priority</span>

                  {/* Ticket number */}
                  <span className="flex-1 font-mono text-sm font-semibold tabular-nums text-foreground">
                    {t.ticketNumber}
                  </span>

                  {/* Priority badge (non-normal only) */}
                  <PriorityBadge weight={t.priorityWeight} />

                  {/* Wait time */}
                  <span className="text-[10px] tabular-nums text-muted-foreground/60 shrink-0">
                    {relativeTime(t.createdAt)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/*  Error / empty state                                                       */
/* -------------------------------------------------------------------------- */

function ErrorBanner({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-2.5 text-sm">
      <XCircle size={15} className="shrink-0 text-red-500" />
      <span className="flex-1 text-muted-foreground">{message}</span>
      <button
        type="button"
        onClick={onRetry}
        className="flex items-center gap-1 text-xs text-primary hover:underline"
      >
        <RefreshCcw size={11} />
        Retry
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Error message resolver                                                    */
/* -------------------------------------------------------------------------- */

function resolveQueueErrorMessage(error: { code?: string; message?: string }): string {
  switch (error.code) {
    case "QUEUE_EMPTY":
      return "No patients waiting in queue";
    case "TICKET_NOT_FOUND":
      return "Ticket no longer exists. Refreshing queue state may help.";
    case "INVALID_STATUS_TRANSITION":
      return "This action is not available for the current ticket status.";
    case "FORBIDDEN":
      return "Service mismatch or insufficient permissions for this station.";
    default:
      return error.message ?? "Failed to load queue data";
  }
}

/* -------------------------------------------------------------------------- */
/*  QueueDashboard                                                            */
/* -------------------------------------------------------------------------- */

export function QueueDashboard() {
  const {
    summary,
    waitingTickets,
    currentTicket,
    isLoading,
    error,
    isActionInFlight,
    lastRefreshedAt,
    actionError,
    serviceId,
    refresh,
    provider,
    callNext,
    startServing,
    recall,
    skipNoShow,
    complete,
    transfer,
    isTransferInFlight,
    transferError,
    clearTransferError,
  } = useQueue();

  /* ---- Network health (offline / degraded mode) ------------------------- */
  const { networkStatus } = useNetworkHealthContext();
  const isOffline = networkStatus === "offline";

  const timer = useServingTimer(currentTicket);

  /* ---- Skip No-Show trigger ref (bridges F4 → ActionPanel confirmation) -- */
  const skipNoShowTriggerRef = useRef<(() => void) | null>(null);

  /* ---- Shortcut reference panel state ----------------------------------- */
  const [isShortcutPanelOpen, setIsShortcutPanelOpen] = useState(false);

  /* ---- Transfer dialog state ------------------------------------------- */
  const [isTransferDialogOpen, setIsTransferDialogOpen] = useState(false);
  const [transferSuccessMsg, setTransferSuccessMsg] = useState<string | null>(null);

  // Auto-dismiss the success banner after 6 seconds.
  useEffect(() => {
    if (!transferSuccessMsg) return;
    const t = setTimeout(() => setTransferSuccessMsg(null), 6_000);
    return () => clearTimeout(t);
  }, [transferSuccessMsg]);

  const handleOpenTransfer = useCallback(() => {
    clearTransferError();
    setIsTransferDialogOpen(true);
  }, [clearTransferError]);

  /* ---- Keyboard shortcuts ----------------------------------------------- */
  const anyActionInFlight = isActionInFlight || isTransferInFlight;
  const isCalled = currentTicket?.status === "CALLED";
  const isServing = currentTicket?.status === "SERVING";

  useKeyboardShortcuts({
    handlers: {
      onCallNext:     () => void callNext(),
      onStartServing: () => void startServing(),
      onRecall:       () => void recall(),
      onSkipNoShow:   () => skipNoShowTriggerRef.current?.(),
      onComplete:     () => void complete(),
      onTransfer:     handleOpenTransfer,
      onToggleHelp:   () => setIsShortcutPanelOpen((v) => !v),
      onEscape:       () => setIsShortcutPanelOpen(false),
    },
    enabled: {
      callNext:     !currentTicket && !!serviceId && !anyActionInFlight && !isOffline,
      startServing: !!isCalled  && !anyActionInFlight && !isOffline,
      recall:       !!isCalled  && !anyActionInFlight && !isOffline,
      skipNoShow:   !!isCalled  && !anyActionInFlight && !isOffline,
      complete:     !!isServing && !anyActionInFlight && !isOffline,
      transfer:     (!!isCalled || !!isServing) && !anyActionInFlight && !isOffline,
    },
    isModalOpen: isTransferDialogOpen,
  });

  const handleTransferConfirm = useCallback(
    async (params: { departmentId: string; serviceId: string; reasonId: string }) => {
      const result = await transfer(params);
      if (result) {
        setIsTransferDialogOpen(false);
        setTransferSuccessMsg(
          `Ticket transferred — new number: ${result.destinationTicket.ticketNumber}`,
        );
      }
      // On failure: transferError is set in useQueue and shown in the dialog.
    },
    [transfer],
  );

  return (
    <div className="flex flex-1 flex-col gap-3 overflow-hidden p-4">
      {/* Offline / degraded network banner */}
      <OfflineBanner lastRefreshedAt={lastRefreshedAt} />

      {/* Error banner */}
      {error && (
        <ErrorBanner
          message={resolveQueueErrorMessage(error)}
          onRetry={refresh}
        />
      )}

      {/* Transfer success banner */}
      {transferSuccessMsg && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-600">
          <ArrowRightLeft size={14} className="shrink-0" />
          <span className="flex-1">{transferSuccessMsg}</span>
          <button
            type="button"
            onClick={() => setTransferSuccessMsg(null)}
            className="ml-2 text-xs text-emerald-500/60 hover:text-emerald-500"
          >
            ✕
          </button>
        </div>
      )}

      {/* Summary metrics */}
      <div className="flex gap-3 shrink-0">
        <MetricCard
          icon={<Users size={15} className="text-primary" />}
          label="Waiting"
          value={summary?.waitingCount ?? 0}
          accent="bg-primary/10"
        />
        <MetricCard
          icon={<MonitorCheck size={15} className="text-blue-500" />}
          label="Serving"
          value={summary?.servingCount ?? 0}
          accent="bg-blue-500/10"
        />
        <MetricCard
          icon={<CheckCircle2 size={15} className="text-emerald-500" />}
          label="Done today"
          value={summary?.completedToday ?? 0}
          accent="bg-emerald-500/10"
        />
        <MetricCard
          icon={<XCircle size={15} className="text-amber-500" />}
          label="No-shows"
          value={summary?.noShowsToday ?? 0}
          accent="bg-amber-500/10"
        />
      </div>

      {/* Main area: serving card + waiting list */}
      {isLoading && !summary ? (
        <div className="flex flex-1 items-center justify-center">
          <Spinner size={24} className="text-primary/40" />
        </div>
      ) : (
        <div className="flex flex-1 gap-3 overflow-hidden">
          {/* Currently serving + actions — takes ~55% width */}
          <div className="flex w-[55%] shrink-0 flex-col">
            <CurrentTicketCard
              ticket={currentTicket}
              timer={timer}
              actions={
                <ActionPanel
                  currentTicket={currentTicket}
                  serviceId={serviceId}
                  isActionInFlight={isActionInFlight}
                  actionError={actionError}
                  isOffline={isOffline}
                  onCallNext={() => void callNext()}
                  onStartServing={() => void startServing()}
                  onRecall={() => void recall()}
                  onSkipNoShow={() => void skipNoShow()}
                  onComplete={() => void complete()}
                  onTransfer={handleOpenTransfer}
                  skipNoShowTriggerRef={skipNoShowTriggerRef}
                />
              }
            />
          </div>

          {/* Waiting list — takes remaining width */}
          <div className="flex flex-1 flex-col overflow-hidden">
            <WaitingList tickets={waitingTickets} isLoading={isLoading} />
          </div>
        </div>
      )}

      {/* Shortcut reference panel (F12) */}
      {isShortcutPanelOpen && (
        <ShortcutReferencePanel onClose={() => setIsShortcutPanelOpen(false)} />
      )}

      {/* Transfer dialog */}
      {isTransferDialogOpen && currentTicket && serviceId && (
        <TransferDialog
          ticket={currentTicket}
          currentServiceId={serviceId}
          provider={provider}
          isConfirming={isTransferInFlight}
          submitError={transferError?.message ?? null}
          onConfirm={(params) => void handleTransferConfirm(params)}
          onClose={() => setIsTransferDialogOpen(false)}
        />
      )}

      {/* Transfer error rendered inside dialog — propagated via transferError in useQueue.
           If the dialog is closed mid-error, show it in an inline banner. */}
      {!isTransferDialogOpen && transferError && (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-500">
          <ArrowRightLeft size={14} className="shrink-0" />
          <span className="flex-1">{transferError.message ?? "Transfer failed"}</span>
          <button
            type="button"
            onClick={clearTransferError}
            className="ml-2 text-xs text-red-400 hover:text-red-500"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
