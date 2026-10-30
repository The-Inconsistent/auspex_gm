import { eq } from "drizzle-orm";
import type { Tx } from "../core/db.ts";
import { whisper } from "./whisper.schema.ts";

// Whispers last one session (rules-flow.md §11.164). A leaf module, like test-call.clear, so the campaign handlers that
// call it don't import whisper.actions.
export async function clearWhispers(tx: Tx, campaignId: string) {
  await tx.delete(whisper).where(eq(whisper.campaignId, campaignId));
}
