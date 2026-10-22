import type { ActionResult, Codex } from "@wg/shared";

export type Adventure = Codex["adventures"][number];
export type SceneBeat = Adventure["beats"][number];

// What the one-line SCENE BEGUN notice needs to take a begin back (lib/scene-reveal `undoBegin`).
export type Begun = { begun: string; before: string | null; status: SceneBeat["status"]; revealed: string[] };

// How a child reports a send: the Scene's message line shows `ok` or the refusal.
export type Report = (r: ActionResult, ok: string) => void;
