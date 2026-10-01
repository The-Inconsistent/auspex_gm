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

// A build still being made: no archetype yet is allowed, and the name and detail travel with it until it's saved.
// `savedAt` (ms) picks the newer of this device's draft and the one sent to the table.
export type Draft = Omit<CharacterBuildInput, "archetypeId"> & {
  archetypeId?: string;
  name: string;
  detail?: Partial<CharacterDetail>;
  savedAt?: number;
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
  play: { tier: number; xpEarned: number } | null; // a character in play: the group's Tier now and the XP earned
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
