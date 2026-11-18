// The action journal against a real Postgres (the trigger and journal_undo live in SQL, so a mock proves nothing).
// Needs DATABASE_URL to reach a database; skips itself otherwise. It runs the migrations and installs the journal as the
// api's start does, then works in its own campaigns and deletes them.
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "pg";
import { Action, type ActionInput, type ActionResult } from "@wg/shared";

async function reachable() {
  if (!process.env.DATABASE_URL) return false;
  const c = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 1500 });
  try {
    await c.connect();
    await c.end();
    return true;
  } catch {
    return false;
  }
}
const up = await reachable();

// The few matchers used here, over node:assert like smoke.test.ts (bun:test has no types in this workspace).
const expect = (actual: unknown) => ({
  toBe: (x: unknown) => assert.equal(actual, x),
  toEqual: (x: unknown) => assert.deepEqual(actual, x),
  toMatchObject: (x: { ok: true }) => assert.equal((actual as { ok: boolean }).ok, x.ok),
  toBeUndefined: () => assert.equal(actual, undefined),
  toBeNull: () => assert.equal(actual, null),
  toBeGreaterThanOrEqual: (x: number) => assert.ok((actual as number) >= x),
  toMatch: (x: RegExp) => assert.match(String(actual), x),
});

// A skipped describe still runs its body under bun, so without a database nothing is registered but a skipped test.
if (!up) test("action journal (no reachable DATABASE_URL)", { skip: true }, () => {});
else
  describe("action journal", async () => {
    const { sql, eq } = await import("drizzle-orm");
    const { db, runMigrations } = await import("../src/core/db.ts");
    const { campaign, session } = await import("../src/campaign/campaign.schema.ts");
    const { character } = await import("../src/character/character.schema.ts");
    const { combatant, encounter } = await import("../src/encounter/encounter.schema.ts");
    const { journalChange, journalEntry } = await import("../src/journal/journal.schema.ts");
    const { installJournal, journaled, listJournal, sessionRecapDraft } =
      await import("../src/journal/journal.service.ts");
    const { item } = await import("../src/codex/codex.schema.ts");
    const { applyAction } = await import("../src/table/table.dispatch.ts");
    const { ActionError } = await import("../src/core/errors.ts");

    await runMigrations();
    await installJournal(); // as main.ts does at every start

    const made: string[] = [];
    after(async () => {
      for (const id of made) await db.delete(campaign).where(eq(campaign.id, id));
    });

    async function newCampaign() {
      const [c] = await db.insert(campaign).values({ name: "Journal test", tier: 4 }).returning();
      made.push(c!.id);
      const ctx = { campaignId: c!.id, role: "gm" as const, characterId: null, userId: "user_test", admin: false };
      // Every action goes the way the gateway sends it.
      const run = async (input: ActionInput, opts: { skip?: boolean } = {}): Promise<ActionResult> => {
        const action = Action.parse(input);
        try {
          const done = await db.transaction((tx) =>
            journaled(tx, { ctx, action, skip: opts.skip }, () => applyAction(tx, { ctx, action })),
          );
          // As the gateway puts the entry in the ack.
          return done.entry && done.result.ok ? { ...done.result, entry: done.entry } : done.result;
        } catch (e) {
          if (e instanceof ActionError) return { ok: false as const, error: e.message };
          throw e;
        }
      };
      const entries = () =>
        db.select().from(journalEntry).where(eq(journalEntry.campaignId, c!.id)).orderBy(journalEntry.createdAt);
      const last = async () => (await entries()).at(-1)!;
      return { ctx, run, entries, last, campaignId: c!.id };
    }

    // A character, an encounter holding it and a Mob-free threat; returns what the tests poke at.
    async function fight(t: Awaited<ReturnType<typeof newCampaign>>) {
      const char = await t.run({ type: "character.create", name: "Brother Test" });
      const characterId = (char as { id: string }).id;
      await t.run({ type: "encounter.start" });
      const pc = (await t.run({ type: "combatant.addCharacter", characterId })) as { id: string };
      const a = (await t.run({ type: "combatant.addThreat", threatId: "ork-nob", label: "A" })) as { id: string };
      const b = (await t.run({ type: "combatant.addThreat", threatId: "ork-nob", label: "B" })) as { id: string };
      return { characterId, pc: pc.id, a: a.id, b: b.id };
    }
    const wounds = async (id: string) => (await db.select().from(combatant).where(eq(combatant.id, id)))[0]?.wounds;

    test("undo a combatant.adjust puts the wounds back", async () => {
      const t = await newCampaign();
      const f = await fight(t);
      await t.run({ type: "combatant.adjust", id: f.a, wounds: 2 });
      expect(await wounds(f.a)).toBe(2);
      const e = await t.last();
      expect(e.userId).toBe("user_test");
      // The journal holds only the changed key, not the stat snapshot.
      const [ch] = await db.select().from(journalChange).where(eq(journalChange.entryId, e.id));
      expect(Object.keys(ch!.before!)).toEqual(["wounds"]);
      expect(await t.run({ type: "journal.undo", entryId: e.id })).toMatchObject({ ok: true });
      expect(await wounds(f.a)).toBe(0);
    });

    test("undo latest-first, in a chain", async () => {
      const t = await newCampaign();
      const f = await fight(t);
      await t.run({ type: "combatant.adjust", id: f.a, wounds: 1 });
      const e1 = await t.last();
      await t.run({ type: "combatant.adjust", id: f.a, wounds: 2 });
      const e2 = await t.last();
      expect(await wounds(f.a)).toBe(3);
      // The older one can't go first: the later hit changed the same column.
      expect(await t.run({ type: "journal.undo", entryId: e1.id })).toEqual({
        ok: false,
        error: "Undo \u201cA: +2 Wounds\u201d first.",
      });
      expect(await wounds(f.a)).toBe(3); // refused whole: nothing half-undone
      expect(await t.run({ type: "journal.undo", entryId: e2.id })).toMatchObject({ ok: true });
      expect(await wounds(f.a)).toBe(1);
      expect(await t.run({ type: "journal.undo", entryId: e1.id })).toMatchObject({ ok: true });
      expect(await wounds(f.a)).toBe(0);
    });

    test("an older independent action undoes past a later one", async () => {
      const t = await newCampaign();
      const f = await fight(t);
      await t.run({ type: "combatant.adjust", id: f.a, wounds: 2 });
      const hitA = await t.last();
      await t.run({ type: "combatant.adjust", id: f.b, wounds: 3 });
      expect(await t.run({ type: "journal.undo", entryId: hitA.id })).toMatchObject({ ok: true });
      expect(await wounds(f.a)).toBe(0);
      expect(await wounds(f.b)).toBe(3);
    });

    test("undoing a closed Test under a newer call is refused, not a server error", async () => {
      const t = await newCampaign();
      const made = (await t.run({ type: "character.create", name: "Brother Test" })) as { id: string };
      const call: ActionInput = {
        type: "test.call",
        test: { kind: "skill", skill: "Awareness", dn: 3 },
        who: [made.id],
      };
      expect(await t.run(call)).toMatchObject({ ok: true });
      expect(await t.run({ type: "test.close" })).toMatchObject({ ok: true });
      const closed = await t.last();
      expect(await t.run(call)).toMatchObject({ ok: true }); // the campaign's one called Test is a new row now
      expect(await t.run({ type: "journal.undo", entryId: closed.id })).toEqual({
        ok: false,
        error: "A later change touched that test call. Undo that first.",
      });
    });

    test("a turn step's entry leaves TURN BACK's stack out, and undoing it keeps the step there (§11.183)", async () => {
      const t = await newCampaign();
      const f = await fight(t);
      await t.run({ type: "encounter.begin" });
      await t.run({ type: "turn.start", id: f.pc });
      const step = await t.last();
      const enc = async () => (await db.select().from(encounter).where(eq(encounter.campaignId, t.campaignId)))[0]!;
      const stack = (await enc()).history.length;
      expect(stack).toBeGreaterThanOrEqual(1);
      const [change] = await db.select().from(journalChange).where(eq(journalChange.entryId, step.id));
      expect(Object.keys(change!.after ?? {}).includes("history")).toBe(false);
      expect(await t.run({ type: "journal.undo", entryId: step.id })).toMatchObject({ ok: true });
      expect((await enc()).currentId).toBeNull();
      expect((await enc()).history.length).toBe(stack);
      // TURN BACK still works over the undone step: every step is a whole snapshot.
      expect(await t.run({ type: "turn.back" })).toMatchObject({ ok: true });
    });

    test("undo of a removed current combatant restores it and the encounter's pointer, despite the journal order", async () => {
      const t = await newCampaign();
      const f = await fight(t);
      await t.run({ type: "encounter.begin" }); // a fight opens at Round 0 (rules-flow §11.167)
      // The players pick first (alternating initiative), so the current combatant is the Agent's.
      expect(await t.run({ type: "turn.start", id: f.pc })).toMatchObject({ ok: true });
      const current = async () =>
        (await db.select().from(encounter).where(eq(encounter.campaignId, t.campaignId)))[0]?.currentId;
      expect(await current()).toBe(f.pc);
      await t.run({ type: "combatant.remove", id: f.pc });
      expect(await wounds(f.pc)).toBeUndefined();
      expect(await current()).toBeNull();
      const del = await t.last();
      const order = (
        await db.select().from(journalChange).where(eq(journalChange.entryId, del.id)).orderBy(journalChange.seq)
      ).map((c) => `${c.op}:${c.tbl}`);
      // Measured: the FK's set-null on the encounter is journaled AFTER the delete, so plain reverse order would point
      // current_id at a row not yet back (journal_undo retries a step that hits a foreign key).
      expect(order).toEqual(["D:combatant", "U:encounter"]);
      expect(await t.run({ type: "journal.undo", entryId: del.id })).toMatchObject({ ok: true });
      expect(await wounds(f.pc)).toBe(0);
      expect(await current()).toBe(f.pc);
    });

    test("a deleted Agent can't be undone: the seat and guest QR went with it", async () => {
      const t = await newCampaign();
      const f = await fight(t);
      await t.run({ type: "character.delete", id: f.characterId });
      const del = await t.last();
      expect(await t.run({ type: "journal.undo", entryId: del.id })).toEqual({
        ok: false,
        error: "A deleted Agent can't be undone: their seat and guest QR are gone",
      });
    });

    test("a created Agent with a guest QR since can't be undone", async () => {
      const t = await newCampaign();
      await t.run({ type: "character.create", name: "Brother Seated" });
      const made = await t.last();
      const free = await t.run({ type: "journal.undo", entryId: made.id }); // nothing hangs off it yet
      expect(free).toMatchObject({ ok: true });
      const again = await t.last();
      await t.run({ type: "journal.undo", entryId: again.id }); // redo
      const [c] = await db.select().from(character).where(eq(character.campaignId, t.campaignId));
      await t.run({ type: "token.issue", characterId: c!.id });
      expect(await t.run({ type: "journal.undo", entryId: made.id })).toEqual({
        ok: false,
        error: "That Agent has a player seat or guest QR now; undoing would lock the player out",
      });
    });

    test("an encounter delete cascades its combatants and undoes (raw cascade)", async () => {
      const t = await newCampaign();
      await fight(t);
      const action = Action.parse({ type: "encounter.end" });
      await db.transaction((tx) =>
        journaled(tx, { ctx: t.ctx, action }, async () => {
          await tx.delete(encounter).where(eq(encounter.campaignId, t.campaignId));
        }),
      );
      const e = await t.last();
      const order = (
        await db.select().from(journalChange).where(eq(journalChange.entryId, e.id)).orderBy(journalChange.seq)
      ).map((c) => `${c.op}:${c.tbl}`);
      expect(order[0]).toBe("D:encounter"); // parent first (see the cascading-delete test)
      expect(order.filter((o) => o === "D:combatant").length).toBe(3);
      expect(await t.run({ type: "journal.undo", entryId: e.id })).toMatchObject({ ok: true });
      const rows = await db.select().from(combatant);
      expect(rows.filter((r) => ["A", "B"].includes(r.label ?? "")).length).toBeGreaterThanOrEqual(2);
    });

    test("undo of an undo is a redo", async () => {
      const t = await newCampaign();
      const f = await fight(t);
      await t.run({ type: "combatant.adjust", id: f.a, wounds: 2 });
      const hit = await t.last();
      await t.run({ type: "journal.undo", entryId: hit.id });
      const undo = await t.last();
      expect(undo.undoes).toBe(hit.id);
      expect((await t.entries()).find((x) => x.id === hit.id)?.undoneBy).toBe(undo.id);
      expect(await t.run({ type: "journal.undo", entryId: hit.id })).toEqual({ ok: false, error: "Already undone" });
      expect(await t.run({ type: "journal.undo", entryId: undo.id })).toMatchObject({ ok: true });
      expect(await wounds(f.a)).toBe(2);
      // The hit stands again, so it can be undone once more.
      expect((await t.entries()).find((x) => x.id === hit.id)?.undoneBy).toBeNull();
      expect(await t.run({ type: "journal.undo", entryId: hit.id })).toMatchObject({ ok: true });
      expect(await wounds(f.a)).toBe(0);
    });

    test("undoing a redo marks the original undone again", async () => {
      const t = await newCampaign();
      const f = await fight(t);
      await t.run({ type: "combatant.adjust", id: f.a, wounds: 2 });
      const hit = await t.last();
      await t.run({ type: "journal.undo", entryId: hit.id });
      const undo = await t.last();
      await t.run({ type: "journal.undo", entryId: undo.id });
      const redo = await t.last();
      expect(await t.run({ type: "journal.undo", entryId: redo.id })).toMatchObject({ ok: true });
      expect(await wounds(f.a)).toBe(0);
      const byId = new Map((await t.entries()).map((x) => [x.id, x]));
      expect(byId.get(hit.id)?.undoneBy).toBe(undo.id); // the rows say the hit is undone, and so do the marks
      expect(byId.get(undo.id)?.undoneBy).toBeNull();
      expect(await t.run({ type: "journal.undo", entryId: hit.id })).toEqual({ ok: false, error: "Already undone" });
    });

    test("a no-op leaves no entry; another campaign's entry is not reachable", async () => {
      const t = await newCampaign();
      const other = await newCampaign();
      const f = await fight(t);
      const n = (await t.entries()).length;
      expect(await t.run({ type: "combatant.adjust", id: f.a })).toMatchObject({ ok: true }); // no wounds, no change
      expect((await t.entries()).length).toBe(n);
      await t.run({ type: "combatant.adjust", id: f.a, wounds: 1 });
      const e = await t.last();
      expect(await other.run({ type: "journal.undo", entryId: e.id })).toEqual({ ok: false, error: "Nothing to undo" });
    });

    test("a session end can't be undone", async () => {
      const t = await newCampaign();
      await t.run({ type: "session.start" });
      await t.run({ type: "session.end", xp: 10 });
      const e = await t.last();
      expect(await t.run({ type: "journal.undo", entryId: e.id })).toEqual({
        ok: false,
        error: "A session end can't be undone",
      });
    });

    test("journaled hands back the surviving entry's id, and none for a no-op or a skipped load", async () => {
      const t = await newCampaign();
      const f = await fight(t);
      const hit = await t.run({ type: "combatant.adjust", id: f.a, wounds: 1 });
      expect(hit.ok && hit.entry).toBe((await t.last()).id);
      const noop = await t.run({ type: "combatant.adjust", id: f.a });
      expect(noop.ok && noop.entry).toBeUndefined();
      const n = (await t.entries()).length;
      const seeded = await t.run({ type: "combatant.adjust", id: f.a, wounds: 1 }, { skip: true });
      expect(seeded.ok && seeded.entry).toBeUndefined();
      expect(await wounds(f.a)).toBe(2); // it ran
      expect((await t.entries()).length).toBe(n); // and left no entry
    });

    test("tables come from the database: test_call is journaled, admin_event and codex_image are not", async () => {
      const triggers = await db.execute<{ t: string }>(
        sql`select distinct event_object_table as t from information_schema.triggers where trigger_name = 'zz_journal'`,
      );
      const on = new Set(triggers.rows.map((r) => r.t));
      expect(on.has("test_call")).toBe(true);
      expect(on.has("combatant")).toBe(true);
      for (const off of [
        "admin_event",
        "codex_image",
        "access_token",
        "journal_entry",
        "journal_change",
        "library_character",
      ])
        expect(on.has(off)).toBe(false);
      // A call really is captured and undone.
      const t = await newCampaign();
      const f = await fight(t);
      const call = await t.run({ type: "test.call", test: { kind: "resolve", dn: 3 }, who: [f.characterId] });
      expect(call).toMatchObject({ ok: true });
      const e = await t.last();
      const changes = await db.select().from(journalChange).where(eq(journalChange.entryId, e.id));
      expect(changes.some((c) => c.tbl === "test_call" && c.op === "I")).toBe(true);
    });

    test("a refusal names the entry to undo first, by its label", async () => {
      const t = await newCampaign();
      const f = await fight(t);
      await t.run({ type: "character.adjust", id: f.characterId, wounds: 1 });
      const first = await t.last();
      await t.run({ type: "character.adjust", id: f.characterId, shock: 2 });
      await t.run({ type: "character.adjust", id: f.characterId, wounds: 1 });
      // The blocker is the later entry that wrote the same column (Wounds), not the earlier Shock tap on that row.
      expect(await t.run({ type: "journal.undo", entryId: first.id })).toEqual({
        ok: false,
        error: "Undo \u201cBrother Test: +1 Wounds\u201d first.",
      });
      const [, , third] = (await t.entries()).slice(-3);
      expect(await t.run({ type: "journal.undo", entryId: third!.id })).toMatchObject({ ok: true });
      // The Shock tap is independent: the first undoes under it.
      expect(await t.run({ type: "journal.undo", entryId: first.id })).toMatchObject({ ok: true });
    });

    test("undoing a create refuses when the Agent was added to a fight since, naming that", async () => {
      const t = await newCampaign();
      await t.run({ type: "character.create", name: "Brother Cascade" });
      const made = await t.last();
      const [c] = await db.select().from(character).where(eq(character.campaignId, t.campaignId));
      await t.run({ type: "encounter.start" });
      await t.run({ type: "combatant.addCharacter", characterId: c!.id });
      const r = await t.run({ type: "journal.undo", entryId: made.id });
      expect(r).toEqual({ ok: false, error: "Undo \u201cAdd Brother Cascade to the fight\u201d first." });
      // Refused whole: the Agent and the combatant are both still there.
      expect((await db.select().from(character).where(eq(character.campaignId, t.campaignId))).length).toBe(1);
      expect((await db.select().from(combatant)).filter((x) => x.characterId === c!.id).length).toBe(1);
      // Undo the add, then the create goes (a pure insert undo, no cascade).
      const add = await t.last();
      expect(await t.run({ type: "journal.undo", entryId: add.id })).toMatchObject({ ok: true });
      expect(await t.run({ type: "journal.undo", entryId: made.id })).toMatchObject({ ok: true });
    });

    test("the journal list is newest first, labelled with names, and an undo reads as one", async () => {
      const t = await newCampaign();
      const f = await fight(t);
      await t.run({ type: "combatant.adjust", id: f.a, wounds: 2 });
      const hit = await t.last();
      await t.run({ type: "journal.undo", entryId: hit.id });
      await t.run({ type: "combatant.remove", id: f.b });
      const items = await listJournal(db, { campaignId: t.campaignId, limit: 3 });
      expect(items.map((i) => i.label)).toEqual([
        "Remove B from the fight",
        "Undo \u201cA: +2 Wounds\u201d",
        "A: +2 Wounds",
      ]);
      expect(items[2]!.undoneBy).toBe(items[1]!.id);
      expect(items[1]!.undoes).toBe(hit.id);
      expect(items[0]!.type).toBe("combatant.remove");
      // The removed combatant is gone from the table, but its name comes from the journal's row image.
      expect((await listJournal(db, { campaignId: t.campaignId, limit: 50 })).length).toBeGreaterThanOrEqual(8);
      // Another campaign's journal is not this one's.
      const other = await newCampaign();
      expect((await listJournal(db, { campaignId: other.campaignId, limit: 50 })).length).toBe(0);
    });

    test("the recap draft reads with names: the Threats, who was removed, which item went to whom", async () => {
      const t = await newCampaign();
      await t.run({ type: "session.start" });
      const f = await fight(t);
      await t.run({ type: "combatant.remove", id: f.b });
      await t.run({ type: "encounter.end" });
      await t.run({ type: "codex.save", kind: "item", data: { name: "Relic Bolter" } });
      const [it] = await db.select().from(item).where(eq(item.campaignId, t.campaignId));
      const given = await t.run({ type: "character.giveItem", id: f.characterId, itemId: it!.id });
      expect(given).toMatchObject({ ok: true });
      await t.run({ type: "session.end", xp: 15 });
      const [s] = await db.select().from(session).where(eq(session.campaignId, t.campaignId));
      const { lines } = await sessionRecapDraft(db, { campaignId: t.campaignId, sessionId: s!.id });
      expect(lines).toEqual([
        "Fight 1: A, B.",
        "Removed from the fight: B.",
        "Given out: Relic Bolter to Brother Test.",
        "15 XP awarded.",
      ]);
      // Another campaign's session id finds nothing.
      const other = await newCampaign();
      await assert.rejects(sessionRecapDraft(db, { campaignId: other.campaignId, sessionId: s!.id }));
    });

    test("deleting a game goes through the journal: it succeeds and takes the whole journal with it", async () => {
      const t = await newCampaign();
      await fight(t); // a journal worth cascading away
      expect((await t.entries()).length).toBeGreaterThanOrEqual(1);
      expect(await t.run({ type: "campaign.archive" })).toMatchObject({ ok: true });
      // The trigger would otherwise write change rows for an entry the cascade just deleted, rolling the delete back.
      const gone = await t.run({ type: "campaign.delete", name: "Journal test" });
      expect(gone).toMatchObject({ ok: true });
      expect((gone as { entry?: string }).entry).toBeUndefined(); // nothing to undo into
      expect((await db.select().from(campaign).where(eq(campaign.id, t.campaignId))).length).toBe(0);
      expect((await t.entries()).length).toBe(0);
    });

    // One scripted session, as the weight and latency tests play it. `skip` runs every action unjournaled.
    async function play(t: Awaited<ReturnType<typeof newCampaign>>, skip: boolean) {
      let n = 0;
      const go = async (a: ActionInput) => {
        n++;
        const r = await t.run(a, { skip });
        if (!r.ok) throw new Error(`${a.type} ${JSON.stringify(a)}: ${r.error}`);
        return r as { id?: string };
      };
      const ids: string[] = [];
      for (const name of ["Brother A", "Sister B"]) ids.push((await go({ type: "character.create", name })).id!);
      await go({ type: "session.start" });
      for (let fightNo = 0; fightNo < 3; fightNo++) {
        await go({ type: "encounter.start" });
        const pcs: string[] = [];
        for (const characterId of ids) pcs.push((await go({ type: "combatant.addCharacter", characterId })).id!);
        const foes: string[] = [];
        for (const [i, threatId] of ["ork-nob", "ork-boy", "cultist", "guardian-defender"].entries())
          foes.push((await go({ type: "combatant.addThreat", threatId, label: `Foe ${i}` })).id!);
        await go({ type: "encounter.begin" }); // Round 0 → Round 1 (rules-flow §11.167)
        for (let round = 0; round < 4; round++) {
          // Sides alternate (p.177): Agent, Threat, Agent, Threat, then the last two Threats back to back.
          for (const [k, who] of [pcs[0]!, foes[0]!, pcs[1]!, foes[1]!, foes[2]!, foes[3]!].entries()) {
            await go({ type: "turn.start", id: who });
            if (k % 2 === 0) await go({ type: "combatant.adjust", id: foes[k / 2]!, wounds: 1 });
            else await go({ type: "combatant.update", id: who, conditions: round % 2 ? ["Prone"] : [] });
            await go({ type: "turn.end" });
          }
          await go({ type: "pool.adjust", pool: "glory", delta: 1 });
          await go({ type: "encounter.newRound" });
        }
        await go({ type: "encounter.end" });
      }
      for (let i = 0; i < 5; i++)
        await go({ type: "codex.save", kind: "faction", data: { name: `Faction ${i}`, notes: "x".repeat(300) } });
      await go({ type: "session.end", xp: 20, recap: "A short recap." });
      return n;
    }

    test("weight of a realistic session, and what the trigger costs per action", { timeout: 120_000 }, async () => {
      const t = await newCampaign();
      const t0 = performance.now();
      const n = await play(t, false);
      const withTrigger = (performance.now() - t0) / n;

      // Baseline: the same session in a fresh campaign, unjournaled and with the triggers dropped.
      const tables = (
        await db.execute<{ t: string }>(
          sql`select distinct event_object_table as t from information_schema.triggers where trigger_name = 'zz_journal'`,
        )
      ).rows.map((r) => r.t);
      for (const tbl of tables) await db.execute(sql.raw(`DROP TRIGGER zz_journal ON "${tbl}"`));
      const bare = await newCampaign();
      const t1 = performance.now();
      await play(bare, true);
      const without = (performance.now() - t1) / n;
      await installJournal();
      console.log(
        `journal latency: ${withTrigger.toFixed(2)} ms/action journaled vs ${without.toFixed(2)} ms/action without ` +
          `(+${(withTrigger - without).toFixed(2)} ms, ${n} actions each)`,
      );

      const res = await db.execute<{ entries: number; changes: number; e: number; c: number; payload: number }>(sql`
      select (select count(*)::int from journal_entry where campaign_id = ${t.campaignId}) as entries,
             (select count(*)::int from journal_change c join journal_entry e on e.id = c.entry_id where e.campaign_id = ${t.campaignId}) as changes,
             pg_total_relation_size('journal_entry')::int as e, pg_total_relation_size('journal_change')::int as c,
             (select coalesce(sum(pg_column_size(c.*)),0)::int from journal_change c join journal_entry e on e.id = c.entry_id where e.campaign_id = ${t.campaignId})
             + (select coalesce(sum(pg_column_size(e.*)),0)::int from journal_entry e where e.campaign_id = ${t.campaignId}) as payload`);
      const r = res.rows[0]!;
      console.log(
        `journal weight: ${n} actions -> ${r.entries} entries, ${r.changes} row changes; row bytes ${r.payload} ` +
          `(${Math.round(r.payload / r.entries)} B/entry); relation sizes (all campaigns, with indexes): entry ${r.e} + change ${r.c}`,
      );
    });
  });
