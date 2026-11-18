import { and, eq, sql } from "drizzle-orm";
import type { Action, ActionResult } from "@wg/shared";
import type { Ctx } from "../auth/auth.service.ts";
import type { Tx } from "../core/db.ts";
import { fail } from "../core/errors.ts";
import { journalEntry, type JournalEntry } from "./journal.schema.ts";
import { blockingLabel, currentEntry } from "./journal.service.ts";

export type JournalAction = Extract<Action, { type: "journal.undo" }>;

// What an undo of this entry can't bring back. A character's guest tokens, invites and a member's seat live outside the
// journal (journal.service.ts) and hang off the character: deleting one already cascaded them away, and undoing a
// create would cascade away any issued since. Undo would report success with the player locked out, so it refuses.
async function blocker(tx: Tx, entry: JournalEntry): Promise<string | null> {
  // The GM's call (2026-10-06): a session end stands, XP award and all; a slip is fixed with a GM adjustment.
  if (entry.action.type === "session.end") return "A session end can't be undone";
  const res = await tx.execute<{ deleted: boolean; seated: boolean }>(sql`
    select
      bool_or(c.op = 'D') as deleted,
      bool_or(c.op = 'I' and (
        exists (select 1 from access_token t where t.character_id = c.row_id) or
        exists (select 1 from invite i where i.character_id = c.row_id) or
        exists (select 1 from membership m where m.character_id = c.row_id))) as seated
    from journal_change c where c.entry_id = ${entry.id} and c.tbl = 'character'`);
  const r = res.rows[0];
  // An undo's own delete of a character is safe to revert: that undo was refused if anything hung off the character.
  if (r?.deleted && !entry.undoes) return "A deleted Agent can't be undone: their seat and guest QR are gone";
  if (r?.seated) return "That Agent has a player seat or guest QR now; undoing would lock the player out";
  return null;
}

// Undo reverts exactly what the entry changed, and refuses when a later change touched the same rows or columns
// (journal_undo, journal.sql), or when it would delete a row added since (a create with the Agent in a fight now). The
// refusal names the entry to undo first. So the latest action always undoes, and so does an older independent one. The undo is
// itself journaled (its restores are a new entry), so undoing an undo is a redo.
export async function applyJournalAction(
  tx: Tx,
  { ctx, action: a }: { ctx: Ctx; action: JournalAction },
): Promise<ActionResult> {
  const [entry] = await tx
    .select()
    .from(journalEntry)
    .where(and(eq(journalEntry.id, a.entryId), eq(journalEntry.campaignId, ctx.campaignId)));
  if (!entry) fail("Nothing to undo");
  if (entry.undoneBy) fail("Already undone");
  const blocked = await blocker(tx, entry);
  if (blocked) fail(blocked);
  // The gateway always runs actions through `journaled`; without an open entry the restores would go unrecorded.
  const now = await currentEntry(tx);
  if (!now) throw new Error("journal.undo outside journaled()");

  try {
    // In a savepoint: a conflict aborts the transaction, and the blocker is looked up after it.
    await tx.transaction((sp) => sp.execute(sql`select journal_undo(${entry.id})`));
  } catch (e) {
    // drizzle wraps the driver error; the message we raise is on the cause.
    const msg = `${(e as Error).message} ${((e as Error).cause as Error | undefined)?.message ?? ""}`;
    const hit = /journal_conflict:(\w+):([0-9a-f-]{36})/.exec(msg);
    if (!hit) throw e;
    const [, tbl, rowId] = hit as unknown as [string, string, string];
    // The earliest standing entry after this one that changed the row (one that wrote the same column first) goes first.
    const label = await blockingLabel(tx, {
      campaignId: ctx.campaignId,
      targetId: entry.id,
      exceptId: now,
      tbl,
      rowId,
    });
    fail(
      label
        ? `Undo \u201c${label}\u201d first.`
        : `A later change touched that ${tbl.replace("_", " ")}. Undo that first.`,
    );
  }
  // The journal tables have no trigger, so these marks are not themselves journaled.
  await tx.update(journalEntry).set({ undoes: entry.id }).where(eq(journalEntry.id, now));
  await tx.update(journalEntry).set({ undoneBy: now }).where(eq(journalEntry.id, entry.id));
  // Undoing an undo brings its target back into effect. If that target was itself an undo (a redo being undone), the
  // entry it reverted is reverted again, so its mark goes back too: the marks always match the rows.
  if (entry.undoes) {
    const [back] = await tx
      .update(journalEntry)
      .set({ undoneBy: null })
      .where(eq(journalEntry.id, entry.undoes))
      .returning({ undoes: journalEntry.undoes });
    if (back?.undoes)
      await tx.update(journalEntry).set({ undoneBy: entry.undoes }).where(eq(journalEntry.id, back.undoes));
  }
  return { ok: true };
}
