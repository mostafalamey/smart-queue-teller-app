/**
 * Unit tests for useKeyboardShortcuts.ts
 *
 * Coverage:
 *  - Each action F-key fires its handler when enabled
 *  - Disabled keys are silently ignored
 *  - 300 ms per-key debounce blocks rapid repeat presses
 *  - Modal-open flag blocks action F-keys (F1–F6) but not F12
 *  - Escape fires only when no modal is open
 *  - Input-element focus suppresses all shortcuts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import {
  useKeyboardShortcuts,
  type ShortcutEnabled,
  type ShortcutHandlers,
} from "../useKeyboardShortcuts";

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

const ALL_ENABLED: ShortcutEnabled = {
  callNext: true,
  startServing: true,
  recall: true,
  skipNoShow: true,
  complete: true,
  transfer: true,
};

const ALL_DISABLED: ShortcutEnabled = {
  callNext: false,
  startServing: false,
  recall: false,
  skipNoShow: false,
  complete: false,
  transfer: false,
};

function fireKey(key: string): void {
  window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
}

function mountHook(
  handlers: Partial<ShortcutHandlers>,
  enabled: ShortcutEnabled = ALL_ENABLED,
  isModalOpen = false,
) {
  const fullHandlers: ShortcutHandlers = {
    onCallNext: vi.fn(),
    onStartServing: vi.fn(),
    onRecall: vi.fn(),
    onSkipNoShow: vi.fn(),
    onComplete: vi.fn(),
    onTransfer: vi.fn(),
    onToggleHelp: vi.fn(),
    onEscape: vi.fn(),
    ...handlers,
  };

  const { unmount, rerender } = renderHook(
    ({
      h,
      en,
      modal,
    }: {
      h: ShortcutHandlers;
      en: ShortcutEnabled;
      modal: boolean;
    }) =>
      useKeyboardShortcuts({ handlers: h, enabled: en, isModalOpen: modal }),
    { initialProps: { h: fullHandlers, en: enabled, modal: isModalOpen } },
  );

  return { handlers: fullHandlers, unmount, rerender };
}

/* -------------------------------------------------------------------------- */
/*  Tests                                                                     */
/* -------------------------------------------------------------------------- */

describe("useKeyboardShortcuts", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: 1_000 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /* ---- Action key dispatch ---------------------------------------------- */

  it("fires onCallNext when F1 is pressed and callNext is enabled", () => {
    const onCallNext = vi.fn();
    const { unmount } = mountHook({ onCallNext });
    fireKey("F1");
    expect(onCallNext).toHaveBeenCalledOnce();
    unmount();
  });

  it("fires onStartServing when F2 is pressed and startServing is enabled", () => {
    const onStartServing = vi.fn();
    const { unmount } = mountHook({ onStartServing });
    fireKey("F2");
    expect(onStartServing).toHaveBeenCalledOnce();
    unmount();
  });

  it("fires onRecall when F3 is pressed and recall is enabled", () => {
    const onRecall = vi.fn();
    const { unmount } = mountHook({ onRecall });
    fireKey("F3");
    expect(onRecall).toHaveBeenCalledOnce();
    unmount();
  });

  it("fires onSkipNoShow when F4 is pressed and skipNoShow is enabled", () => {
    const onSkipNoShow = vi.fn();
    const { unmount } = mountHook({ onSkipNoShow });
    fireKey("F4");
    expect(onSkipNoShow).toHaveBeenCalledOnce();
    unmount();
  });

  it("fires onComplete when F5 is pressed and complete is enabled", () => {
    const onComplete = vi.fn();
    const { unmount } = mountHook({ onComplete });
    fireKey("F5");
    expect(onComplete).toHaveBeenCalledOnce();
    unmount();
  });

  it("fires onTransfer when F6 is pressed and transfer is enabled", () => {
    const onTransfer = vi.fn();
    const { unmount } = mountHook({ onTransfer });
    fireKey("F6");
    expect(onTransfer).toHaveBeenCalledOnce();
    unmount();
  });

  it("fires onToggleHelp when F12 is pressed", () => {
    const onToggleHelp = vi.fn();
    const { unmount } = mountHook({ onToggleHelp });
    fireKey("F12");
    expect(onToggleHelp).toHaveBeenCalledOnce();
    unmount();
  });

  /* ---- Disabled keys ---------------------------------------------------- */

  it("does not fire onCallNext when callNext is disabled", () => {
    const onCallNext = vi.fn();
    const { unmount } = mountHook(
      { onCallNext },
      { ...ALL_ENABLED, callNext: false },
    );
    fireKey("F1");
    expect(onCallNext).not.toHaveBeenCalled();
    unmount();
  });

  it("does not fire any action handlers when all keys are disabled", () => {
    const handlers = {
      onCallNext: vi.fn(),
      onStartServing: vi.fn(),
      onRecall: vi.fn(),
      onSkipNoShow: vi.fn(),
      onComplete: vi.fn(),
      onTransfer: vi.fn(),
    };
    const { unmount } = mountHook(handlers, ALL_DISABLED);
    ["F1", "F2", "F3", "F4", "F5", "F6"].forEach(fireKey);
    Object.values(handlers).forEach((h) => expect(h).not.toHaveBeenCalled());
    unmount();
  });

  /* ---- Per-key debounce ------------------------------------------------- */

  it("debounces a second F1 press within 300 ms", () => {
    const onCallNext = vi.fn();
    const { unmount } = mountHook({ onCallNext });

    fireKey("F1"); // fires at t=1000
    fireKey("F1"); // immediately — within debounce window
    expect(onCallNext).toHaveBeenCalledOnce();

    unmount();
  });

  it("allows a second F1 press after 301 ms", () => {
    const onCallNext = vi.fn();
    const { unmount } = mountHook({ onCallNext });

    fireKey("F1"); // fires at t=1000, stamps lastFired=1000
    vi.advanceTimersByTime(301); // t=1301, 301ms since last fire
    fireKey("F1"); // 1301 - 1000 = 301 >= 300 → not debounced
    expect(onCallNext).toHaveBeenCalledTimes(2);

    unmount();
  });

  it("debounces each key independently (F1 debounce does not block F2)", () => {
    const onCallNext = vi.fn();
    const onStartServing = vi.fn();
    const { unmount } = mountHook({ onCallNext, onStartServing });

    fireKey("F1");
    fireKey("F1"); // debounced
    fireKey("F2"); // different key — not debounced
    expect(onCallNext).toHaveBeenCalledOnce();
    expect(onStartServing).toHaveBeenCalledOnce();

    unmount();
  });

  /* ---- Modal open ------------------------------------------------------- */

  it("blocks all action F-keys (F1–F6) when modal is open", () => {
    const handlers = {
      onCallNext: vi.fn(),
      onStartServing: vi.fn(),
      onRecall: vi.fn(),
      onSkipNoShow: vi.fn(),
      onComplete: vi.fn(),
      onTransfer: vi.fn(),
    };
    const { unmount } = mountHook(handlers, ALL_ENABLED, true);
    ["F1", "F2", "F3", "F4", "F5", "F6"].forEach(fireKey);
    Object.values(handlers).forEach((h) => expect(h).not.toHaveBeenCalled());
    unmount();
  });

  it("fires onToggleHelp (F12) even when modal is open", () => {
    const onToggleHelp = vi.fn();
    const { unmount } = mountHook({ onToggleHelp }, ALL_ENABLED, true);
    fireKey("F12");
    expect(onToggleHelp).toHaveBeenCalledOnce();
    unmount();
  });

  /* ---- Escape ----------------------------------------------------------- */

  it("fires onEscape when Escape is pressed and no modal is open", () => {
    const onEscape = vi.fn();
    const { unmount } = mountHook({ onEscape }, ALL_ENABLED, false);
    fireKey("Escape");
    expect(onEscape).toHaveBeenCalledOnce();
    unmount();
  });

  it("does NOT fire onEscape when a modal is open (modal handles Escape itself)", () => {
    const onEscape = vi.fn();
    const { unmount } = mountHook({ onEscape }, ALL_ENABLED, true);
    fireKey("Escape");
    expect(onEscape).not.toHaveBeenCalled();
    unmount();
  });

  /* ---- Input focus suppression ----------------------------------------- */

  it("suppresses all shortcuts when an <input> element is focused", () => {
    const onCallNext = vi.fn();
    const { unmount } = mountHook({ onCallNext });

    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    fireKey("F1");
    expect(onCallNext).not.toHaveBeenCalled();

    input.blur();
    document.body.removeChild(input);
    unmount();
  });

  it("suppresses all shortcuts when a <textarea> element is focused", () => {
    const onCallNext = vi.fn();
    const { unmount } = mountHook({ onCallNext });

    const textarea = document.createElement("textarea");
    document.body.appendChild(textarea);
    textarea.focus();

    fireKey("F1");
    expect(onCallNext).not.toHaveBeenCalled();

    textarea.blur();
    document.body.removeChild(textarea);
    unmount();
  });

  it("fires shortcuts normally after input blur", () => {
    const onCallNext = vi.fn();
    const { unmount } = mountHook({ onCallNext });

    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    fireKey("F1");
    expect(onCallNext).not.toHaveBeenCalled();

    input.blur();
    vi.advanceTimersByTime(400); // past debounce
    fireKey("F1");
    expect(onCallNext).toHaveBeenCalledOnce();

    document.body.removeChild(input);
    unmount();
  });

  /* ---- Cleanup ---------------------------------------------------------- */

  it("removes the keydown listener on unmount", () => {
    const onCallNext = vi.fn();
    const { unmount } = mountHook({ onCallNext });

    unmount();
    fireKey("F1");
    expect(onCallNext).not.toHaveBeenCalled();
  });
});
