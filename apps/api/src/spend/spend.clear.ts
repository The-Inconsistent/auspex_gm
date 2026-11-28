import { and, eq, inArray, isNotNull, isNull, notInArray, or } from "drizzle-orm";
import type { SpendKind } from "@wg/shared";
import type { Tx } from "../core/db.ts";
import { combatant } from "../encounter/encounter.schema.ts";
import { spendRequest } from "./spend.schema.ts";

// Clearing: session.start and session.end reset the pools the requests were about (p.162, p.164), and a fight's end or
// replacement ends its Seize and Determination requests. A leaf module, so the campaign and encounter handlers that call
// it don't import spend.actions, which imports them. Deletes only; callers pass the campaign they already scoped to.
export async function clearSpendRequests(tx: Tx, { campaignId, kinds }: { campaignId: string; kinds?: SpendKind[] }) {
  await tx
    .delete(spendRequest)
    .where(and(eq(spendRequest.campaignId, campaignId), kinds ? inArray(spendRequest.kind, kinds) : undefined));
}

// Asks that name an ally's row (§11.208): all of them when `combatantIds` is left out (the fight is over, so no ally is
// left to ask for), or just those rows' when its runner changed or the NPC was taken back or made an Ally. Deleting the
// row cascades, but a fight that ends keeps its rows, so these are cleared by hand.
export async function clearAllySpends(
  tx: Tx,
  { campaignId, combatantIds }: { campaignId: string; combatantIds?: string[] },
) {
  if (combatantIds && !combatantIds.length) return;
  await tx
    .delete(spendRequest)
    .where(
      and(
        eq(spendRequest.campaignId, campaignId),
        combatantIds ? inArray(spendRequest.combatantId, combatantIds) : isNotNull(spendRequest.combatantId),
      ),
    );
}

// AWARE asks whose Agent (or ally, §11.208) is no longer ambushed in this fight (the GM cleared it on the tablet, or took
// them out of it): nothing is left to ask for (p.177, §11.177).
export async function clearMootAware(tx: Tx, { campaignId, encounterId }: { campaignId: string; encounterId: string }) {
  const ambushed = tx
    .select({ id: combatant.characterId })
    .from(combatant)
    .where(and(eq(combatant.encounterId, encounterId), eq(combatant.ambushed, true), isNotNull(combatant.characterId)));
  const ambushedAllies = tx
    .select({ id: combatant.id })
    .from(combatant)
    .where(and(eq(combatant.encounterId, encounterId), eq(combatant.ambushed, true), eq(combatant.ally, true)));
  await tx
    .delete(spendRequest)
    .where(
      and(
        eq(spendRequest.campaignId, campaignId),
        eq(spendRequest.kind, "aware"),
        or(
          and(isNull(spendRequest.combatantId), notInArray(spendRequest.characterId, ambushed)),
          and(isNotNull(spendRequest.combatantId), notInArray(spendRequest.combatantId, ambushedAllies)),
        ),
      ),
    );
}
