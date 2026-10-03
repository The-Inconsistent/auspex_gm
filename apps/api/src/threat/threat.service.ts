import { and, eq, inArray, sql } from "drizzle-orm";
import { threats } from "@wg/data";
import { CUSTOM_PREFIX, CUSTOM_THREAT_CAP, isCustomThreatId, type Threat } from "@wg/shared";

export { CUSTOM_THREAT_CAP };
import { beat, npc } from "../codex/codex.schema.ts";
import type { Db, Tx } from "../core/db.ts";
import { fail } from "../core/errors.ts";
import { customThreat } from "./threat.schema.ts";

// Every custom threat of one campaign, oldest first, as the GM's codex carries them.
export async function loadCustomThreats(conn: Db, campaignId: string): Promise<Threat[]> {
  const rows = await conn
    .select({ data: customThreat.data })
    .from(customThreat)
    .where(eq(customThreat.campaignId, campaignId))
    .orderBy(customThreat.createdAt);
  return rows.map((r) => r.data);
}

// The one lookup for a threat id, wherever the app resolves one: a bestiary id comes from @wg/data's static map, a
// `custom-` id from this campaign's rows (issue #43). An id in neither is missing, and the caller says so.
export async function loadThreats(
  conn: Db,
  { campaignId, ids }: { campaignId: string; ids: readonly string[] },
): Promise<Map<string, Threat>> {
  const want = [...new Set(ids)];
  const found = new Map<string, Threat>();
  for (const id of want) {
    const t = threats.get(id);
    if (t) found.set(id, t);
  }
  const customIds = want.filter((id) => isCustomThreatId(id));
  if (customIds.length) {
    const rows = await conn
      .select({ data: customThreat.data })
      .from(customThreat)
      .where(
        and(
          eq(customThreat.campaignId, campaignId),
          inArray(
            customThreat.slug,
            customIds.map((id) => id.slice(CUSTOM_PREFIX.length)),
          ),
        ),
      );
    for (const r of rows) found.set(r.data.id, r.data);
  }
  return found;
}

// Prepared-encounter and bestiary-NPC threats must exist, or the beat can't start later. The bestiary plus this
// campaign's own threats; the message is the same whichever it was.
export async function checkThreats(conn: Db, campaignId: string, ids: string[]) {
  if (!ids.length) return;
  const known = await loadThreats(conn, { campaignId, ids });
  const unknown = ids.find((id) => !known.has(id));
  if (unknown) fail(`Unknown threat "${unknown}"`);
}

// What still points at a custom threat, so DELETE says why it is refused. A fight already holding it is fine: the
// combatant row carries its own snapshot.
export async function customThreatUses(tx: Tx, campaignId: string, threatId: string): Promise<string | null> {
  const [inBeat] = await tx
    .select({ title: beat.title })
    .from(beat)
    .where(and(eq(beat.campaignId, campaignId), sql`${beat.encounter} @> ${JSON.stringify([{ threatId }])}::jsonb`))
    .limit(1);
  if (inBeat) return `the scene "${inBeat.title}"`;
  const [inNpc] = await tx
    .select({ name: npc.name })
    .from(npc)
    .where(
      and(
        eq(npc.campaignId, campaignId),
        sql`${npc.statSource} @> ${JSON.stringify({ kind: "bestiary", threatId })}::jsonb`,
      ),
    )
    .limit(1);
  return inNpc ? `the NPC ${inNpc.name}` : null;
}
