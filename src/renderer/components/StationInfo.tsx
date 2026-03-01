/**
 * StationInfo — compact header bar displayed at the top of the teller dashboard
 * once the user is authenticated and the station is bound.
 *
 * Shows: counter code · service name · teller name · live connection status.
 *
 * The `lang` prop controls which bilingual service/department names to display.
 * Connection status reflects live WebSocket state via ConnectionStatus (Phase 6.3).
 */

import { MonitorDot } from "lucide-react";
import { cn } from "../lib/utils";
import { useStation } from "../hooks/useStation";
import { ConnectionStatus } from "./ConnectionStatus";

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

interface StationInfoProps {
  /** Authenticated teller's display name or email. */
  tellerName?: string;
  /** Current UI language — controls which bilingual names to show. */
  lang?: "en" | "ar";
  className?: string;
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */

export function StationInfo({
  tellerName,
  lang = "en",
  className,
}: StationInfoProps) {
  const { binding } = useStation();

  if (!binding) return null;

  const serviceName =
    lang === "ar" ? binding.serviceNameAr : binding.serviceNameEn;
  const departmentName =
    lang === "ar" ? binding.departmentNameAr : binding.departmentNameEn;

  return (
    <header
      className={cn(
        "flex h-11 shrink-0 items-center justify-between border-b border-border bg-card px-4",
        className,
      )}
    >
      {/* Left — station identity */}
      <div className="flex items-center gap-2.5">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/15 ring-1 ring-primary/25">
          <MonitorDot size={13} className="text-primary" />
        </div>

        <div className="flex items-center gap-1.5 text-sm">
          <span className="font-semibold text-foreground">
            {binding.counterCode}
          </span>
          <span className="text-muted-foreground/60">·</span>
          <span className="text-muted-foreground">{serviceName}</span>
          {departmentName && (
            <>
              <span className="text-muted-foreground/40">·</span>
              <span className="text-xs text-muted-foreground/70">
                {departmentName}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Right — teller name + connection dot */}
      <div className="flex items-center gap-3">
        {tellerName && (
          <span className="max-w-[160px] truncate text-xs text-muted-foreground">
            {tellerName}
          </span>
        )}
        <ConnectionStatus />
      </div>
    </header>
  );
}
