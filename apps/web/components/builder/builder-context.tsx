"use client";
import { createContext, useContext } from "react";

import type { BuildCatalogue, BuildChoice, CharacterBuildInput, Creation, ResolvedBuild, Role } from "@wg/shared";

import type { BuilderStep } from "./constants";

// A build still being made: no archetype yet is allowed, and the name travels with it until it's saved. `savedAt`
// (ms) picks the newer of this device's draft and the one sent to the table.
export type Draft = Omit<CharacterBuildInput, "archetypeId"> & { archetypeId?: string; name: string; savedAt?: number };

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
  play: { tier: number; xpEarned: number } | null; // a character in play: the group's Tier now and the XP earned
  made: boolean; // saved from the builder before: creation is done, ADVANCE spends the XP earned
  role: Role;
  go: (step: BuilderStep) => void;
  // SEND TO GM: puts the draft on the table for the GM (null for a character not made yet).
  sendDraft: (() => Promise<string | null>) | null;
  sentDraft: boolean; // a draft is waiting on the table
};

export const BuilderContext = createContext<BuilderValue | null>(null);

export function useBuilder() {
  const v = useContext(BuilderContext);
  if (!v) throw new Error("useBuilder outside <Builder>");
  return v;
}
