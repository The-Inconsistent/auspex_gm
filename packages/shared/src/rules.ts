import { z } from "zod";
import { WargearSource } from "./wargear.ts";

// The rules reference: Conditions (Core pp.197–200), weapon traits (pp.208–210), armour traits (p.232) and combat
// actions (pp.177–190), transcribed from the books. It holds book text, so it is served to seats only (GM or player),
// never bundled into the client.

export const RuleKind = z.enum(["condition", "weapon-trait", "armour-trait", "action"]);
export type RuleKind = z.infer<typeof RuleKind>;

export const RuleEntry = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/), // unique across rules/*.json
  kind: RuleKind,
  name: z.string().min(1), // as printed, with its rating: "Blast (X)"
  type: z.string().optional(), // actions only: "Combat Action", "Full-Round Action", "Reflexive Action"…
  source: WargearSource,
  page: z.number().int().positive(), // printed page
  text: z.string().min(1), // paragraphs separated by a blank line
});
export type RuleEntry = z.infer<typeof RuleEntry>;
