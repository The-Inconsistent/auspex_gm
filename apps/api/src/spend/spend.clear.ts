import { and, eq, inArray, isNotNull, notInArray } from "drizzle-orm";
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

// AWARE asks whose Agent is no longer ambushed in this fight (the GM cleared it on the tablet, or took them out of it):
// nothing is left to ask for (p.177, §11.177).
export async function clearMootAware(tx: Tx, { campaignId, encounterId }: { campaignId: string; encounterId: string }) {
  const ambushed = tx
    .select({ id: combatant.characterId })
    .from(combatant)
    .where(and(eq(combatant.encounterId, encounterId), eq(combatant.ambushed, true), isNotNull(combatant.characterId)));
  await tx
    .delete(spendRequest)
    .where(
      and(
        eq(spendRequest.campaignId, campaignId),
        eq(spendRequest.kind, "aware"),
        notInArray(spendRequest.characterId, ambushed),
      ),
    );
}
