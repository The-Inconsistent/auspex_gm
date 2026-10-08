"use client";
import { createContext, useContext } from "react";

import type {
  BuildCatalogue,
  BuildChoice,
  CharacterBuildInput,
  CharacterDetail,
  Creation,
  Overrides,
  ResolvedBuild,
  Role,
} from "@wg/shared";

import type { BuilderStep } from "./constants";

// A build still being made: neither `archetypeId` nor `advanced` yet means nothing chosen (see `startedBuild`), and the
// name and detail travel with it until it's saved. `savedAt` (ms) picks the newer of this device's draft and the one
// sent to the table.
export type Draft = CharacterBuildInput & {
  name: string;
  detail?: Partial<CharacterDetail>;
  savedAt?: number;
  builtAt?: number; // a table's: the character's `builtAt` when this draft was opened (0: no build yet), see pickDraft
};

// Catalogue lookups by id, built once per payload.
export type Lookups = {
  [K in keyof Creation]: ReadonlyMap<string, Creation[K][number]>;
};

export type BuilderValue = {
  draft: Draft;
  update: (fn: (d: Draft) => Draft) => void;
  setChoice: (path: string, answer: BuildChoice) => void;
  resolved: ResolvedBuild | null;
  catalogue: BuildCatalogue;
  lookups: Lookups;
  tier: number; // the Tier the character is made at
  tierEditable: boolean; // the library's owner picks it; a campaign's Tier is the GM's (issue #14)
  setTier: (tier: number) => void;
  homebrew: boolean; // whether the catalogue includes the homebrew books
  // Changes that: the GM at a table, the owner in their library. null when it isn't this caller's to change.
  setHomebrew: ((next: boolean) => Promise<string | null>) | null;
  // A character in play: the group's Tier now, the XP earned, the XP it stood at when the group last Ascended, and
  // whether the GM waived this Ascension's package (Core p.148 step 2). `resolveBuild` reads the same shape.
  play: { tier: number; xpEarned: number; xpAtAscension?: number; packageWaived?: boolean } | null;
  // The group has Ascended since this character was made, so one Ascension is owed: one package, or Archetype
  // Ascension (Core p.148, p.155; rules-flow.md §11.55). Derived once here so every screen agrees.
  ascending: boolean;
  made: boolean; // saved from the builder before: creation is done, ADVANCE spends the XP earned
  importable: boolean; // a campaign's builder can take a copy of a character from the caller's library (issue #14)
  role: Role;
  go: (step: BuilderStep) => void;
  // SEND TO GM: puts the draft on the table for the GM (null for a character not made yet).
  sendDraft: (() => Promise<string | null>) | null;
  sentDraft: boolean; // a draft is waiting on the table
  gmLater: boolean; // the library: SAVE may leave what only a GM judges for the campaign's GM
  // The GM's overrides on this character (null in the library). They stay on the character, not the build, and are
  // never part of the draft, so a stale draft can't bring old ones back (issue #18).
  overrides: Overrides | null;
  setOverrides: (next: Overrides) => void;
};

export const BuilderContext = createContext<BuilderValue | null>(null);

export function useBuilder() {
  const v = useContext(BuilderContext);
  if (!v) throw new Error("useBuilder outside <Builder>");
  return v;
}
