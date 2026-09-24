// End-to-end check against a running api (bun run dev:api) + postgres (bun run dev:db). The api must run with
// CLERK_TEST_SECRET set (apps/api/.env, dev only), so these tests can act as signed-in Clerk users.
import { test } from "node:test";
import assert from "node:assert/strict";
import { io } from "socket.io-client";
import { testSessionToken } from "@wg/auth/api";
import {
  deriveStats,
  poolMax,
  type ActionInput,
  type ActionResult,
  type Codex,
  type LiveState,
  type ThreatCombatant,
} from "@wg/shared";

const API = process.env.API_URL ?? `http://localhost:${process.env.PORT ?? 4000}`;

// A test-only Clerk session token (packages/auth/src/api.ts) and the headers that carry one.
const clerk = (userId: string, role: "creator" | "member" = "member") =>
  testSessionToken({ secret: process.env.CLERK_TEST_SECRET ?? "", userId, role });
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
const get = (path: string, headers: Record<string, string> = {}) => fetch(`${API}/api${path}`, { headers });

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${API}/api${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

// A socket as a GM or player: `auth` carries campaignId plus a Clerk test token, a guest token or the admin key;
// `headers` can carry a guest cookie instead.
function connect({ auth, headers }: { auth: Record<string, string>; headers?: Record<string, string> }) {
  const socket = io(API, { auth, extraHeaders: headers, transports: ["websocket"], reconnection: false });
  let latest: LiveState | null = null;
  let codex: Codex | null = null;
  socket.on("codex", (c: Codex) => (codex = c));
  const waiters: Array<[(s: LiveState) => boolean, (s: LiveState) => void]> = [];
  socket.on("state", (s: LiveState) => {
    latest = s;
    for (const w of waiters.splice(0)) {
      if (w[0](s)) w[1](s);
      else waiters.push(w);
    }
  });
  return {
    socket,
    send: (a: ActionInput) => socket.emitWithAck("action", a) as Promise<ActionResult>,
    codex: () => codex,
    // Resolves on the first state (current or future) matching the predicate.
    until: (pred: (s: LiveState) => boolean) =>
      new Promise<LiveState>((resolve, reject) => {
        if (latest && pred(latest)) return resolve(latest);
        waiters.push([pred, resolve]);
        setTimeout(() => reject(new Error(`timed out waiting for: ${pred}`)), 3000);
      }),
  };
}

// Polls until check() holds, for the codex snapshot (which has no `until`).
async function eventually(check: () => boolean, what: string) {
  for (let i = 0; i < 30; i++) {
    if (check()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`timed out waiting for: ${what}`);
}

// A new campaign created by a signed-in creator, and that GM's socket.
async function newCampaign(name: string, tier: number) {
  const gmClerk = clerk(`gm-${name}`, "creator");
  const res = await post("/campaigns", { name, tier }, bearer(gmClerk));
  const { campaignId } = (await res.json()) as { campaignId: string };
  const gm = connect({ auth: { campaignId, clerkToken: gmClerk } });
  await gm.until((s) => s.campaign.name === name);
  return { ...gm, campaignId, gmClerk };
}

const threatOf = (s: LiveState) => s.encounter?.combatants.find((c): c is ThreatCombatant => c.kind === "threat");

test("GM and player share a table", async (t) => {
  const gmClerk = clerk("gm-smoke", "creator");
  assert.equal(
    (await post("/campaigns", { name: "Smoke", tier: 2 })).status,
    401,
    "creating a game needs a signed-in user",
  );
  assert.equal(
    (await post("/campaigns", { name: "Smoke", tier: 2 }, bearer(clerk("not-a-creator")))).status,
    403,
    "and the creator role",
  );
  const created = await post("/campaigns", { name: "Smoke", tier: 2 }, bearer(gmClerk));
  assert.equal(created.status, 201);
  const { campaignId } = (await created.json()) as { campaignId: string };
  assert.equal((await post("/join", { token: "nope" })).status, 401);

  const gm = connect({ auth: { campaignId, clerkToken: gmClerk } });
  t.after(() => gm.socket.close());
  await gm.until((s) => s.campaign.name === "Smoke");

  const hero = await gm.send({ type: "character.create", name: "Hero" });
  const other = await gm.send({ type: "character.create", name: "Other" });
  assert.ok(hero.ok && hero.id && other.ok && other.id);
  const issued = await gm.send({ type: "token.issue", characterId: hero.id });
  assert.ok(issued.ok && issued.token);

  const join = await post("/join", { token: issued.token });
  assert.equal(join.status, 200);
  assert.match(join.headers.get("set-cookie") ?? "", /wg_token=.*HttpOnly/i);
  assert.equal(
    ((await join.json()) as { campaignId: string }).campaignId,
    campaignId,
    "a guest QR opens its own table",
  );

  const player = connect({ auth: { token: issued.token } });
  t.after(() => player.socket.close());
  await player.until((s) => s.characters.length === 2);

  // Threat at Tier 2 -> Ork Boy is a Troop; stats hidden from players until revealed.
  assert.ok((await gm.send({ type: "encounter.start" })).ok);
  const ork = await gm.send({ type: "combatant.addThreat", threatId: "ork-boy", mobCount: 10 });
  assert.ok(ork.ok && ork.id);
  const gmView = threatOf(await gm.until((s) => !!threatOf(s)))!;
  assert.equal(gmView.threatClass, "T");
  assert.equal(gmView.stats?.name, "Ork Boy");
  const hidden = threatOf(await player.until((s) => !!threatOf(s)))!;
  assert.equal(hidden.stats, null);
  assert.equal(hidden.maxWounds, 6);

  await gm.send({ type: "combatant.adjust", id: ork.id, wounds: 2 });
  await player.until((s) => threatOf(s)?.mobCount === 8); // Mob members have 1 Wound each (p.325)
  await gm.send({ type: "combatant.update", id: ork.id, revealed: true });
  await player.until((s) => threatOf(s)?.stats?.name === "Ork Boy");

  // Player permissions.
  assert.ok((await player.send({ type: "character.adjust", id: hero.id, wounds: 3 })).ok);
  await gm.until((s) => s.characters.find((c) => c.id === hero.id)?.wounds === 3);
  assert.ok((await player.send({ type: "character.adjust", id: hero.id, wounds: -10 })).ok, "clamped, not rejected");
  await gm.until((s) => s.characters.find((c) => c.id === hero.id)?.wounds === 0);
  assert.ok((await player.send({ type: "pool.adjust", pool: "glory", delta: 1 })).ok);
  assert.deepEqual(await player.send({ type: "pool.adjust", pool: "ruin", delta: 1 }), { ok: false, error: "GM only" });
  assert.deepEqual(await player.send({ type: "combatant.remove", id: ork.id }), { ok: false, error: "GM only" });
  assert.deepEqual(await player.send({ type: "character.adjust", id: other.id, wounds: 1 }), {
    ok: false,
    error: "Not your character",
  });
  // Supply (p.206, p.229): the player spends their own Wealth and Ammo, per type.
  assert.ok(
    (await player.send({ type: "character.supply", id: hero.id, wealth: 2, ammo: { kind: "Bolt", delta: 3 } })).ok,
  );
  await player.send({ type: "character.supply", id: hero.id, wealth: -5, ammo: { kind: "Bolt", delta: -1 } });
  await gm.until((s) => {
    const st = s.characters.find((c) => c.id === hero.id)?.stats;
    return st?.wealth === 0 && st.ammo.Bolt === 2;
  });
  assert.deepEqual(await player.send({ type: "character.supply", id: other.id, wealth: 1 }), {
    ok: false,
    error: "Not your character",
  });
  assert.equal((await player.send({ type: "nope" } as never)).ok, false, "invalid payloads are rejected");

  // Alternating turns: Agent, then Threat. Seize: the side that just acted pays 1 Glory to go again, once.
  const heroC = await gm.send({ type: "combatant.addCharacter", characterId: hero.id });
  const otherC = await gm.send({ type: "combatant.addCharacter", characterId: other.id });
  assert.ok(heroC.ok && heroC.id && otherC.ok && otherC.id);
  assert.deepEqual(await gm.send({ type: "turn.start", id: ork.id }), {
    ok: false,
    error: "It's the Agents' turn; Seize to go out of order",
  });
  assert.ok((await gm.send({ type: "turn.start", id: heroC.id })).ok);
  assert.deepEqual(await gm.send({ type: "turn.start", id: ork.id }), {
    ok: false,
    error: "End the current turn first",
  });
  assert.ok((await gm.send({ type: "turn.end" })).ok);
  assert.deepEqual(await gm.send({ type: "turn.start", id: heroC.id }), {
    ok: false,
    error: "Already acted this round",
  });
  assert.deepEqual(await gm.send({ type: "turn.start", id: otherC.id }), {
    ok: false,
    error: "It's the Threats' turn; Seize to go out of order",
  });
  assert.deepEqual(await gm.send({ type: "turn.seize", id: ork.id }), {
    ok: false,
    error: "No need to Seize: the Threats act next anyway",
  });
  const before = (await gm.until((s) => s.encounter?.lastSide === "agents")).campaign.glory;
  assert.ok((await gm.send({ type: "turn.seize", id: otherC.id })).ok);
  await gm.until((s) => s.campaign.glory === before - 1 && s.encounter?.currentId === otherC.id);
  await gm.send({ type: "turn.end" });
  await gm.send({ type: "turn.start", id: ork.id });
  await gm.send({ type: "turn.end" });
  await gm.until(
    (s) => s.encounter?.round === 2 && s.encounter.combatants.every((c) => !c.acted) && s.encounter.lastSide === null,
  );

  // Round start: only the GM can Seize (1 Ruin) to let a Threat go first; not twice in a row.
  await gm.send({ type: "pool.adjust", pool: "ruin", delta: 3 });
  assert.ok((await gm.send({ type: "turn.seize", id: ork.id })).ok, "GM seizes the first turn");
  await gm.send({ type: "turn.end" });

  // Mobs: every member has 1 Wound, so damage removes members (p.325).
  await gm.send({ type: "combatant.adjust", id: ork.id, wounds: 4 });
  await gm.until((s) => threatOf(s)?.mobCount === 4 && threatOf(s)?.mobStart === 10);
  await gm.send({ type: "combatant.adjust", id: ork.id, wounds: -20 });
  await gm.until((s) => threatOf(s)?.mobCount === 10);

  // Ambush: a fresh encounter; an ambushed Agent can't act in Round 1 unless the party pays 1 Glory.
  await gm.send({ type: "encounter.start" });
  const amb = await gm.send({ type: "combatant.addCharacter", characterId: hero.id });
  assert.ok(amb.ok && amb.id);
  await gm.send({ type: "combatant.update", id: amb.id, ambushed: true });
  assert.equal((await gm.send({ type: "turn.start", id: amb.id })).ok, false);
  await gm.send({ type: "pool.adjust", pool: "glory", delta: 1 });
  assert.ok((await gm.send({ type: "combatant.aware", id: amb.id })).ok);
  assert.ok((await gm.send({ type: "turn.start", id: amb.id })).ok);

  // Session start resets pools (p.162); session end awards XP (p.321).
  assert.ok((await gm.send({ type: "session.start" })).ok);
  await gm.until((s) => s.campaign.glory === 0 && s.campaign.ruin === 2 && s.characters.every((c) => c.wrath === 2));

  // Requisition (pp.205-206, p.229): GM only, a Keyword in common, one Wargear and one Ammo Test per session.
  const rq = {
    type: "character.requisition" as const,
    id: hero.id!,
    value: 2,
    rarity: "Common" as const,
    keywords: ["[ANY]"],
    icons: 2,
  };
  assert.deepEqual(await player.send({ ...rq, kind: "wargear", item: "Laspistol" }), { ok: false, error: "GM only" });
  assert.deepEqual(await gm.send({ ...rq, kind: "ammo", item: "Bolt", keywords: ["AELDARI"] }), {
    ok: false,
    error: "No Keyword in common with the item: it can't be requisitioned (p.205)",
  });
  assert.ok(
    (await gm.send({ ...rq, kind: "wargear", item: "Laspistol", loadedWith: "Las", wargearId: "laspistol" })).ok,
  );
  assert.deepEqual(await gm.send({ ...rq, kind: "wargear", item: "Chainsword" }), {
    ok: false,
    error: "Hero already made this session's wargear Test (p.205)",
  });
  assert.ok(
    (
      await gm.send({
        ...rq,
        kind: "grenade",
        item: "Frag Grenade",
        rarity: "Uncommon",
        icons: 3,
        wargearId: "frag-grenade",
      })
    ).ok,
  );
  // Catalogue weapons join the armament with their printed profile; a thrown range is S × 4 (p.207; Hero has S 1).
  await gm.until((s) => {
    const st = s.characters.find((c) => c.id === hero.id)?.stats;
    const has = (name: string) => st?.weapons.find((w) => w.name === name);
    return (
      has("Laspistol")?.range.length === 3 &&
      has("Frag Grenade")?.range[0] === 4 &&
      st?.ammo.Las === 1 &&
      st.ammo["Frag Grenade"] === 4
    );
  });
  assert.ok((await gm.send({ type: "session.end", xp: 10, recap: "Boyz krumped." })).ok);
  await gm.until((s) => s.characters.every((c) => c.xp === 10));

  // Codex: players only see revealed entries, without GM notes.
  const secret = await gm.send({
    type: "codex.save",
    kind: "npc",
    data: { name: "Magos Vex", gmNotes: "wants the tomb", revealed: false },
  });
  const known = await gm.send({
    type: "codex.save",
    kind: "npc",
    data: { name: "Inquisitor Hale", gmNotes: "patron", revealed: true },
  });
  const orders = await gm.send({
    type: "codex.save",
    kind: "handout",
    data: { title: "Orders", body: "Kill the Orks.", revealed: true },
  });
  assert.ok(secret.ok && known.ok && orders.ok, "handouts can be created already revealed");
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(gm.codex()?.npcs.length, 2);
  assert.deepEqual(
    player.codex()?.npcs.map((n) => [n.name, n.gmNotes]),
    [["Inquisitor Hale", ""]],
  );

  // Pools are capped: Glory max(6, players + 2), Ruin 2 × players.
  await gm.send({ type: "pool.adjust", pool: "glory", delta: 100 });
  await gm.send({ type: "pool.adjust", pool: "ruin", delta: 100 });
  await gm.until((s) => s.campaign.glory === poolMax("glory", 2) && s.campaign.ruin === poolMax("ruin", 2));

  // The bestiary endpoint is GM-only.
  assert.equal((await get(`/campaigns/${campaignId}/threats`, bearer(gmClerk))).status, 200);
  assert.equal((await get(`/campaigns/${campaignId}/threats`, { cookie: `wg_token=${issued.token}` })).status, 403);
  assert.equal(
    (await get(`/campaigns/${campaignId}/threats`, bearer(clerk("stranger")))).status,
    401,
    "not seated here",
  );
  // The Wargear catalogue is book text too: GM only.
  const catalogue = await get(`/campaigns/${campaignId}/wargear`, bearer(gmClerk));
  assert.ok(catalogue.status === 200 && ((await catalogue.json()) as unknown[]).length > 100);
  assert.equal((await get(`/campaigns/${campaignId}/wargear`, { cookie: `wg_token=${issued.token}` })).status, 403);

  // Scripts (seed) open a table with the admin key.
  const admin = connect({ auth: { campaignId, adminKey: process.env.ADMIN_KEY! } });
  t.after(() => admin.socket.close());
  await admin.until((s) => s.campaign.name === "Smoke");

  // Revoking kicks the player's socket and kills the link.
  const kicked = new Promise((r) => player.socket.on("disconnect", r));
  assert.ok((await gm.send({ type: "token.revoke", characterId: hero.id })).ok);
  await kicked;
  assert.equal((await post("/join", { token: issued.token })).status, 401);
});

test("a malformed login cookie is refused, not fatal", async () => {
  const bad = { cookie: "wg_token=%; __session=%" }; // decodeURIComponent throws on these
  assert.equal((await get("/guest", bad)).status, 401);
  assert.equal((await get("/lobby", bad)).status, 401);
  const socket = io(API, { transports: ["websocket"], reconnection: false, extraHeaders: bad });
  const err = await new Promise<Error>((resolve) => socket.once("connect_error", resolve));
  socket.close();
  assert.equal(err.message, "unauthorized");
  assert.equal((await get("/guest")).status, 401, "api still up");
});

test("rules edge cases: Dying, out of the fight, Seize, Mobs, codex references, redaction", async (t) => {
  const gm = await newCampaign("Edge", 2);
  const other = await newCampaign("Elsewhere", 2);
  t.after(() => (gm.socket.close(), other.socket.close()));
  const charOf = (s: LiveState, id: string) => s.characters.find((c) => c.id === id)!;

  assert.ok((await gm.send({ type: "campaign.update", framework: "Deathwatch", patron: "Ordo Xenos" })).ok);
  await gm.until((s) => s.campaign.framework === "Deathwatch" && s.campaign.patron === "Ordo Xenos");

  const hero = await gm.send({ type: "character.create", name: "Hero" });
  const b = await gm.send({ type: "character.create", name: "B" });
  const c = await gm.send({ type: "character.create", name: "C" });
  const gone = await gm.send({ type: "character.create", name: "Gone" });
  assert.ok(hero.ok && hero.id && b.ok && b.id && c.ok && c.id && gone.ok && gone.id);
  assert.ok((await gm.send({ type: "character.update", id: b.id, name: "Brother B" })).ok);
  assert.ok((await gm.send({ type: "character.delete", id: gone.id })).ok);
  const s0 = await gm.until((s) => s.characters.length === 3 && charOf(s, b.id!)?.name === "Brother B");
  const d = deriveStats({ stats: charOf(s0, hero.id).stats, overrides: {}, tier: 2 });

  // Dying (p.193): over max Wounds falls Prone; a Wound while Dying is a Traumatic Injury; any healing ends Dying.
  await gm.send({ type: "character.adjust", id: hero.id, wounds: d.maxWounds + 1 });
  await gm.until(
    (s) => charOf(s, hero.id!).wounds === d.maxWounds + 1 && charOf(s, hero.id!).conditions.includes("Prone"),
  );
  await gm.send({ type: "character.adjust", id: hero.id, wounds: 3 });
  await gm.until((s) => charOf(s, hero.id!).traumatic === 1 && charOf(s, hero.id!).wounds === d.maxWounds + 1);
  assert.deepEqual(await gm.send({ type: "character.respite", id: hero.id }), {
    ok: false,
    error: "A Dying character can't benefit from a Respite (p.197)",
  });
  await gm.send({ type: "character.adjust", id: hero.id, wounds: -1 });
  await gm.until((s) => charOf(s, hero.id!).wounds === d.maxWounds);
  // More Traumatic Injuries than Tier + 1: Dead.
  await gm.send({ type: "character.adjust", id: hero.id, traumatic: d.maxTraumatic });
  await gm.until((s) => charOf(s, hero.id!).traumatic === d.maxTraumatic + 1);
  assert.deepEqual(await gm.send({ type: "character.respite", id: hero.id }), {
    ok: false,
    error: "A Dead character can't Respite (p.193)",
  });
  assert.ok((await gm.send({ type: "character.respite", id: c.id })).ok);

  // Out of the fight: a Dead Agent and a Slain Troop take no Turns and don't hold up the Round.
  await gm.send({ type: "encounter.start" });
  const heroC = await gm.send({ type: "combatant.addCharacter", characterId: hero.id });
  const bC = await gm.send({ type: "combatant.addCharacter", characterId: b.id });
  const cC = await gm.send({ type: "combatant.addCharacter", characterId: c.id });
  assert.deepEqual(await gm.send({ type: "combatant.addCharacter", characterId: b.id }), {
    ok: false,
    error: "Already in this encounter",
  });
  const ork = await gm.send({ type: "combatant.addThreat", threatId: "ork-boy" });
  assert.ok(heroC.ok && heroC.id && bC.ok && bC.id && cC.ok && cC.id && ork.ok && ork.id);
  assert.deepEqual(await gm.send({ type: "turn.start", id: heroC.id }), {
    ok: false,
    error: "Dead: no more Turns (p.193)",
  });
  await gm.send({ type: "combatant.adjust", id: ork.id, wounds: 50 });
  assert.deepEqual(await gm.send({ type: "turn.start", id: ork.id }), {
    ok: false,
    error: "Slain: no more Turns (p.324)",
  });
  assert.ok((await gm.send({ type: "turn.start", id: bC.id })).ok);
  assert.ok((await gm.send({ type: "turn.end" })).ok);
  assert.deepEqual(await gm.send({ type: "turn.seize", id: cC.id }), {
    ok: false,
    error: "No need to Seize: the Agents act next anyway",
  });
  assert.ok((await gm.send({ type: "turn.start", id: cC.id })).ok);
  assert.ok((await gm.send({ type: "turn.end" })).ok);
  await gm.until((s) => s.encounter?.round === 2);
  assert.ok((await gm.send({ type: "encounter.newRound" })).ok);
  await gm.until((s) => s.encounter?.round === 3);
  assert.ok((await gm.send({ type: "combatant.remove", id: ork.id })).ok);

  // Mobs (p.325): sizing a Mob by hand sets its starting size; more Shock in one hit than max Shock removes one member.
  const mob = await gm.send({ type: "combatant.addThreat", threatId: "ork-boy" });
  assert.ok(mob.ok && mob.id);
  await gm.send({ type: "combatant.update", id: mob.id, mobCount: 6 });
  const m0 = threatOf(await gm.until((s) => threatOf(s)?.mobStart === 6))!;
  await gm.send({ type: "combatant.adjust", id: mob.id, shock: m0.maxShock! + 1 });
  await gm.until((s) => threatOf(s)?.mobCount === 5);
  await gm.send({ type: "combatant.adjust", id: mob.id, shock: 1 });
  await gm.send({ type: "combatant.adjust", id: mob.id, wounds: 1 });
  await gm.until((s) => threatOf(s)?.mobCount === 4 && threatOf(s)?.shock === 0);

  // Players never get the threat id or personal Ruin of an unrevealed Threat.
  const issued = await gm.send({ type: "token.issue", characterId: b.id });
  assert.ok(issued.ok && issued.token);
  const player = connect({ auth: { token: issued.token } });
  t.after(() => player.socket.close());
  const seen = threatOf(await player.until((s) => !!threatOf(s)))!;
  assert.deepEqual([seen.threatId, seen.personalRuin, seen.stats], ["", 0, null]);
  assert.ok((await gm.send({ type: "encounter.end" })).ok);
  await gm.until((s) => s.encounter === null);

  // Codex references must stay inside the campaign; deleting an NPC clears it from beats.
  const foreign = await other.send({ type: "codex.save", kind: "faction", data: { name: "Not yours" } });
  const faction = await gm.send({ type: "codex.save", kind: "faction", data: { name: "Mechanicus" } });
  assert.ok(foreign.ok && foreign.id && faction.ok && faction.id);
  assert.deepEqual(await gm.send({ type: "codex.save", kind: "npc", data: { name: "Spy", factionId: foreign.id } }), {
    ok: false,
    error: "Faction not found",
  });
  const vex = await gm.send({
    type: "codex.save",
    kind: "npc",
    data: { name: "Magos Vex", factionId: faction.id, revealed: true },
  });
  const adv = await gm.send({ type: "codex.save", kind: "adventure", data: { title: "Volkus" } });
  assert.ok(vex.ok && vex.id && adv.ok && adv.id);
  assert.deepEqual(
    await gm.send({
      type: "codex.save",
      kind: "beat",
      data: { adventureId: adv.id, title: "Bad", encounter: [{ threatId: "nope" }] },
    }),
    { ok: false, error: 'Unknown threat "nope"' },
  );
  const b1 = await gm.send({
    type: "codex.save",
    kind: "beat",
    data: { adventureId: adv.id, title: "Meet Vex", npcIds: [vex.id] },
  });
  const b2 = await gm.send({
    type: "codex.save",
    kind: "beat",
    data: { adventureId: adv.id, title: "Ambush", encounter: [{ threatId: "ork-boy", count: 2 }] },
  });
  assert.ok(b1.ok && b1.id && b2.ok && b2.id);
  assert.ok((await gm.send({ type: "beat.reorder", adventureId: adv.id, ids: [b2.id, b1.id] })).ok);
  await eventually(() => gm.codex()?.adventures[0]?.beats[0]?.id === b2.id, "beats reordered");
  await eventually(() => player.codex()?.npcs[0]?.factionId === null, "players don't get hidden faction ids");
  assert.ok((await gm.send({ type: "codex.delete", kind: "npc", id: vex.id })).ok);
  await eventually(
    () => gm.codex()?.adventures[0]?.beats.find((x) => x.id === b1.id)?.npcIds.length === 0,
    "deleted NPC cleared from beats",
  );

  // A prepared beat starts an encounter with the party and its threats.
  assert.ok((await gm.send({ type: "beat.startEncounter", id: b2.id })).ok);
  await gm.until(
    (s) =>
      s.encounter?.combatants.filter((x) => x.kind === "threat").length === 2 &&
      s.encounter.combatants.filter((x) => x.kind === "pc").length === 3,
  );
});

test("rule gaps: Exhausted Shock, Annihilation, timed Conditions, raw undo (pp.194, 199-200)", async (t) => {
  const gm = await newCampaign("Gaps", 3);
  t.after(() => gm.socket.close());
  const hero = await gm.send({ type: "character.create", name: "Hero" });
  assert.ok(hero.ok && hero.id);
  const charOf = (s: LiveState) => s.characters.find((c) => c.id === hero.id)!;
  const d = deriveStats({
    stats: charOf(await gm.until((s) => s.characters.length === 1)).stats,
    overrides: {},
    tier: 3,
  });

  // Exhausted (p.199): the Shock that Exhausts stays Shock; any after it is Mortal Wounds.
  await gm.send({ type: "character.adjust", id: hero.id, shock: d.maxShock + 1 });
  await gm.send({ type: "character.adjust", id: hero.id, shock: 2 });
  await gm.until((s) => charOf(s).shock === d.maxShock + 1 && charOf(s).wounds === 2);
  // The tracker's undo skips the rules; players can't send it, nor take back an Annihilation.
  await gm.send({ type: "character.adjust", id: hero.id, wounds: -2, shock: -(d.maxShock + 1), raw: true });
  await gm.until((s) => charOf(s).shock === 0 && charOf(s).wounds === 0);
  const issued = await gm.send({ type: "token.issue", characterId: hero.id });
  assert.ok(issued.ok && issued.token);
  const player = connect({ auth: { token: issued.token } });
  t.after(() => player.socket.close());
  assert.deepEqual(await player.send({ type: "character.adjust", id: hero.id, shock: 1, raw: true }), {
    ok: false,
    error: "GM only",
  });
  assert.deepEqual(await player.send({ type: "character.update", id: hero.id, annihilated: false }), {
    ok: false,
    error: "GM only",
  });

  // Annihilation (p.194): one hit over double Max Wounds; the GM can restore a mistyped one.
  await gm.send({ type: "character.adjust", id: hero.id, wounds: 2 * d.maxWounds + 1 });
  await gm.until((s) => charOf(s).annihilated && charOf(s).wounds === 0);
  assert.ok((await gm.send({ type: "character.update", id: hero.id, annihilated: false })).ok);
  await gm.until((s) => !charOf(s).annihilated);

  // Timed Conditions (§11.8): held at the start of the Turn → gone at its end; gained during it → kept.
  await gm.send({ type: "encounter.start" });
  const heroC = await gm.send({ type: "combatant.addCharacter", characterId: hero.id });
  const wraith = await gm.send({ type: "combatant.addThreat", threatId: "canoptek-wraith" }); // Elite at Tier 3
  assert.ok(heroC.ok && heroC.id && wraith.ok && wraith.id);
  await gm.send({ type: "character.update", id: hero.id, conditions: ["Vulnerable (2)", "Prone"] });
  assert.ok((await gm.send({ type: "turn.start", id: heroC.id })).ok);
  await gm.send({ type: "character.update", id: hero.id, conditions: ["Vulnerable (2)", "Prone", "Hindered"] });
  assert.ok((await gm.send({ type: "turn.end" })).ok);
  await gm.until((s) => charOf(s).conditions.join() === "Prone,Hindered");
  await gm.send({ type: "combatant.update", id: wraith.id, conditions: ["Staggered"] });
  assert.ok((await gm.send({ type: "turn.start", id: wraith.id })).ok);
  assert.ok((await gm.send({ type: "turn.end" })).ok);
  await gm.until((s) => threatOf(s)?.conditions.length === 0);

  // A single Threat Exhausted is hit by Mortal Wounds too.
  const w0 = threatOf(await gm.until((s) => !!threatOf(s)))!;
  await gm.send({ type: "combatant.adjust", id: wraith.id, shock: w0.maxShock! + 1 });
  await gm.send({ type: "combatant.adjust", id: wraith.id, shock: 1 });
  await gm.until((s) => threatOf(s)?.shock === w0.maxShock! + 1 && threatOf(s)?.wounds === 1);
});

test("accounts: lobby, room and character invites, guests, removing a member", async (t) => {
  const gm = await newCampaign("Invites", 2);
  t.after(() => gm.socket.close());
  const cid = gm.campaignId;
  const ana = clerk("ana"),
    bob = clerk("bob"),
    cat = clerk("cat"),
    zed = clerk("zed");
  const pre = await gm.send({ type: "character.create", name: "Pregen" });
  const spare = await gm.send({ type: "character.create", name: "Spare" });
  assert.ok(pre.ok && pre.id && spare.ok && spare.id);

  // Room QR: signed-in players claim an open agent; guests may too.
  const room = await gm.send({ type: "invite.create", mode: "room" });
  assert.ok(room.ok && room.token);
  const preview = (await (await get(`/invites/${room.token}`)).json()) as {
    mode: string;
    openCharacters: { id: string }[];
    signedIn: boolean;
  };
  assert.deepEqual([preview.mode, preview.openCharacters.length, preview.signedIn], ["room", 2, false]);
  assert.equal(
    (await post(`/invites/${room.token}/accept`, { characterId: pre.id })).status,
    400,
    "signed out and not a guest",
  );
  const accepted = await post(`/invites/${room.token}/accept`, { characterId: pre.id }, bearer(ana));
  assert.equal(accepted.status, 200);
  assert.equal(((await accepted.json()) as { campaignId: string }).campaignId, cid);
  const taken = await post(`/invites/${room.token}/accept`, { characterId: pre.id }, bearer(bob));
  assert.match(((await taken.json()) as { message: string }).message, /already taken/);
  const guest = await post(`/invites/${room.token}/accept`, { newCharacterName: "Guesty", asGuest: true });
  assert.equal(guest.status, 200);
  const guestCookie = (guest.headers.get("set-cookie") ?? "").split(";")[0]!;
  assert.match(guestCookie, /^wg_token=/);
  await gm.until(
    (s) =>
      s.access.members.some((m) => m.userId === "ana" && m.characterId === pre.id) &&
      s.characters.some((c) => c.name === "Guesty"),
  );

  // A member plays only their own character; a guest's cookie opens the same table.
  const anaSock = connect({ auth: { campaignId: cid, clerkToken: ana } });
  const guestSock = connect({ auth: { campaignId: cid }, headers: { cookie: guestCookie } });
  t.after(() => (anaSock.socket.close(), guestSock.socket.close()));
  const seen = await anaSock.until((s) => s.characters.length === 3);
  assert.deepEqual(seen.access.invites, [], "players never see invite links");
  assert.ok((await anaSock.send({ type: "character.adjust", id: pre.id, wrath: 1 })).ok);
  assert.deepEqual(await anaSock.send({ type: "character.adjust", id: spare.id, wrath: 1 }), {
    ok: false,
    error: "Not your character",
  });
  assert.deepEqual(await anaSock.send({ type: "invite.create", mode: "room" }), { ok: false, error: "GM only" });
  await guestSock.until((s) => s.characters.length === 3);

  // Character invite: one seat, used once; accounts-only when the GM says so.
  const one = await gm.send({ type: "invite.create", mode: "character", characterId: spare.id, allowGuests: false });
  assert.ok(one.ok && one.token && one.id);
  assert.match(
    ((await (await post(`/invites/${one.token}/accept`, { asGuest: true })).json()) as { message: string }).message,
    /needs an account/,
  );
  assert.equal((await post(`/invites/${one.token}/accept`, {}, bearer(bob))).status, 200);
  assert.equal((await post(`/invites/${one.token}/accept`, {}, bearer(cat))).status, 400, "used up");
  assert.deepEqual(await gm.send({ type: "invite.create", mode: "character" }), {
    ok: false,
    error: "Pick a character to invite",
  });

  // Lobby: members see their seat; anyone signed in sees a running game as a card only.
  await gm.send({ type: "session.start" });
  const lobbyOf = async (token: string) =>
    (await (await get("/lobby", bearer(token))).json()) as {
      canCreate: boolean;
      mine: { id: string; role: string }[];
      running: { id: string; role: string | null }[];
    };
  const anaLobby = await lobbyOf(ana);
  assert.deepEqual([anaLobby.canCreate, anaLobby.mine.find((g) => g.id === cid)?.role], [false, "player"]);
  const zedLobby = await lobbyOf(zed);
  assert.deepEqual([zedLobby.mine.length, zedLobby.running.find((g) => g.id === cid)?.role], [0, null]);
  assert.equal((await get(`/campaigns/${cid}/me`, bearer(zed))).status, 401, "a card, not a seat");
  assert.equal((await get("/lobby")).status, 401);

  // Revoking an invite ends the link; removing a member ends the seat and disconnects them.
  assert.ok((await gm.send({ type: "invite.revoke", id: room.id! })).ok);
  assert.equal((await get(`/invites/${room.token}`)).status, 400);
  const kicked = new Promise((r) => anaSock.socket.on("disconnect", r));
  assert.ok((await gm.send({ type: "member.remove", userId: "ana" })).ok);
  await kicked;
  assert.equal((await get(`/campaigns/${cid}/me`, bearer(ana))).status, 401);
  assert.deepEqual(await gm.send({ type: "member.remove", userId: "gm-Invites" }), {
    ok: false,
    error: "You can't remove yourself",
  });
});
