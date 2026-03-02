/**
 * OfflineBanner — displays a prominent message when the network status is
 * "degraded" (WebSocket down, HTTP alive) or "offline" (both unreachable).
 *
 * Reads networkStatus from NetworkHealthContext — renders nothing when online.
 * Accepts an optional lastRefreshedAt timestamp to show how stale the data is.
 */

import { Clock, SignalLow, WifiOff } from "lucide-react";
import { useNetworkHealthContext } from "../providers/NetworkHealthContext";
import { useLanguage } from "../providers/LanguageContext";
import dashboardStrings from "../lib/i18n";
import { cn } from "../lib/utils";

/* -------------------------------------------------------------------------- */
/*  Timestamp helper                                                          */
/* -------------------------------------------------------------------------- */

function formatRelativeTime(date: Date, justNowLabel: string): string {
  const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diffSec <= 0) return justNowLabel;
  if (diffSec < 60) return `${diffSec}s`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m`;
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */

interface OfflineBannerProps {
  /** Timestamp of the last successful queue data fetch (from useQueue). */
  lastRefreshedAt: Date | null;
}

export function OfflineBanner({ lastRefreshedAt }: OfflineBannerProps) {
  const { networkStatus } = useNetworkHealthContext();
  const { lang } = useLanguage();
  const t = dashboardStrings[lang];

  // Nothing to render when the connection is healthy.
  if (networkStatus === "online") return null;

  const isOffline = networkStatus === "offline";

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={cn(
        "flex shrink-0 items-center gap-3 rounded-xl px-4 py-2.5 text-sm",
        isOffline
          ? "border border-red-500/20 bg-red-500/5 text-red-500"
          : "border border-amber-500/20 bg-amber-500/5 text-amber-600",
      )}
    >
      {/* Status icon */}
      {isOffline ? (
        <WifiOff size={14} className="shrink-0" aria-hidden="true" />
      ) : (
        <SignalLow size={14} className="shrink-0" aria-hidden="true" />
      )}

      {/* Message body */}
      <span className="flex-1 font-medium leading-snug">
        {isOffline ? t.connectionLost : t.degradedConnection}
      </span>

      {/* Last-updated timestamp — shows how old the queue data is */}
      {lastRefreshedAt && (
        <span
          className={cn(
            "flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-[11px]",
            isOffline
              ? "bg-red-500/10 text-red-400"
              : "bg-amber-500/10 text-amber-500",
          )}
          title={t.lastUpdated}
        >
          <Clock size={10} aria-hidden="true" />
          {formatRelativeTime(lastRefreshedAt, t.justNow)}
        </span>
      )}
    </div>
  );
}
