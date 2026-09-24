import type { ActionInput, ActionResult } from "@wg/shared";

// Sends an action and, on success, writes `text` to the vox log with an undo where one exists.
export type Run = (a: ActionInput, text: string) => Promise<ActionResult>;

export type LogEntry = { id: number; text: string; undo?: ActionInput; warn?: boolean };
