import { ATTRIBUTE_NAMES, DN_TABLE, SKILLS, type BeatTest } from "@wg/shared";

import type { Beat, PoolDrafts } from "./types";

// A beat's editable fields: what `codex.save` takes as `data` (id and order are server-owned).
export const stripBeat = ({ id, order, ...rest }: Beat) => rest;

// A scene's number on screen: its place in the adventure, as two digits.
export const sceneNumber = (index: number) => String(index + 1).padStart(2, "0");

// What a scene Test rolls: "AWARENESS (Int)", "OPPOSED · STRENGTH (S)", or the trait kind ("RESOLVE").
export const testTitle = (t: BeatTest) => {
  const pool = t.skill
    ? `${t.skill.toUpperCase()} (${SKILLS[t.skill]})`
    : t.attribute
      ? `${ATTRIBUTE_NAMES[t.attribute].toUpperCase()} (${t.attribute})`
      : null;
  return t.kind === "opposed" ? `OPPOSED · ${pool}` : (pool ?? t.kind.toUpperCase());
};

// "DN 5 · CHALLENGING" for a DN the table prints (Core p.161), "DN 4" between them, "NO DN" for an Opposed Test,
// "DN · GM SETS" for one the GM sets at the table (§11.75).
export const dnLabel = ({ kind, dn }: Pick<BeatTest, "kind" | "dn">) => {
  if (dn === null) return kind === "opposed" ? "NO DN" : "DN · GM SETS";
  const row = DN_TABLE.find((r) => r.dn === dn);
  return row ? `DN ${dn} · ${row.name.toUpperCase()}` : `DN ${dn}`;
};

// What a failed Test gives the GM, where the book says so: a failed Fear or Corruption Test is +1 Ruin (Core p.320;
// Corruption p.286). A Resolve Test can be Terror too, which p.320 doesn't list, so the reminder names Fear.
export const ruinOnFailure = (t: BeatTest) =>
  t.kind === "corruption"
    ? "FAILED: GM GAINS 1 RUIN · pp.286, 320"
    : t.kind === "resolve"
      ? "FAILED FEAR: GM GAINS 1 RUIN · p.320"
      : null;

// What SAVE SCENE sends of a scene's Ruin and Glory lines: blank ones go. Null while a line that stays has no amount or
// cost, since the app never invents one (issue #40).
export function savedPools({ ruin, glory, spends }: PoolDrafts): Pick<Beat, "ruin" | "glory" | "spends"> | null {
  const written = (lines: PoolDrafts["ruin"]) => lines.filter((l) => l.text.trim());
  const kept = { ruin: written(ruin), glory: written(glory), spends: spends.filter((s) => s.name.trim()) };
  const unset =
    [...kept.ruin, ...kept.glory].some((l) => l.amount === null) || kept.spends.some((s) => s.cost === null);
  return unset ? null : (kept as Pick<Beat, "ruin" | "glory" | "spends">); // every amount and cost checked just above
}
