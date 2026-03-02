/**
 * ConnectionStatus — minimal realtime connection indicator.
 *
 * Renders a coloured dot with a tooltip showing the last connected timestamp.
 * Read from SocketContext — no props required.
 *
 *  ● green   = connected
 *  ● yellow  = connecting / reconnecting
 *  ● red     = disconnected
 */

import { cn } from "../lib/utils";
import { useSocketContext } from "../providers/SocketContext";
import { useLanguage } from "../providers/LanguageContext";
import dashboardStrings from "../lib/i18n";

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */

interface ConnectionStatusProps {
  className?: string;
}

export function ConnectionStatus({ className }: ConnectionStatusProps) {
  const { connectionState, lastConnectedAt } = useSocketContext();
  const { lang } = useLanguage();
  const t = dashboardStrings[lang];

  const isConnected = connectionState === "connected";
  const isConnecting = connectionState === "connecting";

  const dotClass = cn(
    "h-2 w-2 rounded-full",
    isConnected && "bg-emerald-500",
    isConnecting && "bg-amber-400 animate-pulse",
    !isConnected && !isConnecting && "bg-red-500",
  );

  const label = isConnected
    ? t.connLive
    : isConnecting
      ? t.connReconnecting
      : t.connOffline;

  const title = lastConnectedAt
    ? `${label} · ${t.connLastAt} ${formatTime(lastConnectedAt)}`
    : label;

  return (
    <div
      className={cn(
        "flex items-center gap-1.5",
        className,
      )}
      title={title}
      aria-label={title}
      role="status"
      aria-live="polite"
    >
      <span className={dotClass} />
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}
