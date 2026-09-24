import { and, eq, sql } from "drizzle-orm";
import type { Action, ActionResult } from "@wg/shared";
import type { Ctx } from "../auth/auth.service.ts";
import type { Tx } from "../core/db.ts";
import { fail } from "../core/errors.ts";
import { adventure, beat, faction, handout, location, npc } from "./codex.schema.ts";

export type CodexAction = Extract<Action, { type: "codex.save" | "codex.delete" | "beat.reorder" }>;

const codexTable = { faction, adventure, beat, location, npc, handout } as const;

export async function applyCodexAction(tx: Tx, { ctx, action: a }: { ctx: Ctx; action: CodexAction }): Promise<ActionResult> {
  const cid = ctx.campaignId;

  switch (a.type) {
    case "codex.save": {
      // The per-kind shape was validated by CodexInput[kind]; the union just doesn't narrow `data` by `kind`.
      const table = codexTable[a.kind];
      const data: Record<string, unknown> = { ...a.data };
      if (a.kind === "beat") {
        const [adv] = await tx.select({ id: adventure.id }).from(adventure)
          .where(and(eq(adventure.id, data.adventureId as string), eq(adventure.campaignId, cid)));
        if (!adv) fail("Adventure not found");
      }
      // First reveal stamps the time; later saves keep it (only an UPDATE can read the old value).
      if (a.kind === "handout") data.revealedAt = !data.revealed ? null : a.id ? sql`coalesce(${handout.revealedAt}, now())` : new Date();
      if (a.id) {
        const r = await tx.update(table).set(data as never).where(and(eq(table.id, a.id), eq(table.campaignId, cid))).returning({ id: table.id });
        return r.length ? { ok: true, id: a.id } : fail("Not found");
      }
      const [row] = await tx.insert(table).values({ ...data, campaignId: cid } as never).returning({ id: table.id });
      return { ok: true, id: row!.id }; // the row was just inserted
    }

    case "codex.delete": {
      const table = codexTable[a.kind];
      const r = await tx.delete(table).where(and(eq(table.id, a.id), eq(table.campaignId, cid))).returning({ id: table.id });
      return r.length ? { ok: true } : fail("Not found");
    }

    case "beat.reorder": {
      const rows = await tx.select({ id: beat.id }).from(beat).where(and(eq(beat.adventureId, a.adventureId), eq(beat.campaignId, cid)));
      const ids = rows.map((r) => r.id);
      if (new Set(a.ids).size !== ids.length || !a.ids.every((x) => ids.includes(x))) fail("Reorder must list every beat exactly once");
      for (const [order, bid] of a.ids.entries()) await tx.update(beat).set({ order }).where(eq(beat.id, bid));
      return { ok: true };
    }
  }
}
