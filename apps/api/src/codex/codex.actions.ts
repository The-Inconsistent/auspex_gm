import { randomUUID } from "node:crypto";
import { and, eq, inArray, max, sql } from "drizzle-orm";
import { hazards, hulkHazardIds, places, spaceHulk, threats } from "@wg/data";
import type { z } from "zod";
import {
  LocationHazard,
  hulkNotes,
  MAX_PLACES_PER_ADD,
  placeNotes,
  roomNotes,
  wouldCycle,
  type Action,
  type ActionResult,
  type CodexInput,
  type HulkTable,
} from "@wg/shared";
import type { Ctx } from "../auth/auth.service.ts";
import { character } from "../character/character.schema.ts";
import type { Tx } from "../core/db.ts";
import { fail } from "../core/errors.ts";
import { adventure, beat, faction, handout, location, npc } from "./codex.schema.ts";

export type CodexAction = Extract<
  Action,
  { type: "codex.save" | "codex.delete" | "beat.reorder" | "codex.addPlaces" | "codex.addHulk" }
>;

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

// A place's book hazards must name a row of the catalogue, at an intensity that row prints (rules-flow.md §11.94).
export function checkHazards(list: LocationHazard[]) {
  if (new Set(list.map((h) => h.id)).size < list.length) fail("A place lists the same hazard entry twice");
  for (const h of list) {
    if (h.kind !== "book") continue;
    const row = hazards.get(h.hazardId);
    if (!row) fail(`Unknown hazard "${h.hazardId}"`);
    if (h.variant && !row.variants.some((v) => v.name === h.variant))
      fail(`"${row.name}" has no ${h.variant} intensity`);
  }
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
        // A scene picks among its place's hazards (§11.95). A pick its place no longer lists is dropped, not refused,
        // so a scene whose place lost a hazard still saves.
        const [place] = b.locationId
          ? await tx
              .select({ list: location.hazardList })
              .from(location)
              .where(and(eq(location.id, b.locationId), eq(location.campaignId, cid)))
          : [];
        const listed = new Set(
          LocationHazard.array()
            .safeParse(place?.list)
            .data?.map((h) => h.id),
        );
        data.hazards = b.hazards.filter((h, i) => listed.has(h.id) && b.hazards.findIndex((x) => x.id === h.id) === i);
        // An exit leads to a scene of the same adventure; checkRefs alone would accept one from another adventure.
        const targets = [...new Set(b.exits.flatMap((e) => (e.beatId ? [e.beatId] : [])))];
        if (targets.length) {
          const found = await tx
            .select({ id: beat.id })
            .from(beat)
            .where(and(inArray(beat.id, targets), eq(beat.adventureId, b.adventureId), eq(beat.campaignId, cid)));
          if (found.length !== targets.length) fail("Exit scene not found");
        }
      }
      if (a.kind === "npc") {
        const n = a.data as z.output<typeof CodexInput.npc>;
        await refs(faction, [n.factionId], "Faction");
        if (n.statSource.kind === "bestiary") checkThreats([n.statSource.threatId]);
      }
      if (a.kind === "location") {
        const parentId = (a.data as z.output<typeof CodexInput.location>).parentId;
        if (parentId && parentId === a.id) fail("A location can't be inside itself");
        checkHazards((a.data as z.output<typeof CodexInput.location>).hazardList);
        await refs(location, [parentId], "Parent location");
        // Nor inside a place that is inside it (issue #50). Only a saved place can have places inside; the action queue
        // serialises the campaign, so nothing moves between this read and the write. A save that keeps the parent
        // (REVEALED, an edit) passes, so a loop saved before this guard never locks a place.
        if (a.id && parentId) {
          const rows = await tx
            .select({ id: location.id, name: location.name, parentId: location.parentId })
            .from(location)
            .where(eq(location.campaignId, cid));
          const row = (id: string) => rows.find((l) => l.id === id);
          const parentOf = new Map(rows.map((l) => [l.id, l.id === a.id ? parentId : l.parentId]));
          if (row(a.id)?.parentId !== parentId && wouldCycle({ id: a.id, parentId, parentOf }))
            fail(`${row(a.id)?.name} can't go inside ${row(parentId)?.name}: it is already inside it`);
        }
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
      // Exits name their target inside jsonb: keep the label, drop the target. PREP's DONE and SKIP re-send the whole
      // beat, so a dangling id would make the save check refuse them.
      if (a.kind === "beat")
        await tx
          .update(beat)
          .set({
            exits: sql`(select jsonb_agg(case when e->>'beatId' = ${a.id} then jsonb_set(e, '{beatId}', 'null') else e end order by i)
              from jsonb_array_elements(${beat.exits}) with ordinality as t(e, i))`,
          })
          .where(and(eq(beat.campaignId, cid), sql`${beat.exits} @> ${JSON.stringify([{ beatId: a.id }])}::jsonb`));
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

    // ADD FROM BOOK (issue #50): the place and everything inside it, from the server's own data, so the client never
    // sends book text. Parents come first in a place file, so one pass finds the subtree and one insert keeps it nested.
    case "codex.addPlaces": {
      const root = places.get(a.placeId) ?? fail(`Unknown place "${a.placeId}"`);
      const subtree = new Set([root.id]);
      for (const p of places.values()) if (p.parent && subtree.has(p.parent)) subtree.add(p.id);
      // ponytail: MAX_PLACES_PER_ADD keeps one action's insert small; a whole system goes in world by world.
      if (subtree.size > MAX_PLACES_PER_ADD)
        fail(`${root.name} holds ${subtree.size - 1} places; add the places inside it one by one`);
      await checkRefs(tx, { campaignId: cid, table: location, ids: [a.parentId], what: "Parent location" });
      const ids = new Map([...subtree].map((id) => [id, randomUUID()]));
      // One createdAt per row in book order, as import does: one transaction shares one now(), and lists load in
      // createdAt order.
      const t0 = Date.now();
      await tx.insert(location).values(
        // Every id in subtree came from places, and validate puts parents first, so each lookup below exists.
        [...subtree].map((id, i) => {
          const p = places.get(id)!;
          return {
            id: ids.get(id)!,
            campaignId: cid,
            name: p.name,
            parentId: p.id === root.id ? a.parentId : ids.get(p.parent!)!,
            gmNotes: placeNotes(p),
            createdAt: new Date(t0 + i),
          };
        }),
      );
      return { ok: true, id: ids.get(root.id)! };
    }

    // The Space Hulk Generator (issue #50 step 8, RR1 pp.6–11): the hulk with its origins, occupants, objective and
    // Stage 4 hazards, and its rooms inside it; or, with no hulk, more rooms inside a place already here (§11.102). The
    // client sends row ids only, as with ADD FROM BOOK.
    case "codex.addHulk": {
      if (!a.hulk && (!a.parentId || !a.rooms.length)) fail("Pick a room, and the place it goes inside");
      await checkRefs(tx, { campaignId: cid, table: location, ids: [a.parentId], what: "Parent location" });
      const rowOf = (t: HulkTable, rowId: string) =>
        t.rows.find((r) => r.id === rowId) ?? fail(`"${rowId}" isn't on the ${t.name}`);
      const rooms = a.rooms.map((r) => rowOf(spaceHulk.rooms, r));
      const h = a.hulk;
      const hulkId = h ? randomUUID() : null;
      // One createdAt per row, as addPlaces does, so the rooms list in the order they were rolled.
      const t0 = Date.now();
      const rows: (typeof location.$inferInsert)[] = rooms.map((r, i) => ({
        id: randomUUID(),
        campaignId: cid,
        name: r.name,
        parentId: hulkId ?? a.parentId,
        gmNotes: roomNotes(spaceHulk, r),
        createdAt: new Date(t0 + 1 + i),
      }));
      if (h && hulkId)
        rows.unshift({
          id: hulkId,
          campaignId: cid,
          name: h.name,
          parentId: a.parentId,
          gmNotes: hulkNotes(spaceHulk, {
            origins: h.origins.map((o) => rowOf(spaceHulk.origin, o)),
            occupants: rowOf(spaceHulk.occupants, h.occupants),
            objective: rowOf(spaceHulk.objectives, h.objective),
          }),
          // Every Stage 4 row reads "while aboard this vessel", so it sits on the hulk, not a room (§11.102).
          hazardList: [...new Set(h.hazards)].map((hazardId) => {
            if (!hulkHazardIds.has(hazardId)) fail(`"${hazardId}" isn't on the space hulk Hazards Table`);
            return { id: randomUUID(), kind: "book" as const, hazardId, variant: null };
          }),
          createdAt: new Date(t0),
        });
      await tx.insert(location).values(rows);
      // Without a hulk, the guard at the top of this case made sure parentId is set.
      return { ok: true, id: hulkId ?? a.parentId! };
    }
  }
}
