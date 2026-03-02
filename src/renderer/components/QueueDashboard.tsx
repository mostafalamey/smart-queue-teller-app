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
import { useLanguage } from "../providers/LanguageContext";
import dashboardStrings from "../lib/i18n";
import type { DashboardStrings } from "../lib/i18n";
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

function getPriorityLabel(priority: Priority, t: DashboardStrings): string {
  return t[priority];
}

const PRIORITY_BADGE_CLASS: Record<Priority, string> = {
  emergency:
    "bg-red-500/15 text-red-500 ring-1 ring-red-500/30",
  vip: "bg-amber-400/15 text-amber-500 ring-1 ring-amber-400/30",
  normal: "bg-secondary text-muted-foreground",
};

function PriorityBadge({ weight, t, className }: { weight: number; t: DashboardStrings; className?: string }) {
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
      {getPriorityLabel(priority, t)}
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
    <Card className="flex flex-1 items-center gap-3 px-4 py-3" role="status" aria-label={`${label}: ${value}`}>
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
  t: DashboardStrings;
  /** ActionPanel content slotted into the bottom of the card. */
  actions: React.ReactNode;
}

function CurrentTicketCard({ ticket, timer, t, actions }: CurrentTicketCardProps) {
  if (!ticket) {
    return (
      <Card className="flex flex-1 flex-col overflow-hidden" role="region" aria-label={t.counterReady}>
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-10 text-center">
          <MonitorCheck size={32} className="text-muted-foreground/30" />
          <p className="text-sm font-medium text-foreground">{t.counterReady}</p>
          <p className="text-xs text-muted-foreground">{t.noActiveTicket}</p>
        </div>
        {actions}
      </Card>
    );
  }

  const priority = getPriority(ticket.priorityWeight);

  return (
    <Card
      role="region"
      aria-label={`${t.statusServing} ${ticket.ticketNumber}`}
      aria-live="polite"
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
              {t.statusServing}
            </span>
          ) : (
            <span className="rounded-full bg-amber-400/15 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-500 ring-1 ring-amber-400/30">
              {t.statusCalled}
            </span>
          )}
          <PriorityBadge weight={ticket.priorityWeight} t={t} />
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
  t: DashboardStrings;
}

function WaitingList({ tickets, isLoading, t }: WaitingListProps) {
  return (
    <Card className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/50 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Users size={13} className="text-muted-foreground/60" />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t.waitingHeader}
          </span>
        </div>
        {isLoading && <Spinner size={12} className="text-muted-foreground/50" />}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {tickets.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-1.5 py-10">
            <CheckCircle2 size={24} className="text-emerald-500/40" />
            <p className="text-xs text-muted-foreground/60">{t.queueEmpty}</p>
          </div>
        ) : (
          <ul className="divide-y divide-border/40">
            {tickets.map((ticket, idx) => {
              const priority = getPriority(ticket.priorityWeight);
              return (
                <li
                  key={ticket.id}
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
                    aria-hidden="true"
                  />
                   <span className="sr-only">{getPriorityLabel(priority, t)} priority</span>

                  {/* Ticket number */}
                  <span className="flex-1 font-mono text-sm font-semibold tabular-nums text-foreground">
                    {ticket.ticketNumber}
                  </span>

                  {/* Priority badge (non-normal only) */}
                  <PriorityBadge weight={ticket.priorityWeight} t={t} />

                  {/* Wait time */}
                  <span className="text-[10px] tabular-nums text-muted-foreground/60 shrink-0">
                    {relativeTime(ticket.createdAt)}
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
/*  Loading skeletons                                                         */
/* -------------------------------------------------------------------------- */

function SkeletonPulse({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-muted/60", className)} />;
}

function SkeletonDashboard() {
  return (
    <>
      {/* Metric cards skeleton */}
      <div className="flex gap-3 shrink-0">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="flex flex-1 items-center gap-3 px-4 py-3">
            <SkeletonPulse className="h-8 w-8 rounded-lg" />
            <div className="space-y-1.5">
              <SkeletonPulse className="h-2.5 w-12" />
              <SkeletonPulse className="h-5 w-8" />
            </div>
          </Card>
        ))}
      </div>

      {/* Main area skeleton */}
      <div className="flex flex-1 gap-3 overflow-hidden">
        {/* Serving card skeleton */}
        <Card className="flex w-[55%] shrink-0 flex-col items-center justify-center gap-4 py-10">
          <SkeletonPulse className="h-5 w-20 rounded-full" />
          <SkeletonPulse className="h-14 w-36" />
          <SkeletonPulse className="h-4 w-16" />
          <div className="mt-4 w-full space-y-2 px-8">
            <SkeletonPulse className="h-10 w-full rounded-lg" />
            <div className="flex gap-2">
              <SkeletonPulse className="h-8 flex-1 rounded-lg" />
              <SkeletonPulse className="h-8 flex-1 rounded-lg" />
            </div>
          </div>
        </Card>

        {/* Waiting list skeleton */}
        <Card className="flex flex-1 flex-col overflow-hidden">
          <div className="border-b border-border/50 px-4 py-2.5">
            <SkeletonPulse className="h-3 w-16" />
          </div>
          <div className="space-y-0">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                <SkeletonPulse className="h-3 w-4" />
                <SkeletonPulse className="h-1.5 w-1.5 rounded-full" />
                <SkeletonPulse className="h-4 w-16" />
                <div className="flex-1" />
                <SkeletonPulse className="h-3 w-8" />
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
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

  /* ---- Language --------------------------------------------------------- */
  const { lang } = useLanguage();
  const t = dashboardStrings[lang];

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
    <div className="flex flex-1 flex-col gap-3 overflow-hidden p-4 animate-fade-in">
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
      <div className="flex gap-3 shrink-0 animate-slide-up">
        <MetricCard
          icon={<Users size={15} className="text-primary" />}
          label={t.waiting}
          value={summary?.waitingCount ?? 0}
          accent="bg-primary/10"
        />
        <MetricCard
          icon={<MonitorCheck size={15} className="text-blue-500" />}
          label={t.serving}
          value={summary?.servingCount ?? 0}
          accent="bg-blue-500/10"
        />
        <MetricCard
          icon={<CheckCircle2 size={15} className="text-emerald-500" />}
          label={t.doneToday}
          value={summary?.completedToday ?? 0}
          accent="bg-emerald-500/10"
        />
        <MetricCard
          icon={<XCircle size={15} className="text-amber-500" />}
          label={t.noShows}
          value={summary?.noShowsToday ?? 0}
          accent="bg-amber-500/10"
        />
      </div>

      {/* Main area: serving card + waiting list */}
      {isLoading && !summary ? (
        <SkeletonDashboard />
      ) : (
        <div className="flex flex-1 gap-3 overflow-hidden">
          {/* Currently serving + actions — takes ~55% width */}
          <div className="flex w-[55%] shrink-0 flex-col">
            <CurrentTicketCard
              ticket={currentTicket}
              timer={timer}
              t={t}
              actions={
                <ActionPanel
                  currentTicket={currentTicket}
                  serviceId={serviceId}
                  isActionInFlight={isActionInFlight}
                  actionError={actionError}
                  isOffline={isOffline}
                  t={t}
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
            <WaitingList tickets={waitingTickets} isLoading={isLoading} t={t} />
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
          <span className="flex-1">{transferError.message ?? t.errActionFailed}</span>
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
