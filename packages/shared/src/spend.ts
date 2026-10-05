import { z } from "zod";

// A spend a player asks the GM to make from their phone (rules-flow.md §11.120). The request is a convenience: the GM's
// ACCEPT runs the same pool, Wrath and Seize handlers the tablet already has, so the rules stay in one place.
export const SpendKind = z.enum(["reroll", "restoreShock", "gloryDice", "gloryDamage", "seize"]);
export type SpendKind = z.infer<typeof SpendKind>;
export const SPEND_KINDS = SpendKind.options;

// Glory buys any amount of dice or damage (p.165); a table of six Glory never needs more than this per request.
export const MAX_SPEND_AMOUNT = 10;
// Pending requests one Agent can have at once: enough for a Test's reroll, dice and damage, not a way to flood the GM.
export const MAX_PENDING_SPENDS = 3;

export const SpendRequest = z.object({
  id: z.string(),
  characterId: z.string(),
  kind: SpendKind,
  amount: z.number().int(),
  createdAt: z.string(), // ISO, oldest first on the wire
});
export type SpendRequest = z.infer<typeof SpendRequest>;

const AMOUNT_KINDS: ReadonlySet<SpendKind> = new Set(["gloryDice", "gloryDamage"]);
// Only Glory dice and damage take an amount; every other spend is one of its pool.
export const spendTakesAmount = (kind: SpendKind) => AMOUNT_KINDS.has(kind);

// What a spend costs: Wrath comes off the Agent, Glory off the party's pool.
export function spendCost(kind: SpendKind, amount = 1): { wrath: number; glory: number } {
  switch (kind) {
    case "reroll": // Wrath: Reroll Failures, 1 Wrath (p.164)
    case "restoreShock": // Wrath: Restore Shock, 1 Wrath (p.164, p.196)
      return { wrath: 1, glory: 0 };
    case "gloryDice": // Glory: +n dice (p.165)
    case "gloryDamage": // Glory: +n damage (p.165)
      return { wrath: 0, glory: amount };
    case "seize": // Seize the Initiative, 1 Glory (p.177)
      return { wrath: 0, glory: 1 };
  }
}

// Shock a Restore Shock recovers: Rank + Tier (p.164, p.196).
export const restoreShockAmount = ({ rank, tier }: { rank: number; tier: number }) => rank + tier;

const WORDS: Record<SpendKind, string> = {
  reroll: "REROLL FAILURES",
  restoreShock: "RESTORE SHOCK",
  gloryDice: "GLORY DICE",
  gloryDamage: "GLORY DAMAGE",
  seize: "SEIZE THE INITIATIVE",
};
export const spendWord = (kind: SpendKind) => WORDS[kind];

// "REROLL FAILURES · 1 WRATH", "GLORY DICE +3 · 3 GLORY".
export function spendLabel(kind: SpendKind, amount = 1): string {
  const { wrath, glory } = spendCost(kind, amount);
  const plus = spendTakesAmount(kind) ? ` +${amount}` : "";
  return `${WORDS[kind]}${plus} · ${wrath ? `${wrath} WRATH` : `${glory} GLORY`}`;
}
