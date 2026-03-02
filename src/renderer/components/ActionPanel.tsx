/**
 * ActionPanel — teller queue action buttons (Phase 6.4).
 *
 * Renders contextually based on current ticket state:
 *   No ticket  → Call Next
 *   CALLED     → Start Serving (primary) + Recall + No-Show
 *   SERVING    → Complete (primary) + Transfer (stub for Phase 6.5)
 *              No-Show is NOT available when SERVING — patient is at the counter.
 *
 * Skip / No-Show uses an inline confirmation strip rather than a modal dialog,
 * keeping the layout compact for a teller counter screen.
 *
 * F-key shortcut hints are shown on each button. Actual keyboard wiring is
 * implemented in Phase 6.6 (useKeyboardShortcuts).
 */

import { useState, useEffect } from "react";
import { Button } from "./ui/button";
import { Spinner } from "./ui/spinner";
import { cn } from "../lib/utils";
import type { ApiError, QueueTicket } from "../data/types";
import {
  PhoneCall,
  Play,
  Volume2,
  UserX,
  CheckCircle2,
  ArrowRightLeft,
  AlertCircle,
} from "lucide-react";

/* -------------------------------------------------------------------------- */
/*  Props                                                                     */
/* -------------------------------------------------------------------------- */

export interface ActionPanelProps {
  currentTicket: QueueTicket | null | undefined;
  /** Bound service ID — required for Call Next; null until station resolves. */
  serviceId: string | null;
  /** True while any teller action API call is in-flight. */
  isActionInFlight: boolean;
  /** Last action error; null when no error or after a new action clears it. */
  actionError: ApiError | null;
  onCallNext(): void;
  onStartServing(): void;
  onRecall(): void;
  onSkipNoShow(): void;
  onComplete(): void;
  onTransfer(): void;
}

/* -------------------------------------------------------------------------- */
/*  Error message resolver                                                    */
/* -------------------------------------------------------------------------- */

function resolveActionError(error: ApiError): string {
  switch (error.code) {
    case "QUEUE_EMPTY":
      return "No patients waiting in queue";
    case "TICKET_NOT_FOUND":
      return "Ticket no longer exists — queue state refreshed";
    case "INVALID_STATUS_TRANSITION":
      return "Action not available for the current ticket status";
    case "STATION_NOT_FOUND":
      return "Station binding error — contact IT";
    case "FORBIDDEN":
      return "Service mismatch or insufficient permissions for this station";
    case "ACTIVE_TICKET_EXISTS":
      return "You already have an active ticket at this station";
    default:
      return error.message || "Action failed";
  }
}

/* -------------------------------------------------------------------------- */
/*  Shortcut key hint badge                                                   */
/* -------------------------------------------------------------------------- */

function Key({ label }: { label: string }) {
  return (
    <span className="ml-auto shrink-0 text-[10px] font-normal opacity-50">
      {label}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/*  ActionPanel                                                               */
/* -------------------------------------------------------------------------- */

export function ActionPanel({
  currentTicket,
  serviceId,
  isActionInFlight,
  actionError,
  onCallNext,
  onStartServing,
  onRecall,
  onSkipNoShow,
  onComplete,
  onTransfer,
}: ActionPanelProps) {
  // Snapshot stored when the teller initiates the No-Show confirmation.
  // Using a snapshot (not the live currentTicket) means:
  //  1. The displayed ticket number stays stable even if a WS event races in.
  //  2. handleSkipConfirm can guard against acting on the wrong ticket.
  // The useEffect below clears this whenever the ticket id/status changes,
  // so the strip auto-cancels on any external ticket mutation.
  const [confirmingSkipFor, setConfirmingSkipFor] = useState<{
    id: string;
    ticketNumber: string;
  } | null>(null);
  const confirmingSkip = confirmingSkipFor !== null;

  // Reset the inline confirmation strip if the ticket is cleared or its status
  // changes (e.g. a WebSocket event resolves the ticket while the strip is open).
  // Without this, the Confirm button would fire onSkipNoShow() with no valid
  // ticket context and leave the UI in a stuck/confusing state.
  useEffect(() => {
    setConfirmingSkipFor(null);
  }, [currentTicket?.id, currentTicket?.status]);

  const disabled = isActionInFlight;
  const hasTicket = !!currentTicket;
  const isCalled = currentTicket?.status === "CALLED";
  const isServing = currentTicket?.status === "SERVING";

  /* Reset skip confirmation whenever a fresh action is invoked. */
  const handleCallNext = () => {
    setConfirmingSkipFor(null);
    onCallNext();
  };
  const handleStartServing = () => {
    setConfirmingSkipFor(null);
    onStartServing();
  };
  const handleRecall = () => {
    setConfirmingSkipFor(null);
    onRecall();
  };
  const handleComplete = () => {
    setConfirmingSkipFor(null);
    onComplete();
  };
  const handleSkipConfirm = () => {
    // Guard: if the live ticket no longer matches the snapshot (a race slipped
    // past the useEffect reset), cancel silently rather than acting on the
    // wrong ticket.
    if (!confirmingSkipFor || currentTicket?.id !== confirmingSkipFor.id) {
      setConfirmingSkipFor(null);
      return;
    }
    setConfirmingSkipFor(null);
    onSkipNoShow();
  };

  return (
    <div className="flex flex-col gap-2 border-t border-border/50 px-4 pb-4 pt-3">
      {/* ── Action error bar ── */}
      {actionError && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-500">
          <AlertCircle size={12} className="shrink-0" />
          <span>{resolveActionError(actionError)}</span>
        </div>
      )}

      {/* ── Skip confirmation strip ── */}
      {confirmingSkip ? (
        <div className="flex flex-col gap-2">
          <p className="text-center text-xs font-medium text-muted-foreground">
            Mark{" "}
            <span className="font-semibold text-foreground">
              {confirmingSkipFor.ticketNumber}
            </span>{" "}
            as No-Show?
          </p>
          <div className="flex gap-2">
            <Button
              variant="destructive"
              size="sm"
              className="flex-1"
              disabled={disabled}
              onClick={handleSkipConfirm}
            >
              {disabled ? <Spinner size={14} /> : <UserX size={14} />}
              Confirm No-Show
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="flex-1"
              disabled={disabled}
              onClick={() => setConfirmingSkipFor(null)}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : !hasTicket ? (
        /* ── No active ticket: Call Next is the only action ── */
        <Button
          className="w-full bg-emerald-600 text-white hover:bg-emerald-600/90"
          size="lg"
          disabled={disabled || !serviceId}
          onClick={handleCallNext}
        >
          {disabled ? <Spinner size={16} /> : <PhoneCall size={16} />}
          Call Next
          <Key label="F1" />
        </Button>
      ) : isCalled ? (
        /* ── Ticket CALLED: Start Serving is primary ── */
        <>
          <Button
            className="w-full bg-blue-600 text-white hover:bg-blue-600/90"
            size="lg"
            disabled={disabled}
            onClick={handleStartServing}
          >
            {disabled ? <Spinner size={16} /> : <Play size={16} />}
            Start Serving
            <Key label="F2" />
          </Button>

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className={cn(
                "flex-1 border-amber-400/40 text-amber-500",
                "hover:bg-amber-400/10 hover:text-amber-500",
              )}
              disabled={disabled}
              onClick={handleRecall}
            >
              <Volume2 size={13} />
              Recall
              <Key label="F3" />
            </Button>

            <Button
              variant="outline"
              size="sm"
              className={cn(
                "flex-1 border-red-500/30 text-red-500",
                "hover:bg-red-500/10 hover:text-red-500",
              )}
              disabled={disabled}
              onClick={() =>
                setConfirmingSkipFor(
                  currentTicket
                    ? { id: currentTicket.id, ticketNumber: currentTicket.ticketNumber }
                    : null,
                )
              }
            >
              <UserX size={13} />
              No-Show
              <Key label="F4" />
            </Button>
          </div>

          <Button
            variant="outline"
            size="sm"
            className={cn(
              "w-full border-blue-500/30 text-blue-500",
              "hover:bg-blue-500/10 hover:text-blue-500",
            )}
            disabled={disabled}
            onClick={onTransfer}
          >
            <ArrowRightLeft size={13} />
            Transfer
            <Key label="F6" />
          </Button>
        </>
      ) : isServing ? (
        /* ── Ticket SERVING: Complete is primary.
             No-Show is intentionally absent — patient is physically present. ── */
        <>
          <Button
            className="w-full bg-emerald-600 text-white hover:bg-emerald-600/90"
            size="lg"
            disabled={disabled}
            onClick={handleComplete}
          >
            {disabled ? <Spinner size={16} /> : <CheckCircle2 size={16} />}
            Complete
            <Key label="F5" />
          </Button>

          <Button
            variant="outline"
            size="sm"
            className={cn(
              "w-full border-blue-500/30 text-blue-500",
              "hover:bg-blue-500/10 hover:text-blue-500",
            )}
            disabled={disabled}
            onClick={onTransfer}
          >
            <ArrowRightLeft size={13} />
            Transfer
            <Key label="F6" />
          </Button>
        </>
      ) : null}
    </div>
  );
}
