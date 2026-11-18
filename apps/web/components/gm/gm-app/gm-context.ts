"use client";
import { createContext, useContext } from "react";

import type {
  Codex,
  FactionPresets,
  FlavourTable,
  FrameworkCatalogue,
  JournalItem,
  LiveState,
  NpcPreset,
  PlaceSummary,
  RuleEntry,
  ScenePresets,
  Threat,
  Wargear,
} from "@wg/shared";

import type { useBookServer } from "@/hooks/use-book-server/use-book-server";
import type { Send } from "@/hooks/use-table/use-table";
import type { Begun } from "@/lib/scene-reveal/scene-reveal";

// What every GM route reads from the shell: the live snapshots (synced, never null here), the socket's send, the
// GM-only catalogues the layout loaded once, and the state that outlives a route (the last scene begin and its UNDO).
export type Gm = {
  campaignId: string;
  state: LiveState;
  codex: Codex;
  journal: JournalItem[]; // HISTORY's entries, pushed by the api (the `journal` socket event)
  send: Send;
  bestiary: Threat[]; // the books' stat blocks plus the campaign's customs (issue #43)
  wargear: Wargear[];
  rules: RuleEntry[];
  presets: ScenePresets;
  frameworks: FrameworkCatalogue;
  factionPresets: FactionPresets;
  npcPresets: NpcPreset[];
  flavour: FlavourTable[];
  places: PlaceSummary[];
  bookServer: ReturnType<typeof useBookServer>;
  begun: Begun | null;
  setBegun: (b: Begun | null) => void;
  onDeleted: () => void; // DELETE GAME went through: leave for the lobby
};

export const GmContext = createContext<Gm | null>(null);

export function useGm(): Gm {
  const gm = useContext(GmContext);
  if (!gm) throw new Error("useGm outside the GM shell");
  return gm;
}
