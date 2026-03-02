/**
 * StationInfo — compact header bar displayed at the top of the teller dashboard
 * once the user is authenticated and the station is bound.
 *
 * Shows: counter code · service name · teller name · language toggle · logout.
 * Connection status reflects live WebSocket state via ConnectionStatus (Phase 6.3).
 */

import { useState } from "react";
import { Globe, LogOut, MonitorDot } from "lucide-react";
import { cn } from "../lib/utils";
import { useStation } from "../hooks/useStation";
import { useAuth } from "../hooks/useAuth";
import { useLanguage } from "../providers/LanguageContext";
import { ConnectionStatus } from "./ConnectionStatus";
import { Button } from "./ui/button";
import { Spinner } from "./ui/spinner";
import dashboardStrings from "../lib/i18n";

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
  lang: langProp,
  className,
}: StationInfoProps) {
  const { binding } = useStation();
  const { logout, isLoading } = useAuth();
  const { lang: ctxLang, toggleLang } = useLanguage();
  const lang = langProp ?? ctxLang;
  const t = dashboardStrings[lang];

  const [confirmLogout, setConfirmLogout] = useState(false);

  if (!binding) return null;

  const serviceName =
    lang === "ar" ? binding.serviceNameAr : binding.serviceNameEn;
  const departmentName =
    lang === "ar" ? binding.departmentNameAr : binding.departmentNameEn;

  const handleLogout = async () => {
    await logout();
  };

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

      {/* Right — teller name + language toggle + connection + logout */}
      <div className="flex items-center gap-2">
        {tellerName && (
          <span className="max-w-[140px] truncate text-xs text-muted-foreground">
            {tellerName}
          </span>
        )}

        <ConnectionStatus />

        {/* Language toggle */}
        <button
          type="button"
          onClick={toggleLang}
          className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Toggle language"
        >
          <Globe size={12} />
          <span>{t.langToggle}</span>
        </button>

        {/* Logout */}
        {confirmLogout ? (
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-muted-foreground">{t.logoutConfirm}</span>
            <Button
              variant="destructive"
              size="sm"
              className="h-6 px-2 text-[11px]"
              disabled={isLoading}
              onClick={() => void handleLogout()}
            >
              {isLoading ? <Spinner size={11} /> : t.logoutYes}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[11px]"
              onClick={() => setConfirmLogout(false)}
            >
              {t.logoutCancel}
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmLogout(true)}
            className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={t.logout}
          >
            <LogOut size={12} />
            <span>{t.logout}</span>
          </button>
        )}
      </div>
    </header>
  );
}
