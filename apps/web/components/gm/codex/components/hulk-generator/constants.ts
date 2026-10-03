// What the generator writes: a new hulk with its rooms, or only rooms inside a place already in the codex (§11.102).
export const HULK_MODES = { hulk: "NEW HULK", rooms: "ROOMS FOR A PLACE" } as const;
export type HulkMode = keyof typeof HULK_MODES;
