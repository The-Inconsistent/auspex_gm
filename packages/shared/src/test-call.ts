import { BLIGHTED_SOUL, corruptionTestDn, hasMutation } from "./corruption.ts";
import { DN_TABLE } from "./dn.ts";
import {
  ATTRIBUTE_NAMES,
  SKILLS,
  attributeTotals,
  deriveStats,
  skillTotal,
  type CalledTest,
  type Character,
  type TestReport,
} from "./state.ts";

// A called Test (issue #191) as the phones and the tally read it. The app never rolls: it says how many dice and
// against what, and the players report back (rules-flow.md §7).

// A Test kind as the GM's menus print it.
export const TEST_KIND_LABELS: Record<CalledTest["kind"], string> = {
  skill: "SKILL",
  attribute: "ATTRIBUTE",
  opposed: "OPPOSED",
  influence: "INFLUENCE",
  resolve: "RESOLVE (FEAR, TERROR)",
  corruption: "CORRUPTION",
};

// What a Test rolls: "AWARENESS (Int)", "OPPOSED · STRENGTH (S)", or the trait kind ("RESOLVE").
export const testTitle = (t: Pick<CalledTest, "kind" | "skill" | "attribute">) => {
  const pool = t.skill
    ? `${t.skill.toUpperCase()} (${SKILLS[t.skill]})`
    : t.attribute
      ? `${ATTRIBUTE_NAMES[t.attribute].toUpperCase()} (${t.attribute})`
      : null;
  return t.kind === "opposed" ? `OPPOSED · ${pool}` : (pool ?? t.kind.toUpperCase());
};

// "DN 5 · CHALLENGING" for a DN the table prints (Core p.161), "DN 4" between them, "NO DN" for an Opposed Test,
// "DN · GM SETS" for one the GM sets at the table (§11.75).
export const dnLabel = ({ kind, dn }: Pick<CalledTest, "kind" | "dn">) => {
  if (dn === null) return kind === "opposed" ? "NO DN" : "DN · GM SETS";
  const row = DN_TABLE.find((r) => r.dn === dn);
  return row ? `DN ${dn} · ${row.name.toUpperCase()}` : `DN ${dn}`;
};

// The dice an Agent rolls: Skill + its Attribute (Core p.158), an Attribute alone (p.170), or a trait: Influence
// (p.169), Resolve (p.170) or Conviction for Corruption (p.285). One of them is the Wrath Die (p.159).
export function testPool({ character: c, test: t, tier }: { character: Character; test: CalledTest; tier: number }) {
  if (t.skill) return skillTotal(c.stats, t.skill);
  if (t.attribute) return attributeTotals(c.stats)[t.attribute]; // Powered counts in a Strength Test (§11.160)
  const d = deriveStats({ stats: c.stats, overrides: c.overrides, tier });
  return t.kind === "influence" ? d.influence : t.kind === "resolve" ? d.resolve : d.conviction;
}

// The DN this Agent rolls against: a Corruption Test adds their Corruption Level's modifier (p.286), and 1 more for
// Blighted Soul (p.289, §11.184).
export const callDn = (t: CalledTest, c: Character) =>
  t.kind === "corruption" && t.dn !== null
    ? corruptionTestDn({ source: t.dn, points: c.stats.corruption, blighted: hasMutation(c.stats, BLIGHTED_SOUL) })
    : t.dn;

// What's wrong with a report for this Test: the roll comes only with a failed Corruption Test (p.286).
export function reportProblem(t: CalledTest, r: TestReport): string | null {
  const roll = r.icons !== undefined || r.complication || r.wrathCritical || r.spentWrath;
  if (roll && (r.passed || t.kind !== "corruption")) return "Only a failed Corruption Test reports its roll";
  return null;
}
