import { readFileSync } from "node:fs";
import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { threats } from "@wg/data";
import { draftRecap, journalLabel, type Action, type JournalItem, type NameOf, type RecapDraft } from "@wg/shared";
import type { Ctx } from "../auth/auth.service.ts";
import { session } from "../campaign/campaign.schema.ts";
import { character } from "../character/character.schema.ts";
import { adventure, beat, faction, handout, item, location, npc } from "../codex/codex.schema.ts";
import { db, type Db, type Tx } from "../core/db.ts";
import { fail } from "../core/errors.ts";
import { combatant, encounter } from "../encounter/encounter.schema.ts";
import { loadCustomThreats } from "../threat/threat.service.ts";
import { journalChange, journalEntry } from "./journal.schema.ts";

// Tables the journal leaves alone. Everything else in the database is journaled by default, so a new feature table is
// covered without anyone remembering this file. Access rows (tokens, invites, seats) aren't table state an undo should
// bring back; undo refuses instead when it would orphan them (journal.actions.ts).
const UNJOURNALED = new Set([
  "access_token",
  "app_user",
  "membership",
  "invite",
  "library_character", // outside any campaign: plain REST, no action
  "admin_event", // an audit log that must survive an undo; admin actions log into it inside applyAction
  "codex_image", // uploaded over REST, and its bytea is too heavy to copy into every row image
  "journal_entry",
  "journal_change",
]);

// Runs at every start, after the migrations: (re)creates the functions and puts the `zz_journal` trigger on every
// table of the public schema but the ones above. The tables come from the database, not Drizzle's schema object, so a
// table that was never registered there (test_call) is covered too. Each needs a uuid `id`, which is how journal_change
// names a row, so a table without one fails the api's start rather than breaking undo later.
// Named `zz_` only to sort last among ordinary triggers; cascade order is not what the name decides (journal.sql).
export async function installJournal() {
  const functions = readFileSync(new URL("./journal.sql", import.meta.url), "utf8");
  await db.transaction(async (tx) => {
    for (const stmt of functions.split("--> statement-breakpoint")) await tx.execute(sql.raw(stmt));
    const found = await tx.execute<{ table_name: string; has_id: boolean }>(sql`
      select t.table_name,
             exists (select 1 from information_schema.columns c
                     where c.table_schema = t.table_schema and c.table_name = t.table_name
                       and c.column_name = 'id' and c.udt_name = 'uuid') as has_id
        from information_schema.tables t
       where t.table_schema = 'public' and t.table_type = 'BASE TABLE'
       order by t.table_name`);
    for (const { table_name: t, has_id } of found.rows) {
      await tx.execute(sql.raw(`DROP TRIGGER IF EXISTS zz_journal ON "${t}"`));
      if (UNJOURNALED.has(t)) continue;
      if (!has_id) throw new Error(`journal: ${t} has no uuid id; list it in UNJOURNALED`);
      await tx.execute(
        sql.raw(
          `CREATE TRIGGER zz_journal AFTER INSERT OR UPDATE OR DELETE ON "${t}" FOR EACH ROW EXECUTE FUNCTION journal_capture()`,
        ),
      );
    }
  });
}

// Runs one action as a journal entry. The entry is opened first and its id handed to the `zz_journal` trigger through a
// transaction-local setting, so every row the action touches (cascades included) is captured in the same transaction.
// An action that changed nothing (a read, a refused no-op) leaves no entry. `entry` is the id of the entry that stays,
// for the gateway to put in the ack (the tracker's UNDO names it), null when there is none. `skip` runs the action
// unjournaled: the admin key's seed loads, which would only fill the journal with a pack's worth of entries. A
// `campaign.delete` is never journaled, for the reason below.
export async function journaled<T>(
  tx: Tx,
  { ctx, action, skip = false }: { ctx: Ctx; action: Action; skip?: boolean },
  fn: () => Promise<T>,
): Promise<{ result: T; entry: string | null }> {
  // A deleted game takes its journal with it (journal_entry cascades from campaign), so the trigger's change rows would
  // point at an entry that is gone and the delete would roll back. There is nothing to undo into either.
  if (skip || action.type === "campaign.delete") return { result: await fn(), entry: null };
  const [entry] = await tx
    .insert(journalEntry)
    .values({ campaignId: ctx.campaignId, userId: ctx.userId, action })
    .returning({ id: journalEntry.id });
  await tx.execute(sql`select set_config('wg.journal_entry', ${entry!.id}, true)`); // the row was just inserted
  const result = await fn();
  const [changed] = await tx
    .select({ seq: journalChange.seq })
    .from(journalChange)
    .where(eq(journalChange.entryId, entry!.id))
    .limit(1);
  if (!changed) await tx.delete(journalEntry).where(eq(journalEntry.id, entry!.id));
  return { result, entry: changed ? entry!.id : null };
}

// The entry `journaled` opened for this transaction, or null when the action runs outside one.
export async function currentEntry(tx: Tx) {
  const res = await tx.execute<{ id: string | null }>(
    sql`select nullif(current_setting('wg.journal_entry', true), '') as id`,
  );
  return res.rows[0]?.id ?? null;
}

// Journal tables whose rows the GM sees by name, and the key their name sits under in a row image.
const NAMED = ["character", "combatant", "item", "faction", "location", "npc", "handout", "adventure", "beat"];

type EntryRef = { id: string; action: Action };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Postgres takes 65535 bind parameters in a statement; a recap draft can reference more rows than that in theory.
const CHUNK = 2000;
const chunked = <T>(list: T[]): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += CHUNK) out.push(list.slice(i, i + CHUNK));
  return out;
};

// Every uuid string anywhere in an action payload: the rows it names.
function idsIn(value: unknown, into: Set<string>) {
  if (typeof value === "string") {
    if (UUID.test(value)) into.add(value);
  } else if (Array.isArray(value)) for (const v of value) idsIn(v, into);
  else if (value && typeof value === "object") for (const v of Object.values(value)) idsIn(v, into);
}

// A name for the row ids these entries mention: characters, combatants (label, else the Threat's name, else the
// Agent's), items and codex entries; bestiary and custom threat ids as well. Only the ids the entries reference are
// looked up (their changed rows plus the ids in their action payloads), live rows first and the journal's row images
// for a row that is gone since (a removed combatant, a deleted entry). One query per table, however long the journal is.
export async function journalNames(
  conn: Db,
  { campaignId, entries }: { campaignId: string; entries: EntryRef[] },
): Promise<NameOf> {
  const ids = new Set<string>();
  for (const e of entries) idsIn(e.action, ids);
  for (const part of chunked(entries.map((e) => e.id)))
    for (const r of await conn
      .select({ id: journalChange.rowId })
      .from(journalChange)
      .where(and(inArray(journalChange.entryId, part), inArray(journalChange.tbl, NAMED))))
      ids.add(r.id);

  const names = new Map<string, string>();
  const chars = new Map<string, string>();
  const combatants = new Map<string, { label?: string; threat?: string; characterId?: string }>();
  const put = (id: string, name: string | null | undefined) => {
    if (name) names.set(id, name);
  };
  // Images first (oldest first, so the latest wins), then the live rows win over them.
  const imaged = new Set<string>();
  const readImages = async (wanted: string[]) => {
    const fresh = wanted.filter((i) => !imaged.has(i));
    for (const i of fresh) imaged.add(i);
    for (const part of chunked(fresh)) await readImagesOf(part);
  };
  const readImagesOf = async (part: string[]) => {
    const images = await conn.execute<{
      tbl: string;
      id: string;
      name: string | null;
      title: string | null;
      label: string | null;
      snap: string | null;
      char_id: string | null;
    }>(sql`
      select c.tbl, c.row_id as id,
             coalesce(c.after, c.before) ->> 'name' as name, coalesce(c.after, c.before) ->> 'title' as title,
             coalesce(c.after, c.before) ->> 'label' as label,
             coalesce(c.after, c.before) -> 'stat_snapshot' ->> 'name' as snap,
             coalesce(c.after, c.before) ->> 'character_id' as char_id
        from journal_change c join journal_entry e on e.id = c.entry_id
       where e.campaign_id = ${campaignId} and c.row_id in (${sql.join(
         part.map((i) => sql`${i}`),
         sql`, `,
       )}) and c.tbl in (${sql.join(
         NAMED.map((t) => sql`${t}`),
         sql`, `,
       )})
       order by c.seq`);
    for (const r of images.rows) {
      if (r.tbl === "combatant") {
        const cur = combatants.get(r.id) ?? {};
        combatants.set(r.id, {
          label: r.label ?? cur.label,
          threat: r.snap ?? cur.threat,
          characterId: r.char_id ?? cur.characterId,
        });
        if (r.char_id) ids.add(r.char_id); // a combatant with no label reads as its Agent
      } else {
        put(r.id, r.name ?? r.title);
        if (r.tbl === "character" && r.name) chars.set(r.id, r.name);
      }
    }
  };
  await readImages([...ids]);
  await readImages([...ids]); // the Agents the images' combatants stand for
  for (const part of chunked([...ids]))
    for (const r of await conn
      .select({
        id: combatant.id,
        label: combatant.label,
        snap: combatant.statSnapshot,
        characterId: combatant.characterId,
      })
      .from(combatant)
      .innerJoin(encounter, eq(encounter.id, combatant.encounterId))
      .where(and(eq(encounter.campaignId, campaignId), inArray(combatant.id, part)))) {
      combatants.set(r.id, {
        label: r.label ?? undefined,
        threat: r.snap?.name,
        characterId: r.characterId ?? undefined,
      });
      if (r.characterId) ids.add(r.characterId);
    }
  await readImages([...ids]); // and the Agents of the live combatants, in case they are gone
  for (const part of chunked([...ids]))
    for (const r of await conn
      .select({ id: character.id, name: character.name })
      .from(character)
      .where(and(eq(character.campaignId, campaignId), inArray(character.id, part)))) {
      put(r.id, r.name);
      chars.set(r.id, r.name);
    }
  for (const [id, c] of combatants)
    put(id, c.label ?? c.threat ?? (c.characterId ? chars.get(c.characterId) : undefined));
  // One at a time: a transaction's connection runs one query at once.
  for (const part of chunked([...ids])) {
    const lists = [
      () =>
        conn
          .select({ id: item.id, n: item.name })
          .from(item)
          .where(and(eq(item.campaignId, campaignId), inArray(item.id, part))),
      () =>
        conn
          .select({ id: faction.id, n: faction.name })
          .from(faction)
          .where(and(eq(faction.campaignId, campaignId), inArray(faction.id, part))),
      () =>
        conn
          .select({ id: location.id, n: location.name })
          .from(location)
          .where(and(eq(location.campaignId, campaignId), inArray(location.id, part))),
      () =>
        conn
          .select({ id: npc.id, n: npc.name })
          .from(npc)
          .where(and(eq(npc.campaignId, campaignId), inArray(npc.id, part))),
      () =>
        conn
          .select({ id: handout.id, n: handout.title })
          .from(handout)
          .where(and(eq(handout.campaignId, campaignId), inArray(handout.id, part))),
      () =>
        conn
          .select({ id: adventure.id, n: adventure.title })
          .from(adventure)
          .where(and(eq(adventure.campaignId, campaignId), inArray(adventure.id, part))),
      () =>
        conn
          .select({ id: beat.id, n: beat.title })
          .from(beat)
          .where(and(eq(beat.campaignId, campaignId), inArray(beat.id, part))),
    ];
    for (const list of lists) for (const r of await list()) put(r.id, r.n);
  }
  const custom = new Map((await loadCustomThreats(conn, campaignId)).map((t) => [t.id, t.name]));
  return (id) => names.get(id) ?? custom.get(id) ?? threats.get(id)?.name;
}

// The entries plus, for every undo among them, the entry it reverted (whatever page of the list that is on), and so on
// for an undo of an undo. A target the journal no longer holds stays a bare undo of it.
async function withTargets(conn: Db, { campaignId, entries }: { campaignId: string; entries: EntryRef[] }) {
  const known = new Map(entries.map((e) => [e.id, e.action]));
  for (;;) {
    const missing = [...known.values()]
      .flatMap((a) => (a.type === "journal.undo" && !known.has(a.entryId) ? [a.entryId] : []))
      .slice(0, 200);
    if (!missing.length) break;
    const rows = await conn
      .select({ id: journalEntry.id, action: journalEntry.action })
      .from(journalEntry)
      .where(and(eq(journalEntry.campaignId, campaignId), inArray(journalEntry.id, missing)));
    for (const id of missing)
      known.set(id, rows.find((r) => r.id === id)?.action ?? { type: "journal.undo", entryId: id });
  }
  return known;
}

// Labels for entries (journalLabel plus names). An undo reads "Undo “<its target's label>”", so the targets are fetched
// too, and an undo of an undo nests.
export async function entryLabels(
  conn: Db,
  { campaignId, entries }: { campaignId: string; entries: EntryRef[] },
): Promise<Map<string, string>> {
  const known = await withTargets(conn, { campaignId, entries });
  const names = await journalNames(conn, {
    campaignId,
    entries: [...known].map(([id, action]) => ({ id, action })),
  });
  const labels = new Map<string, string>();
  const visiting = new Set<string>();
  const labelOf = (id: string): string | undefined => {
    const hit = labels.get(id);
    const action = known.get(id);
    if (hit || !action || visiting.has(id)) return hit;
    visiting.add(id);
    const label = journalLabel(action, (x) => (known.has(x) ? labelOf(x) : names(x)));
    visiting.delete(id);
    labels.set(id, label);
    return label;
  };
  for (const id of known.keys()) labelOf(id);
  return labels;
}

// The label of the earliest standing entry after `target` that changed this row, preferring one that wrote a column the
// target wrote: the one the GM has to undo first.
// Null when none is found (the caller falls back to a generic refusal).
export async function blockingLabel(
  conn: Db,
  {
    campaignId,
    targetId,
    exceptId,
    tbl,
    rowId,
  }: { campaignId: string; targetId: string; exceptId: string; tbl: string; rowId: string },
): Promise<string | null> {
  // An entry that changed a column the target wrote comes first: undoing a +1 Wound under a later Shock tap and a later
  // Wound tap names the Wound tap, the real conflict, not merely the earliest change to the row.
  const res = await conn.execute<{ id: string; action: Action }>(sql`
    with tk as (
      select distinct k from journal_change t, jsonb_object_keys(coalesce(t.after, '{}'::jsonb)) k
       where t.entry_id = ${targetId} and t.tbl = ${tbl} and t.row_id = ${rowId} and t.op = 'U')
    select e.id, e.action
      from journal_entry e join journal_change c on c.entry_id = e.id
     where e.campaign_id = ${campaignId} and e.undone_by is null and e.id <> ${targetId} and e.id <> ${exceptId}
       and e.created_at > (select created_at from journal_entry where id = ${targetId})
       and c.tbl = ${tbl} and c.row_id = ${rowId}
     order by (c.op <> 'U' or not exists (select 1 from tk)
               or exists (select 1 from jsonb_object_keys(c.after) k2 where k2 in (select k from tk))) desc,
              e.created_at, c.seq
     limit 1`);
  const row = res.rows[0];
  if (!row) return null;
  return (await entryLabels(conn, { campaignId, entries: [row] })).get(row.id) ?? null;
}

// The newest entries first, as the GM's history list reads them (pushed over the socket, `journal` event).
export async function listJournal(
  conn: Db,
  { campaignId, limit }: { campaignId: string; limit: number },
): Promise<JournalItem[]> {
  const rows = await conn
    .select()
    .from(journalEntry)
    .where(eq(journalEntry.campaignId, campaignId))
    .orderBy(desc(journalEntry.createdAt))
    .limit(limit);
  const labels = await entryLabels(conn, { campaignId, entries: rows });
  return rows.map((r) => ({
    id: r.id,
    at: r.createdAt.toISOString(),
    type: r.action.type,
    label: labels.get(r.id) ?? r.action.type,
    undoneBy: r.undoneBy,
    undoes: r.undoes,
  }));
}

// GET /api/campaigns/:id/sessions/:sessionId/recap-draft: the session's entries (made between its start and its end, or
// now while it runs; an entry carries no session id) as recap lines for the GM to edit.
export async function sessionRecapDraft(
  conn: Db,
  { campaignId, sessionId }: { campaignId: string; sessionId: string },
): Promise<RecapDraft> {
  const [s] = await conn
    .select({ startedAt: session.startedAt, endedAt: session.endedAt })
    .from(session)
    .where(and(eq(session.id, sessionId), eq(session.campaignId, campaignId)));
  if (!s) fail("No such session");
  const rows = await conn
    .select()
    .from(journalEntry)
    .where(
      and(
        eq(journalEntry.campaignId, campaignId),
        gte(journalEntry.createdAt, s.startedAt),
        lte(journalEntry.createdAt, s.endedAt ?? new Date()),
      ),
    )
    .orderBy(asc(journalEntry.createdAt));
  return { lines: draftRecap(rows, await journalNames(conn, { campaignId, entries: rows })) };
}
