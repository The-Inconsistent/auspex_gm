import type { Codex, PoolEntry, PoolSpend } from "@wg/shared";

export type Beat = Codex["adventures"][number]["beats"][number];
export type EncounterEntry = Beat["encounter"][number];

// A scene's Ruin and Glory lines as the editor holds them: an amount or a cost stays empty until the GM sets one.
type Unset<T, K extends keyof T> = Omit<T, K> & { [P in K]: T[P] | null };
export type PoolDrafts = {
  ruin: Unset<PoolEntry, "amount">[];
  glory: Unset<PoolEntry, "amount">[];
  spends: Unset<PoolSpend, "cost">[];
};
