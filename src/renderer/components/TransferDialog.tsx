/**
 * TransferDialog — Phase 6.5 Transfer Flow.
 *
 * 3-step modal:
 *   Step 1 → Select destination department
 *   Step 2 → Select destination service (filtered by dept; same service excluded)
 *   Step 3 → Select transfer reason (required)
 *
 * Fetches departments + reasons in parallel on mount (cached for the dialog
 * session). Services for the selected department are fetched lazily when the
 * user advances to Step 2.
 *
 * Props:
 *   ticket          — the ticket being transferred (id + ticketNumber for display)
 *   currentServiceId — blocks selecting the same service as source
 *   provider        — TellerProvider instance (for getDepartments/getServices/getTransferReasons)
 *   isConfirming    — true while the parent's transfer API call is in-flight
 *   onConfirm       — called with { departmentId, serviceId, reasonId } — parent handles the API call
 *   onClose         — close the dialog (parent sets isOpen = false)
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Card } from "./ui/card";
import { Button } from "./ui/button";
import { Spinner } from "./ui/spinner";
import { cn } from "../lib/utils";
import type { Department, QueueTicket, Service, TransferReason } from "../data/types";
import type { TellerProvider } from "../data/teller-provider";
import {
  X,
  ChevronLeft,
  ArrowRightLeft,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

export interface TransferConfirmParams {
  departmentId: string;
  serviceId: string;
  reasonId: string;
}

export interface TransferDialogProps {
  ticket: QueueTicket;
  currentServiceId: string;
  provider: TellerProvider;
  isConfirming: boolean;
  /** Error from the transfer API call (set by parent after a failed submission). */
  submitError?: string | null;
  onConfirm(params: TransferConfirmParams): void;
  onClose(): void;
}

type Step = 1 | 2 | 3;

/* -------------------------------------------------------------------------- */
/*  Small sub-components                                                      */
/* -------------------------------------------------------------------------- */

/** Horizontal step indicator */
function StepBadges({ step }: { step: Step }) {
  const steps: { num: Step; label: string }[] = [
    { num: 1, label: "Department" },
    { num: 2, label: "Service" },
    { num: 3, label: "Reason" },
  ];

  return (
    <div className="flex items-center gap-1">
      {steps.map(({ num, label }, i) => (
        <div key={num} className="flex items-center gap-1">
          {i > 0 && (
            <div
              className={cn(
                "h-px w-4 transition-colors",
                step > num - 1 ? "bg-primary/60" : "bg-border",
              )}
            />
          )}
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                "flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold transition-colors",
                step === num
                  ? "bg-primary text-primary-foreground"
                  : step > num
                    ? "bg-primary/20 text-primary"
                    : "bg-muted text-muted-foreground",
              )}
            >
              {step > num ? <CheckCircle2 size={11} /> : num}
            </span>
            <span
              className={cn(
                "text-[11px] font-medium transition-colors",
                step === num ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {label}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Generic scrollable selection list */
function SelectionList<T>({
  items,
  selectedId,
  getId,
  renderItem,
  onSelect,
  emptyMessage,
  isLoading,
}: {
  items: T[];
  selectedId: string | null;
  getId(item: T): string;
  renderItem(item: T): React.ReactNode;
  onSelect(item: T): void;
  emptyMessage: string;
  isLoading?: boolean;
}) {
  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center py-8">
        <Spinner size={20} className="text-primary/40" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center py-8 text-sm text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-1.5 overflow-y-auto">
      {items.map((item) => {
        const id = getId(item);
        const isSelected = id === selectedId;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onSelect(item)}
            className={cn(
              "w-full rounded-xl border px-4 py-3 text-left text-sm transition-all",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
              isSelected
                ? "border-primary/40 bg-primary/8 text-foreground ring-1 ring-primary/30"
                : "border-border bg-card text-muted-foreground hover:border-border/80 hover:bg-muted/40 hover:text-foreground",
            )}
          >
            {renderItem(item)}
          </button>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  TransferDialog                                                            */
/* -------------------------------------------------------------------------- */

export function TransferDialog({
  ticket,
  currentServiceId,
  provider,
  isConfirming,
  submitError,
  onConfirm,
  onClose,
}: TransferDialogProps) {
  const [step, setStep] = useState<Step>(1);

  /* ---- Selections -------------------------------------------------------- */
  const [selectedDept, setSelectedDept] = useState<Department | null>(null);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [selectedReason, setSelectedReason] = useState<TransferReason | null>(null);

  /* ---- Data state -------------------------------------------------------- */
  const [departments, setDepartments] = useState<Department[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [reasons, setReasons] = useState<TransferReason[]>([]);
  const [isLoadingDepts, setIsLoadingDepts] = useState(true);
  const [isLoadingServices, setIsLoadingServices] = useState(false);
  const [isLoadingReasons, setIsLoadingReasons] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  /* ---- Scroll container refs per step ----------------------------------- */
  const listRef = useRef<HTMLDivElement>(null);

  /* ---- Fetch departments + reasons on mount (parallel) ------------------ */
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    setFetchError(null);

    Promise.all([provider.getDepartments(), provider.getTransferReasons()])
      .then(([depts, rsnList]) => {
        if (!mountedRef.current) return;
        setDepartments(depts);
        setReasons(rsnList);
        setIsLoadingDepts(false);
        setIsLoadingReasons(false);
      })
      .catch(() => {
        if (!mountedRef.current) return;
        setFetchError("Failed to load transfer data. Please close and try again.");
        setIsLoadingDepts(false);
        setIsLoadingReasons(false);
      });

    return () => {
      mountedRef.current = false;
    };
  }, [provider]);

  /* ---- Fetch services when department is selected ----------------------- */
  const fetchServices = useCallback(
    async (deptId: string) => {
      setIsLoadingServices(true);
      setFetchError(null);
      try {
        const svcList = await provider.getServices(deptId);
        if (!mountedRef.current) return;
        // Exclude the ticket's current service from destinations.
        // Do NOT filter by isActive here — the backend controls service availability;
        // silently hiding services causes the empty-list bug when isActive is unset.
        setServices(svcList.filter((s) => s.id !== currentServiceId));
      } catch {
        if (!mountedRef.current) return;
        setFetchError("Failed to load services for this department.");
      } finally {
        if (mountedRef.current) setIsLoadingServices(false);
      }
    },
    [provider, currentServiceId],
  );

  /* ---- Navigation ------------------------------------------------------- */

  // Selecting a department immediately fetches services and advances to step 2.
  const handleSelectDept = (dept: Department) => {
    setSelectedDept(dept);
    setSelectedService(null);
    setSelectedReason(null);
    void fetchServices(dept.id);
    setStep(2);
    listRef.current?.scrollTo(0, 0);
  };

  // Selecting a service immediately advances to step 3.
  const handleSelectService = (svc: Service) => {
    setSelectedService(svc);
    setStep(3);
    listRef.current?.scrollTo(0, 0);
  };

  const handleSelectReason = (reason: TransferReason) => {
    setSelectedReason(reason);
  };

  const handleBack = () => {
    if (step === 2) {
      setStep(1);
      setSelectedService(null);
    } else if (step === 3) {
      setStep(2);
    }
    listRef.current?.scrollTo(0, 0);
  };

  const handleConfirm = () => {
    if (!selectedDept || !selectedService || !selectedReason) return;
    onConfirm({
      departmentId: selectedDept.id,
      serviceId: selectedService.id,
      reasonId: selectedReason.id,
    });
  };

  /* ---- Keyboard: Escape closes dialog ----------------------------------- */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isConfirming) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isConfirming, onClose]);

  /* ---- Confirm is only enabled once a reason is selected --------------- */
  const canConfirm = !!selectedDept && !!selectedService && !!selectedReason;

  /* ---- Step headings ---------------------------------------------------- */
  const STEP_HEADING: Record<Step, string> = {
    1: "Select Department",
    2: `Services in ${selectedDept?.nameEn ?? "—"}`,
    3: "Reason for Transfer",
  };

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => {
        // Close on backdrop click unless confirming
        if (e.target === e.currentTarget && !isConfirming) onClose();
      }}
    >
      <Card className="relative flex w-[480px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-border/60 bg-background shadow-2xl">
        {/* ── Header ── */}
        <div className="flex items-start justify-between border-b border-border/50 px-5 py-4">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <ArrowRightLeft size={15} className="text-primary" />
              <span className="text-sm font-semibold">Transfer Ticket</span>
              <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-bold text-foreground">
                {ticket.ticketNumber}
              </span>
            </div>
            <StepBadges step={step} />
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isConfirming}
            className="rounded-lg p-1 text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            <X size={15} />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="flex min-h-[300px] flex-col gap-3 px-5 py-4">
          {/* Fetch error banner */}
          {fetchError && (
            <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2.5 text-xs text-red-500">
              <AlertCircle size={13} className="shrink-0" />
              <span>{fetchError}</span>
            </div>
          )}

          {/* Submit (transfer API) error banner */}
          {submitError && (
            <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2.5 text-xs text-red-500">
              <AlertCircle size={13} className="shrink-0" />
              <span>{submitError}</span>
            </div>
          )}

          {/* Step heading */}
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {STEP_HEADING[step]}
          </p>

          {/* Step content */}
          <div ref={listRef} className="flex flex-1 flex-col overflow-y-auto">
            {step === 1 && (
              <SelectionList<Department>
                items={departments}
                selectedId={selectedDept?.id ?? null}
                getId={(d) => d.id}
                renderItem={(d) => (
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium">{d.nameEn}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{d.nameAr}</span>
                  </div>
                )}
                onSelect={handleSelectDept}
                emptyMessage="No departments available"
                isLoading={isLoadingDepts}
              />
            )}

            {step === 2 && (
              <SelectionList<Service>
                items={services}
                selectedId={selectedService?.id ?? null}
                getId={(s) => s.id}
                renderItem={(s) => (
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-bold text-foreground">
                        {s.ticketPrefix}
                      </span>
                      <span className="font-medium">{s.nameEn}</span>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">{s.nameAr}</span>
                  </div>
                )}
                onSelect={handleSelectService}
                emptyMessage="No other services available in this department"
                isLoading={isLoadingServices}
              />
            )}

            {step === 3 && (
              <>
                {/* Summary of selected destination */}
                <div className="mb-3 rounded-xl border border-border/60 bg-muted/30 px-4 py-3">
                  <p className="text-[11px] text-muted-foreground">Transferring to</p>
                  <p className="mt-0.5 text-sm font-semibold text-foreground">
                    {selectedService?.nameEn}
                    <span className="ml-1.5 font-normal text-muted-foreground">
                      — {selectedDept?.nameEn}
                    </span>
                  </p>
                </div>

                <SelectionList<TransferReason>
                  items={reasons}
                  selectedId={selectedReason?.id ?? null}
                  getId={(r) => r.id}
                  renderItem={(r) => (
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-medium">{r.nameEn}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{r.nameAr}</span>
                    </div>
                  )}
                  onSelect={handleSelectReason}
                  emptyMessage="No transfer reasons configured"
                  isLoading={isLoadingReasons}
                />
              </>
            )}
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="flex items-center justify-between border-t border-border/50 px-5 py-3">
            {/* Left: Cancel (step 1) or Back (steps 2–3) */}
          {step === 1 ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={isConfirming}
              onClick={onClose}
              className="text-muted-foreground"
            >
              Cancel
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              disabled={isConfirming}
              onClick={handleBack}
              className="text-muted-foreground"
            >
              <ChevronLeft size={14} />
              Back
            </Button>
          )}

          {/* Right: Confirm (step 3 only) */}
          {step === 3 && (
            <Button
              size="sm"
              disabled={!canConfirm || isConfirming}
              onClick={handleConfirm}
              className="min-w-[120px] bg-blue-600 text-white hover:bg-blue-600/90"
            >
              {isConfirming ? (
                <Spinner size={14} />
              ) : (
                <ArrowRightLeft size={14} />
              )}
              {isConfirming ? "Transferring…" : "Confirm Transfer"}
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
