/**
 * StationInfo — compact header bar displayed at the top of the teller dashboard
 * once the user is authenticated and the station is bound.
 *
 * Shows: counter code · service name · language toggle · user menu (name → popover).
 * Connection status reflects live WebSocket state via ConnectionStatus (Phase 6.3).
 */

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Globe, LogOut, MonitorDot, UserRound } from "lucide-react";
import { cn } from "../lib/utils";
import { useStation } from "../hooks/useStation";
import { useAuth } from "../hooks/useAuth";
import { useLanguage } from "../providers/LanguageContext";
import { ConnectionStatus } from "./ConnectionStatus";
import { Spinner } from "./ui/spinner";
import dashboardStrings from "../lib/i18n";

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

interface StationInfoProps {
  /** Authenticated teller's display name or email. */
  tellerName?: string;
  className?: string;
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */

export function StationInfo({ tellerName, className }: StationInfoProps) {
  const { binding } = useStation();
  const { logout, isLoading } = useAuth();
  const { lang, toggleLang } = useLanguage();
  const t = dashboardStrings[lang];

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handle = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [menuOpen]);

  // Close on Escape
  useEffect(() => {
    if (!menuOpen) return;
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [menuOpen]);

  if (!binding) return null;

  const serviceName =
    lang === "ar" ? binding.serviceNameAr : binding.serviceNameEn;
  const departmentName =
    lang === "ar" ? binding.departmentNameAr : binding.departmentNameEn;

  const displayName = tellerName ?? "—";
  // First character upper-cased for the avatar fallback
  const initial = displayName.charAt(0).toUpperCase();

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

      {/* Right — connection + language toggle + user menu */}
      <div className="flex items-center gap-2">
        <ConnectionStatus />

        {/* Language toggle */}
        <button
          type="button"
          onClick={toggleLang}
          className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={t.langToggle}
        >
          <Globe size={12} />
          <span>{t.langToggle}</span>
        </button>

        {/* User menu */}
        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="true"
            aria-expanded={menuOpen}
            aria-label={displayName}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[11px] transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              menuOpen
                ? "bg-muted/60 text-foreground"
                : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
            )}
          >
            {/* Mini avatar */}
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary ring-1 ring-primary/20">
              {initial}
            </span>
            <span className="max-w-[100px] truncate">{displayName}</span>
            <ChevronDown
              size={11}
              className={cn("shrink-0 transition-transform", menuOpen && "rotate-180")}
            />
          </button>

          {/* Dropdown panel */}
          {menuOpen && (
            <div
              className={cn(
                "absolute z-50 mt-1.5 min-w-[180px] overflow-hidden rounded-xl border border-border/60 bg-card shadow-lg",
                "animate-slide-up",
                lang === "ar" ? "left-0" : "right-0",
              )}
              role="menu"
              aria-label={displayName}
            >
              {/* User header */}
              <div className="flex items-center gap-2.5 border-b border-border/40 px-3 py-2.5">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary ring-1 ring-primary/20">
                  {initial}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[11px] font-semibold text-foreground leading-tight">
                    {displayName}
                  </p>
                  <p className="text-[10px] text-muted-foreground leading-tight">
                    {binding.counterCode}
                  </p>
                </div>
              </div>

              {/* Actions */}
              <div className="p-1">
                <button
                  type="button"
                  role="menuitem"
                  disabled={isLoading}
                  onClick={() => void logout()}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[12px] font-medium text-destructive",
                    "transition-colors hover:bg-destructive/10",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    "disabled:opacity-50",
                  )}
                >
                  {isLoading ? (
                    <Spinner size={13} className="text-destructive/60" />
                  ) : (
                    <LogOut size={13} />
                  )}
                  {t.logout}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
