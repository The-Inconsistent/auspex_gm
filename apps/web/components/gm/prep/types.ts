import type { Codex } from "@wg/shared";

export type Beat = Codex["adventures"][number]["beats"][number];
export type EncounterEntry = Beat["encounter"][number];
