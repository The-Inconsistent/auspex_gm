import type { Codex } from "@wg/shared";
import type { BeatSection } from "@/components/gm/prep/components/beat-editor/constants";

export type Adventure = Codex["adventures"][number];

// What replaces the spread: the new-scene editor, the book-table picker, or the open scene's editor (one section, or all).
export type Editing = { mode: "new" } | { mode: "table" } | { mode: "scene"; section?: BeatSection };
