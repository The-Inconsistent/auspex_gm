"use client";
import { createContext, useContext } from "react";

import type { BuildCatalogue, BuildChoice, CharacterBuildInput, Creation, ResolvedBuild, Role } from "@wg/shared";

import type { BuilderStep } from "./constants";

// A build still being made: no archetype yet is allowed, and the name travels with it until it's saved.
export type Draft = Omit<CharacterBuildInput, "archetypeId"> & { archetypeId?: string; name: string };

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
  tier: number;
  role: Role;
  go: (step: BuilderStep) => void;
};

export const BuilderContext = createContext<BuilderValue | null>(null);

export function useBuilder() {
  const v = useContext(BuilderContext);
  if (!v) throw new Error("useBuilder outside <Builder>");
  return v;
}
