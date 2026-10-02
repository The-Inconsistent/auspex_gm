import { and, count, eq } from "drizzle-orm";
import { threats } from "@wg/data";
import { Threat, customThreatId, threatSlug, type Action, type ActionResult } from "@wg/shared";
import type { Ctx } from "../auth/auth.service.ts";
import type { Tx } from "../core/db.ts";
import { fail } from "../core/errors.ts";
import { customThreat } from "./threat.schema.ts";
import { CUSTOM_THREAT_CAP, customThreatUses } from "./threat.service.ts";

export type ThreatAction = Extract<Action, { type: "threat.save" | "threat.delete" }>;

const slugsOf = async (tx: Tx, campaignId: string) => {
  const rows = await tx
    .select({ slug: customThreat.slug })
    .from(customThreat)
    .where(eq(customThreat.campaignId, campaignId));
  return rows.map((r) => r.slug);
};

export async function applyThreatAction(
  tx: Tx,
  { ctx, action: a }: { ctx: Ctx; action: ThreatAction },
): Promise<ActionResult> {
  const cid = ctx.campaignId;

  switch (a.type) {
    case "threat.save": {
      // The client sends the stat block without its id, source and page: the server sets all three, so a client can
      // neither claim a book as its source nor name itself after a bestiary entry.
      const slug = a.slug ?? threatSlug(a.data.name, await slugsOf(tx, cid));
      const data = Threat.parse({ ...a.data, id: customThreatId(slug), source: "custom", page: 1 });
      if (threats.has(data.id)) fail("That id belongs to the bestiary"); // `validate` holds this line too
      if (a.slug) {
        const r = await tx
          .update(customThreat)
          .set({ data })
          .where(and(eq(customThreat.campaignId, cid), eq(customThreat.slug, a.slug)))
          .returning({ id: customThreat.id });
        return r.length ? { ok: true, id: r[0]!.id, slug } : fail("Threat not found");
      }
      const [{ n } = { n: 0 }] = await tx
        .select({ n: count() })
        .from(customThreat)
        .where(eq(customThreat.campaignId, cid));
      if (n >= CUSTOM_THREAT_CAP) fail(`At most ${CUSTOM_THREAT_CAP} custom threats per campaign`);
      const [row] = await tx
        .insert(customThreat)
        .values({ campaignId: cid, slug, data })
        .returning({ id: customThreat.id });
      return { ok: true, id: row!.id, slug };
    }

    case "threat.delete": {
      // A scene or an NPC still naming it would break when the scene starts, so the GM clears those first. A fight
      // already holding it is untouched: that combatant carries its own snapshot.
      const used = await customThreatUses(tx, cid, customThreatId(a.slug));
      if (used) fail(`Still used by ${used}`);
      const r = await tx
        .delete(customThreat)
        .where(and(eq(customThreat.campaignId, cid), eq(customThreat.slug, a.slug)))
        .returning({ id: customThreat.id });
      return r.length ? { ok: true } : fail("Threat not found");
    }
  }
}
