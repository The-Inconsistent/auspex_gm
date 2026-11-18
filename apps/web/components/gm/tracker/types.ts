import type { ActionInput, ActionResult } from "@wg/shared";

import type { KEY_PANELS, TURN_DOS } from "./constants";

// Sends an action and, on success, writes `text` to the vox log with its journal entry (the UNDO) where it has one.
export type Run = (a: ActionInput, text: string) => Promise<ActionResult>;

// `entry`: the journal entry the action became; UNDO sends journal.undo for it. `undone`: the row now shows an undo,
// whose own entry REDO reverts.
export type LogEntry = { id: number; text: string; entry?: string; undone?: boolean; warn?: boolean };

// One row's harm numbers, from the character (Agents) or the combatant (threats). `max` null = no Shock track ("–").
export type Vitals = {
  wounds: number;
  maxWounds: number;
  shock: number;
  maxShock: number | null;
  defence: number | undefined;
  resilience: number | undefined;
};

// A button on the key bar.
export type KeyAction = { label: string; onClick: () => void };
export type KeyPanel = (typeof KEY_PANELS)[number];

// What a turn dialog can ask for; the tracker maps each to its action.
export type TurnDo = (typeof TURN_DOS)[number];
