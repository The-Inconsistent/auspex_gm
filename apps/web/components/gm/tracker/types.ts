import type { ActionInput, ActionResult } from "@wg/shared";

import type { KEY_PANELS } from "./constants";

// Sends an action and, on success, writes `text` to the vox log with an undo where one exists.
export type Run = (a: ActionInput, text: string) => Promise<ActionResult>;

export type LogEntry = { id: number; text: string; undo?: ActionInput; warn?: boolean };

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
