/**
 * useKeyboardShortcuts — global keyboard shortcut handler (Phase 6.6).
 *
 * Registers a single `keydown` listener on `window`.
 * Uses refs so the listener is registered only once per mount (stable closure),
 * while still reacting to the latest handler functions and enabled flags.
 *
 * Safeguards:
 *  - Skips when a text input / textarea / select / contenteditable is focused.
 *  - Blocks action F-keys while a modal dialog is open (Escape + F12 still pass).
 *  - 300 ms per-key debounce to prevent duplicate calls from held keys.
 */

import { useEffect, useRef } from "react";
import { SHORTCUTS } from "../lib/shortcuts";

/* -------------------------------------------------------------------------- */
/*  Public interface                                                          */
/* -------------------------------------------------------------------------- */

export interface ShortcutHandlers {
  /** Fired when F1 pressed and callNext is enabled. */
  onCallNext?: () => void;
  /** Fired when F2 pressed and startServing is enabled. */
  onStartServing?: () => void;
  /** Fired when F3 pressed and recall is enabled. */
  onRecall?: () => void;
  /** Fired when F4 pressed and skipNoShow is enabled. */
  onSkipNoShow?: () => void;
  /** Fired when F5 pressed and complete is enabled. */
  onComplete?: () => void;
  /** Fired when F6 pressed and transfer is enabled. */
  onTransfer?: () => void;
  /** Fired when F12 pressed (always, even when modal is open). */
  onToggleHelp?: () => void;
  /**
   * Fired when Escape pressed and no modal is open.
   * Use this to dismiss the shortcut reference panel.
   * When a modal is open, Escape is left to the modal's own handler.
   */
  onEscape?: () => void;
}

export interface ShortcutEnabled {
  /** F1  — true only when no active ticket exists at this station. */
  callNext: boolean;
  /** F2  — true only when active ticket is CALLED. */
  startServing: boolean;
  /** F3  — true only when active ticket is CALLED. */
  recall: boolean;
  /** F4  — true only when active ticket is CALLED. */
  skipNoShow: boolean;
  /** F5  — true only when active ticket is SERVING. */
  complete: boolean;
  /** F6  — true when active ticket is CALLED or SERVING. */
  transfer: boolean;
}

export interface UseKeyboardShortcutsOptions {
  handlers: ShortcutHandlers;
  enabled: ShortcutEnabled;
  /**
   * Set to `true` while a modal dialog (e.g. TransferDialog) is open.
   * Blocks all action F-keys so they don't accidentally fire the underlying action.
   * F12 (toggle help) still fires. Escape is left entirely to the modal.
   */
  isModalOpen: boolean;
}

/* -------------------------------------------------------------------------- */
/*  Hook                                                                      */
/* -------------------------------------------------------------------------- */

const DEBOUNCE_MS = 300;

/** Returns true when focus is inside a text-entry element. */
function isInputFocused(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if ((el as HTMLElement).isContentEditable) return true;
  return false;
}

export function useKeyboardShortcuts({
  handlers,
  enabled,
  isModalOpen,
}: UseKeyboardShortcutsOptions): void {
  // Keep latest values in refs so the event listener closure never goes stale.
  const handlersRef = useRef<ShortcutHandlers>(handlers);
  const enabledRef = useRef<ShortcutEnabled>(enabled);
  const isModalOpenRef = useRef<boolean>(isModalOpen);

  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);
  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);
  useEffect(() => {
    isModalOpenRef.current = isModalOpen;
  }, [isModalOpen]);

  useEffect(() => {
    // Per-key debounce: maps key string → timestamp of last fire.
    const lastFired = new Map<string, number>();

    /** Returns true if the key is still within the debounce window. */
    function isDebounced(key: string): boolean {
      return Date.now() - (lastFired.get(key) ?? 0) < DEBOUNCE_MS;
    }

    /** Stamp the key as fired — called only when a handler is actually invoked. */
    function stampFired(key: string): void {
      lastFired.set(key, Date.now());
    }

    function handleKeyDown(event: KeyboardEvent): void {
      const key = event.key;

      // Skip when focus is inside a text entry element.
      if (isInputFocused()) return;

      const h = handlersRef.current;
      const en = enabledRef.current;
      const modalOpen = isModalOpenRef.current;

      // ── F12: toggle shortcut reference panel — always fires ──────────────
      if (key === SHORTCUTS.SHORTCUT_HELP.key) {
        if (isDebounced(key)) return;
        event.preventDefault();
        stampFired(key);
        h.onToggleHelp?.();
        return;
      }

      // ── Escape: close panels only when no modal is open ─────────────────
      if (key === SHORTCUTS.ESCAPE.key) {
        if (!modalOpen) {
          if (isDebounced(key)) return;
          stampFired(key);
          h.onEscape?.();
        }
        return;
      }

      // ── All action F-keys are blocked while a modal is open ─────────────
      if (modalOpen) return;

      switch (key) {
        case SHORTCUTS.CALL_NEXT.key:
          if (en.callNext && !isDebounced(key)) {
            event.preventDefault();
            stampFired(key);
            h.onCallNext?.();
          }
          break;
        case SHORTCUTS.START_SERVING.key:
          if (en.startServing && !isDebounced(key)) {
            event.preventDefault();
            stampFired(key);
            h.onStartServing?.();
          }
          break;
        case SHORTCUTS.RECALL.key:
          if (en.recall && !isDebounced(key)) {
            event.preventDefault();
            stampFired(key);
            h.onRecall?.();
          }
          break;
        case SHORTCUTS.SKIP_NO_SHOW.key:
          if (en.skipNoShow && !isDebounced(key)) {
            event.preventDefault();
            stampFired(key);
            h.onSkipNoShow?.();
          }
          break;
        case SHORTCUTS.COMPLETE.key:
          if (en.complete && !isDebounced(key)) {
            event.preventDefault();
            stampFired(key);
            h.onComplete?.();
          }
          break;
        case SHORTCUTS.TRANSFER.key:
          if (en.transfer && !isDebounced(key)) {
            event.preventDefault();
            stampFired(key);
            h.onTransfer?.();
          }
          break;
        default:
          break;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []); // Stable closure — reads from refs. Registration runs once.
}
