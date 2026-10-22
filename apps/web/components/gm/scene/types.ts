import type { ActionResult, Codex } from "@wg/shared";

export type Adventure = Codex["adventures"][number];
export type SceneBeat = Adventure["beats"][number];

// How a child reports a send: the Scene's message line shows `ok` or the refusal.
export type Report = (r: ActionResult, ok: string) => void;
