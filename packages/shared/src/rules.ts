import { z } from "zod";
import { Source } from "./source.ts";

// The rules reference: Conditions (Core pp.197–200), weapon traits (pp.208–210), armour traits (p.232), combat
// actions (pp.177–190) and the stat block terms (Bestiary Format, p.323), transcribed from the books. It holds book
// text, so it is served to seats only (GM or player), never bundled into the client.

export const RuleKind = z.enum(["condition", "weapon-trait", "armour-trait", "action", "stat"]);
export type RuleKind = z.infer<typeof RuleKind>;

export const RuleEntry = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/), // unique across rules/*.json
  kind: RuleKind,
  name: z.string().min(1), // as printed, with its rating: "Blast (X)"
  abbr: z.string().optional(), // stats only: the label the stat block prints ("DEF", "SHK")
  type: z.string().optional(), // actions only: "Combat Action", "Full-Round Action", "Reflexive Action"…
  source: Source,
  page: z.number().int().positive(), // printed page
  gist: z.string().min(1).max(120), // one terse line, paraphrased from `text`, for the collapsed row
  text: z.string().min(1), // paragraphs separated by a blank line
});
export type RuleEntry = z.infer<typeof RuleEntry>;

// The kinds a trait or Condition name in the data can link to. Action names and stat block terms ("Defence",
// "Wounds") aren't traits, so a lookup leaves them out.
export const LINKED_RULE_KINDS: readonly RuleKind[] = ["condition", "weapon-trait", "armour-trait"];

// Matching key for a trait or Condition as it appears in the data, against an entry's printed name. The rating or
// parameter goes (`Blast (6)`, `Blast 20`, `Inflict (Poison 7)` → `blast`, `inflict`), and so do case, curly quotes
// and hyphens. The aliases are spellings found in threats/ and wargear/.
const RULE_ALIASES: Record<string, string> = {
  inflicts: "inflict",
  agonizing: "agonising", // Apocrypha melee wargear
  "warp weapon": "warp weapons",
  asault: "assault", // Meltagun, printed so
  bulky: "bulk", // Vow of Absolution
};

export function ruleKey(name: string): string {
  const k = name
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/\s*(\(.*\)|\d+)$/, "")
    .replace(/!$/, "") // armour.json prints "’Ere We Go" without it
    .replace(/-/g, " ")
    .trim();
  return RULE_ALIASES[k] ?? k;
}
