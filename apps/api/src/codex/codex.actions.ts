import { and, eq, inArray, max, sql } from "drizzle-orm";
import { threats } from "@wg/data";
import type { z } from "zod";
import type { Action, ActionResult, CodexInput } from "@wg/shared";
import type { Ctx } from "../auth/auth.service.ts";
import { character } from "../character/character.schema.ts";
import type { Tx } from "../core/db.ts";
import { fail } from "../core/errors.ts";
import { adventure, beat, faction, handout, location, npc } from "./codex.schema.ts";

export type CodexAction = Extract<Action, { type: "codex.save" | "codex.delete" | "beat.reorder" }>;

const codexTable = { faction, adventure, beat, location, npc, handout } as const;
type RefTable = typeof faction | typeof adventure | typeof location | typeof npc | typeof handout | typeof character;

// Every id the client sends must name a row of this campaign; the FKs alone would accept another campaign's row.
async function checkRefs(
  tx: Tx,
  { campaignId, table, ids, what }: { campaignId: string; table: RefTable; ids: unknown[]; what: string },
) {
  const want = [...new Set(ids.filter((x): x is string => typeof x === "string"))];
  if (!want.length) return;
  const rows = await tx
    .select({ id: table.id })
    .from(table as typeof location)
    .where(and(inArray(table.id, want), eq(table.campaignId, campaignId)));
  if (rows.length !== want.length) fail(`${what} not found`);
}

// Prepared-encounter and bestiary-NPC threats must exist, or the beat can't start later.
export function checkThreats(threatIds: string[]) {
  const unknown = threatIds.find((t) => !threats.has(t));
  if (unknown) fail(`Unknown threat "${unknown}"`);
}

export async function applyCodexAction(
  tx: Tx,
  { ctx, action: a }: { ctx: Ctx; action: CodexAction },
): Promise<ActionResult> {
  const cid = ctx.campaignId;

  switch (a.type) {
    case "codex.save": {
      // The per-kind shape was validated by CodexInput[kind]; the union just doesn't narrow `data` by `kind`.
      const table = codexTable[a.kind];
      const data: Record<string, unknown> = { ...a.data };
      const refs = (table: RefTable, ids: unknown[], what: string) =>
        checkRefs(tx, { campaignId: cid, table, ids, what });
      if (a.kind === "beat") {
        const b = a.data as z.output<typeof CodexInput.beat>;
        await refs(adventure, [b.adventureId], "Adventure");
        await refs(location, [b.locationId], "Location");
        await refs(npc, b.npcIds, "NPC");
        await refs(handout, b.handoutIds, "Handout");
        checkThreats(b.encounter.map((e) => e.threatId));
      }
      if (a.kind === "npc") {
        const n = a.data as z.output<typeof CodexInput.npc>;
        await refs(faction, [n.factionId], "Faction");
        if (n.statSource.kind === "bestiary") checkThreats([n.statSource.threatId]);
      }
      if (a.kind === "location") {
        const parentId = (a.data as z.output<typeof CodexInput.location>).parentId;
        if (parentId && parentId === a.id) fail("A location can't be inside itself");
        await refs(location, [parentId], "Parent location");
      }
      if (a.kind === "handout")
        await refs(character, (a.data as z.output<typeof CodexInput.handout>).audience, "Audience character");
      // First reveal stamps the time; later saves keep it (only an UPDATE can read the old value).
      if (a.kind === "handout")
        data.revealedAt = !data.revealed ? null : a.id ? sql`coalesce(${handout.revealedAt}, now())` : new Date();
      if (a.id) {
        const r = await tx
          .update(table)
          .set(data as never)
          .where(and(eq(table.id, a.id), eq(table.campaignId, cid)))
          .returning({ id: table.id });
        return r.length ? { ok: true, id: a.id } : fail("Not found");
      }
      // A new beat goes last. The column default 0 would tie with the first beat once beat.reorder has numbered them.
      if (a.kind === "beat") {
        const adventureId = (a.data as z.output<typeof CodexInput.beat>).adventureId;
        const [{ m } = { m: null }] = await tx
          .select({ m: max(beat.order) })
          .from(beat)
          .where(and(eq(beat.adventureId, adventureId), eq(beat.campaignId, cid)));
        data.order = (m ?? -1) + 1;
      }
      const [row] = await tx
        .insert(table)
        .values({ ...data, campaignId: cid } as never)
        .returning({ id: table.id });
      return { ok: true, id: row!.id }; // the row was just inserted
    }

    case "codex.delete": {
      const table = codexTable[a.kind];
      const r = await tx
        .delete(table)
        .where(and(eq(table.id, a.id), eq(table.campaignId, cid)))
        .returning({ id: table.id });
      if (!r.length) fail("Not found");
      // Beats list NPCs and handouts in uuid arrays, which have no FK to clear them.
      if (a.kind === "npc")
        await tx
          .update(beat)
          .set({ npcIds: sql`array_remove(${beat.npcIds}, ${a.id}::uuid)` })
          .where(eq(beat.campaignId, cid));
      if (a.kind === "handout")
        await tx
          .update(beat)
          .set({ handoutIds: sql`array_remove(${beat.handoutIds}, ${a.id}::uuid)` })
          .where(eq(beat.campaignId, cid));
      return { ok: true };
    }

    case "beat.reorder": {
      const rows = await tx
        .select({ id: beat.id })
        .from(beat)
        .where(and(eq(beat.adventureId, a.adventureId), eq(beat.campaignId, cid)));
      const ids = rows.map((r) => r.id);
      if (new Set(a.ids).size !== ids.length || !a.ids.every((x) => ids.includes(x)))
        fail("Reorder must list every beat exactly once");
      for (const [order, bid] of a.ids.entries()) await tx.update(beat).set({ order }).where(eq(beat.id, bid));
      return { ok: true };
    }
  }
}
