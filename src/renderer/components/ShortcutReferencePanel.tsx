/**
 * ShortcutReferencePanel — compact overlay showing all keyboard shortcuts.
 *
 * Triggered by F12, dismissed by Escape or clicking outside.
 * Uses a semi-transparent backdrop so the queue state remains visible.
 */

import { useEffect } from "react";
import { Card } from "./ui/card";
import { SHORTCUTS } from "../lib/shortcuts";
import { Keyboard, X } from "lucide-react";
import { useLanguage } from "../providers/LanguageContext";
import dashboardStrings from "../lib/i18n";

/* -------------------------------------------------------------------------- */
/*  Reference rows                                                            */
/* -------------------------------------------------------------------------- */

interface ShortcutRowEntry {
  keyLabel: string;
  action: string;
  condition: string;
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */

interface ShortcutReferencePanelProps {
  onClose(): void;
}

export function ShortcutReferencePanel({ onClose }: ShortcutReferencePanelProps) {
  const { lang } = useLanguage();
  const t = dashboardStrings[lang];

  const ROWS: ShortcutRowEntry[] = [
    { keyLabel: SHORTCUTS.CALL_NEXT.label,     action: t.scCallNext,       condition: t.scCondNoActive },
    { keyLabel: SHORTCUTS.START_SERVING.label, action: t.scStartServing,   condition: t.scCondCalled },
    { keyLabel: SHORTCUTS.RECALL.label,        action: t.scRecall,         condition: t.scCondCalled },
    { keyLabel: SHORTCUTS.SKIP_NO_SHOW.label,  action: t.scSkipNoShow,     condition: t.scCondCalled },
    { keyLabel: SHORTCUTS.COMPLETE.label,      action: t.scComplete,       condition: t.scCondServing },
    { keyLabel: SHORTCUTS.TRANSFER.label,      action: t.scTransfer,       condition: t.scCondAnyActive },
    { keyLabel: SHORTCUTS.SHORTCUT_HELP.label, action: t.scShowPanel,      condition: t.scCondAlways },
    { keyLabel: SHORTCUTS.ESCAPE.label,        action: t.scCloseDialog,    condition: t.scCondWhenOpen },
  ];
  // Escape key handled by useKeyboardShortcuts (onEscape → closes panel).
  // We also handle it here as a direct fallback for the panel itself.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [onClose]);

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-40 flex items-end justify-start bg-background/60 backdrop-blur-sm p-4"
      role="presentation"
      onClick={onClose}
    >
      <Card
        className="w-72 overflow-hidden shadow-2xl ring-1 ring-border/60"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcut reference"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
          <div className="flex items-center gap-2">
            <Keyboard size={14} className="text-primary" />
            <span className="text-sm font-semibold text-foreground">{t.shortcutReference}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
            aria-label="Close"
          >
            <X size={13} />
          </button>
        </div>

        {/* Shortcut rows */}
        <div className="flex flex-col divide-y divide-border/30">
          {ROWS.map((row) => (
            <div key={row.keyLabel} className="flex items-center gap-3 px-4 py-2">
              {/* Key badge */}
              <kbd className="shrink-0 inline-flex h-6 min-w-[2rem] items-center justify-center rounded border border-border bg-secondary px-1.5 font-mono text-[11px] font-semibold text-foreground shadow-sm">
                {row.keyLabel}
              </kbd>
              {/* Action + condition */}
              <div className="flex flex-1 flex-col min-w-0">
                <span className="text-xs font-medium text-foreground leading-tight">
                  {row.action}
                </span>
                <span className="text-[10px] text-muted-foreground leading-tight">
                  {row.condition}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Footer hint */}
        <div className="border-t border-border/30 px-4 py-2.5">
          <p className="text-center text-[10px] text-muted-foreground/60">
            Press{" "}
            <kbd className="inline-flex items-center rounded border border-border bg-secondary px-1 font-mono text-[10px]">
              F12
            </kbd>{" "}
            or{" "}
            <kbd className="inline-flex items-center rounded border border-border bg-secondary px-1 font-mono text-[10px]">
              Esc
            </kbd>{" "}
            {t.scFooter}
          </p>
        </div>
      </Card>
    </div>
  );
}
