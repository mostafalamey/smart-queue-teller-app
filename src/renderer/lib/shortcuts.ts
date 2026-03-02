/**
 * Keyboard shortcut definitions for the Teller App (Phase 6.6).
 *
 * All primary teller actions are mapped to F-keys so USB HID keypads
 * (configured to emit F-key strokes) work without any special driver.
 *
 * F-keys are prevented from triggering default browser/Electron behaviour
 * (e.g. F5 refresh) in the Electron main process `before-input-event` handler.
 */

export interface ShortcutDef {
  /** The `KeyboardEvent.key` value to match. */
  key: string;
  /** Human-readable label shown in buttons and the reference panel. */
  label: string;
  /** Short description of the action shown in the reference panel. */
  description: string;
}

export const SHORTCUTS = {
  CALL_NEXT: {
    key: "F1",
    label: "F1",
    description: "Call Next",
  },
  START_SERVING: {
    key: "F2",
    label: "F2",
    description: "Start Serving",
  },
  RECALL: {
    key: "F3",
    label: "F3",
    description: "Recall Patient",
  },
  SKIP_NO_SHOW: {
    key: "F4",
    label: "F4",
    description: "Skip / No-Show",
  },
  COMPLETE: {
    key: "F5",
    label: "F5",
    description: "Complete Service",
  },
  TRANSFER: {
    key: "F6",
    label: "F6",
    description: "Transfer Patient",
  },
  SHORTCUT_HELP: {
    key: "F12",
    label: "F12",
    description: "Show Shortcut Reference",
  },
  ESCAPE: {
    key: "Escape",
    label: "Esc",
    description: "Close Dialog / Cancel",
  },
} as const satisfies Record<string, ShortcutDef>;

export type ShortcutName = keyof typeof SHORTCUTS;
