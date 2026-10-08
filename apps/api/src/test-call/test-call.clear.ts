import { eq } from "drizzle-orm";
import type { Tx } from "../core/db.ts";
import { testCall } from "./test-call.schema.ts";

// A session's start or end closes the open call (rules-flow.md §11.143). A leaf module, like spend.clear, so the
// campaign handlers that call it don't import test-call.actions.
export async function clearTestCall(tx: Tx, campaignId: string) {
  await tx.delete(testCall).where(eq(testCall.campaignId, campaignId));
}
