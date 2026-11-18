import { z } from "zod";
import { Pool, Side } from "@wg/shared";

// One TURN BACK step (rules-flow §11.170): the fight's turn state, the damage on everyone in it and what a Seize or AWARE
// cost, as they stood before a turn-flow action. Only this api writes it; takeBack still parses it before writing it back.
export const TurnStep = z.object({
  label: z.string(),
  round: z.number().int(),
  currentId: z.string().nullable(),
  lastSide: Side.nullable(),
  seizedSide: Side.nullable(),
  refund: z.object({ pool: Pool, n: z.number().int() }).nullable(),
  combatants: z.array(
    z.object({
      id: z.string(),
      acted: z.boolean(),
      ambushed: z.boolean(),
      held: z.boolean(),
      manifested: z.boolean().optional(), // absent from a step kept before the column: left as it is
      expiring: z.array(z.string()),
      wounds: z.number().int(),
      shock: z.number().int(),
      mobCount: z.number().int().nullable(),
      conditions: z.array(z.string()),
    }),
  ),
  characters: z.array(
    z.object({
      id: z.string(),
      wounds: z.number().int(),
      shock: z.number().int(),
      conditions: z.array(z.string()),
      traumatic: z.number().int(),
      annihilated: z.boolean(),
    }),
  ),
});
export type TurnStep = z.infer<typeof TurnStep>;
