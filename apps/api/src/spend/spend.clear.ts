import { and, eq, inArray } from "drizzle-orm";
import type { SpendKind } from "@wg/shared";
import type { Tx } from "../core/db.ts";
import { spendRequest } from "./spend.schema.ts";

// Clearing: session.start and session.end reset the pools the requests were about (p.162, p.164), and a fight's end or
// replacement ends its Seize and Determination requests. A leaf module, so the campaign and encounter handlers that call
// it don't import spend.actions, which imports them. Deletes only; callers pass the campaign they already scoped to.
export async function clearSpendRequests(tx: Tx, { campaignId, kinds }: { campaignId: string; kinds?: SpendKind[] }) {
  await tx
    .delete(spendRequest)
    .where(and(eq(spendRequest.campaignId, campaignId), kinds ? inArray(spendRequest.kind, kinds) : undefined));
}
