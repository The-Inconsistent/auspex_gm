import { sourceCite, type Wargear } from "@wg/shared";

// A catalogue search for a native <datalist>: a name printed in more than one book is listed with its cite ("Bolt
// Rifle (VoA p.67)"), and `find` reads a typed or picked label back to its entry. Shared by the requisition form and
// an item's NAME (issue #51).
export function wargearLabels(catalogue: readonly Wargear[]) {
  const seen = new Map<string, number>();
  for (const w of catalogue) seen.set(w.name.toLowerCase(), (seen.get(w.name.toLowerCase()) ?? 0) + 1);
  const labelOf = (w: Wargear) => ((seen.get(w.name.toLowerCase()) ?? 0) > 1 ? `${w.name} (${sourceCite(w)})` : w.name);
  const find = (v: string) => catalogue.find((w) => labelOf(w).toLowerCase() === v.trim().toLowerCase());
  return { labelOf, find };
}
