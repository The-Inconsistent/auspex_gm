import { and, count, eq, inArray } from "drizzle-orm";
import type { Action, ActionResult } from "@wg/shared";
import type { Ctx } from "../auth/auth.service.ts";
import { character } from "../character/character.schema.ts";
import type { Tx } from "../core/db.ts";
import { fail } from "../core/errors.ts";
import { whisper } from "./whisper.schema.ts";

export type WhisperAction = Extract<Action, { type: `whisper.${string}` }>;

// shortcut: a flat cap per session, since every whisper rides each state broadcast; page them if a table ever needs more.
const MAX_WHISPERS = 100;

// The GM's private lines to Agents, and their replies (rules-flow.md §11.164).
export async function applyWhisperAction(
  tx: Tx,
  { ctx, action: a }: { ctx: Ctx; action: WhisperAction },
): Promise<ActionResult> {
  const cid = ctx.campaignId;
  switch (a.type) {
    // GM only.
    case "whisper.send": {
      const to = [...new Set(a.to)];
      const ours = await tx
        .select({ id: character.id })
        .from(character)
        .where(and(eq(character.campaignId, cid), inArray(character.id, to)));
      if (ours.length !== to.length) fail("Whisper only to this game's Agents");
      const [sent] = await tx.select({ n: count() }).from(whisper).where(eq(whisper.campaignId, cid));
      if (sent!.n >= MAX_WHISPERS) fail(`${MAX_WHISPERS} whispers this session already; delete some first`);
      const [row] = await tx
        .insert(whisper)
        .values({ campaignId: cid, to, text: a.text })
        .returning({ id: whisper.id });
      return { ok: true, id: row!.id }; // the row was just inserted
    }

    // An addressed Agent's own reply; a second overwrites the first.
    case "whisper.reply": {
      const [w] = await tx
        .select()
        .from(whisper)
        .where(and(eq(whisper.campaignId, cid), eq(whisper.id, a.whisperId)));
      if (!w) fail("That whisper is gone");
      // authorize() only knows the action, so the Agent's place among the recipients is checked here against the row.
      if (!w.to.includes(a.characterId)) fail("That whisper isn't to this Agent");
      await tx
        .update(whisper)
        .set({ replies: { ...w.replies, [a.characterId]: { text: a.text, at: new Date().toISOString() } } })
        .where(eq(whisper.id, w.id));
      return { ok: true };
    }

    // GM only: taking one back.
    case "whisper.delete":
      await tx.delete(whisper).where(and(eq(whisper.campaignId, cid), eq(whisper.id, a.id)));
      return { ok: true };
  }
}
