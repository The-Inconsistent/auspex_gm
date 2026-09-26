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
