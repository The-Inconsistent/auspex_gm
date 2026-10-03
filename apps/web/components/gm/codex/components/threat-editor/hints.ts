import type { ThreatDraft } from "./constants";

// Hints, never blocks (rules-flow §11.109). The books tie none of this to a formula, so the app says what looks unusual
// and the GM decides; the server accepts whatever `Threat` accepts.
export function threatHints(d: ThreatDraft): string[] {
  const out: string[] = [];
  const everTroop = d.threat.includes("T");
  // "Troops usually have 1 Wound and 3 Shock. Deal with them in the simplest way possible" (Core p.326).
  if (everTroop && (d.wounds > 1 || (d.shock ?? 0) > 3))
    out.push("A Troop usually has 1 Wound and 3 Shock (Core p.326).");
  // A Mob is two or more Troops sharing a profile (Core p.324), so Mob content on a block that is never a Troop has
  // nothing to apply to.
  if (!everTroop && ((d.mobAbilities ?? []).length > 0 || (d.options ?? []).some((o) => o.kind === "mob")))
    out.push("Mobs are Troops only (Core p.324), and this is a Troop at no Tier.");
  // Personal Ruin belongs to a Champion, and a Champion is normally one per Scene (Core p.325).
  if (d.personalRuin !== undefined && everTroop && !d.threat.some((c) => c === "E" || c === "A" || c === "M"))
    out.push("Personal Ruin is a Champion's (Core p.325).");
  if (!d.keywords.length) out.push("A stat block prints at least one Keyword (Core p.323).");
  if (!d.name.trim()) out.push("It needs a name before it can be saved.");
  return out;
}
