import type { ActionInput, ActionResult } from "@wg/shared";

import type { KEY_PANELS, TURN_DOS } from "./constants";

// Sends an action and, on success, writes `text` to the chronicle with the journal entry it became, where it has one.
export type Run = (a: ActionInput, text: string) => Promise<ActionResult>;

// One chronicle line. `who`: the entry it joins, the Turn being played or the Round between Turns. `entry`: the journal
// entry the action became. `hit`: a Wounds or Shock tap, what UNDO HIT takes back (journal.undo of its entry).
export type LogEntry = { id: number; text: string; who: string; entry?: string; hit?: boolean; warn?: boolean };

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
