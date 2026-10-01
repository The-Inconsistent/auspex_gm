// End-to-end check against a running api (bun run dev:api) + postgres (bun run dev:db). The api must run with
// CLERK_TEST_SECRET set (apps/api/.env, dev only), so these tests can act as signed-in Clerk users.
import { test } from "node:test";
import assert from "node:assert/strict";
import { io } from "socket.io-client";
import { testSessionToken } from "@wg/auth/api";
import {
  LIBRARY_CAP,
  Lobby,
  deriveStats,
  poolMax,
  type ActionInput,
  type ActionResult,
  type BookAvailable,
  type BookPage,
  type BookReply,
  type Codex,
  type CreationPayload,
  type LibraryCharacter,
  type LibraryEntry,
  type LiveState,
  type RuleEntry,
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

const put = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${API}/api${path}`, {
    method: "PUT",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

const del = (path: string, headers: Record<string, string> = {}) =>
  fetch(`${API}/api${path}`, { method: "DELETE", headers });

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
  assert.ok(other.ok && other.id);
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

  // Threat at Tier 2 -> Ork Boy is a Troop; players see its bars, not its stats, until the GM shows them.
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
  // Hidden: the phones don't get the threat at all until its mini goes on the table (rules-flow §11.56).
  await gm.send({ type: "combatant.update", id: ork.id, visibility: "hidden" });
  await player.until((s) => !!s.encounter && !threatOf(s));
  await gm.send({ type: "combatant.update", id: ork.id, visibility: "stats" });
  await player.until((s) => threatOf(s)?.stats?.name === "Ork Boy");
  // Added hidden: in no player broadcast, not even the add's own. Broadcasts arrive in order, so once the player sees
  // the later marker, every earlier one has been checked.
  const seen = new Set<string>();
  player.socket.on("state", (s: LiveState) => s.encounter?.combatants.forEach((c) => seen.add(c.id)));
  const sniper = await gm.send({ type: "combatant.addThreat", threatId: "ork-boy", visibility: "hidden" });
  assert.ok(sniper.ok && sniper.id);
  await gm.send({ type: "combatant.update", id: ork.id, marker: "red" });
  await player.until((s) => threatOf(s)?.marker === "red");
  assert.ok(!seen.has(sniper.id), "a threat added hidden never reaches the phones");
  await gm.send({ type: "combatant.remove", id: sniper.id });

  // Player permissions.
  // Harm, Wrath, Glory and Respite are the GM's.
  for (const a of [
    { type: "character.adjust", id: hero.id, wounds: 3 },
    { type: "character.adjust", id: hero.id, shock: -1 },
    { type: "character.adjust", id: hero.id, wrath: -1 },
    { type: "character.respite", id: hero.id },
    { type: "pool.adjust", pool: "glory", delta: 1 },
    { type: "pool.adjust", pool: "ruin", delta: 1 },
    { type: "combatant.remove", id: ork.id },
  ] as const)
    assert.deepEqual(await player.send(a), { ok: false, error: "GM only" }, a.type);
  assert.ok((await gm.send({ type: "pool.adjust", pool: "glory", delta: 1 })).ok, "Glory for the Seize below");
  assert.deepEqual(await player.send({ type: "character.update", id: other.id, conditions: [] }), {
    ok: false,
    error: "Not your character",
  });
  assert.deepEqual(await player.send({ type: "character.update", id: hero.id, conditions: [] }), {
    ok: false,
    error: "Conditions are the GM's",
  });
  assert.deepEqual(await player.send({ type: "character.update", id: hero.id, stats: { wealth: 99 } }), {
    ok: false,
    error: "Stats are GM only",
  });
  // Overrides pin a Trait: the GM's ruling, set from the builder's REVIEW (issue #18).
  assert.deepEqual(await player.send({ type: "character.update", id: hero.id, overrides: { maxWounds: 30 } }), {
    ok: false,
    error: "Overrides are GM only",
  });
  assert.ok((await gm.send({ type: "character.update", id: hero.id, overrides: { maxWounds: 30 } })).ok);
  await gm.until((s) => s.characters.find((c) => c.id === hero.id)?.overrides.maxWounds === 30);
  assert.ok((await gm.send({ type: "character.update", id: hero.id, overrides: {} })).ok);
  await gm.until((s) => s.characters.find((c) => c.id === hero.id)?.overrides.maxWounds === undefined);
  // Adding Detail (Core pp.32–36): a player writes their own character's; the parts left out are empty.
  assert.ok((await player.send({ type: "character.update", id: hero.id, detail: { past: "Hive Tertius" } })).ok);
  await player.until((s) => {
    const d = s.characters.find((c) => c.id === hero.id)?.detail;
    return d?.past === "Hive Tertius" && d.appearance === "";
  });
  // Supply (p.206, p.229): the GM grants Wealth and Ammo, per type; the player only spends their own.
  for (const grant of [{ wealth: 1 }, { ammo: { kind: "Bolt", delta: 1 } }])
    assert.deepEqual(await player.send({ type: "character.supply", id: hero.id, ...grant }), {
      ok: false,
      error: "Only the GM grants Wealth and Ammo",
    });
  assert.ok((await gm.send({ type: "character.supply", id: hero.id, wealth: 2, ammo: { kind: "Bolt", delta: 3 } })).ok);
  await player.send({ type: "character.supply", id: hero.id, wealth: -5, ammo: { kind: "Bolt", delta: -1 } });
  await gm.until((s) => {
    const st = s.characters.find((c) => c.id === hero.id)?.stats;
    return st?.wealth === 0 && st.ammo.Bolt === 2;
  });
  assert.deepEqual(await player.send({ type: "character.supply", id: other.id, wealth: -1 }), {
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
  // The rules reference is book text for any seat: a guest player reads it, a stranger doesn't.
  const rules = await get(`/campaigns/${campaignId}/rules`, { cookie: `wg_token=${issued.token}` });
  assert.ok(rules.status === 200 && ((await rules.json()) as unknown[]).length > 50);
  assert.equal((await get(`/campaigns/${campaignId}/rules`, bearer(clerk("stranger")))).status, 401);

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

test("private notes: a handout's audience and an Agent's objectives reach only that Agent's player", async (t) => {
  const gm = await newCampaign("Private notes", 2);
  t.after(() => gm.socket.close());
  const a = await gm.send({ type: "character.create", name: "A", objectives: [{ text: "Find the relic" }] });
  const b = await gm.send({ type: "character.create", name: "B" });
  assert.ok(a.ok && a.id && b.ok && b.id);
  const seat = async (characterId: string) => {
    const issued = await gm.send({ type: "token.issue", characterId });
    assert.ok(issued.ok && issued.token);
    const p = connect({ auth: { token: issued.token } });
    t.after(() => p.socket.close());
    await p.until((s) => s.characters.length === 2);
    return p;
  };
  const [pa, pb] = [await seat(a.id), await seat(b.id)];

  const objectives = (s: LiveState) => s.characters.map((c) => c.objectives.map((o) => o.text));
  assert.deepEqual(objectives(await pa.until(() => true)), [["Find the relic"], []], "character.create takes them");
  assert.deepEqual(objectives(await pb.until(() => true)), [[], []], "another Agent's objectives are blanked");
  assert.equal((await pb.send({ type: "character.objectives", characterId: b.id, objectives: [] })).ok, false);
  assert.ok(
    (await gm.send({ type: "character.objectives", characterId: b.id, objectives: [{ text: "Trust no one" }] })).ok,
  );
  await pb.until((s) => objectives(s)[1]?.[0] === "Trust no one");
  await pa.until((s) => objectives(s)[0]?.length === 1 && objectives(s)[1]?.length === 0);

  const handout = (title: string, audience: string[]) =>
    gm.send({ type: "codex.save", kind: "handout", data: { title, revealed: true, audience } });
  assert.equal((await handout("Forged", [crypto.randomUUID()])).ok, false, "audience ids must be this campaign's");
  assert.ok((await handout("For A", [a.id])).ok);
  assert.ok((await handout("For all", [])).ok);
  const titles = (p: typeof pa) => p.codex()?.handouts.map((h) => h.title) ?? [];
  await eventually(() => titles(pa).length === 2 && titles(pb).length === 1, "both players get their codex");
  assert.deepEqual(titles(pa), ["For A", "For all"]);
  assert.deepEqual(titles(pb), ["For all"], "a private handout never reaches another player");

  // Deleting its only reader hides the handout again, rather than showing it to everyone.
  assert.ok((await gm.send({ type: "character.delete", id: a.id })).ok);
  await eventually(() => gm.codex()?.handouts.find((h) => h.title === "For A")?.revealed === false, "hidden again");
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

  // Players never get the threat id or personal Ruin of an bars-only Threat.
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

  // A prepared beat starts an encounter with the active Agents (only B holds a guest token) and its threats.
  assert.ok((await gm.send({ type: "beat.startEncounter", id: b2.id })).ok);
  await gm.until(
    (s) =>
      s.encounter?.combatants.filter((x) => x.kind === "threat").length === 2 &&
      s.encounter.combatants.flatMap((x) => (x.kind === "pc" ? [x.characterId] : [])).join() === b.id,
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
  assert.ok((await anaSock.send({ type: "character.supply", id: pre.id, wealth: -1 })).ok);
  assert.deepEqual(await anaSock.send({ type: "character.supply", id: spare.id, wealth: -1 }), {
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

// The volkus Disruptor (docs/pregens.md #2), as the builder would send it (packages/data/build.test.ts).
const disruptor = {
  tier: 4,
  archetypeId: "primaris-incursor",
  fills: { "[CHAPTER]": { id: "raven-guard" } },
  background: {
    tableId: "adeptus-astartes",
    origin: "Cunning",
    accomplishment: "Cleanse and Purge",
    goal: "Vengeance",
    bonus: "origin" as const,
  },
  attributes: { A: 5, Int: 5 },
  skills: { Tech: 5, Stealth: 5, "Ballistic Skill": 5, Awareness: 4 },
  talents: [{ id: "wraith-slipping" }, { id: "bolter-discipline" }, { id: "silent" }],
  languages: { picks: ["high-gothic"] },
};

test("seat.leave: a player gives the Agent back to the room QR", async (t) => {
  const gm = await newCampaign("Leave", 2);
  t.after(() => gm.socket.close());
  const cid = gm.campaignId;
  const a = await gm.send({ type: "character.create", name: "A" });
  const b = await gm.send({ type: "character.create", name: "B" });
  const room = await gm.send({ type: "invite.create", mode: "room" });
  assert.ok(a.ok && a.id && b.ok && b.id && room.ok && room.token);
  const open = async () =>
    ((await (await get(`/invites/${room.token}`)).json()) as { openCharacters: { id: string }[] }).openCharacters
      .map((c) => c.id)
      .sort();

  const leaver = clerk("leaver");
  assert.equal((await post(`/invites/${room.token}/accept`, { characterId: a.id }, bearer(leaver))).status, 200);
  const guest = await post(`/invites/${room.token}/accept`, { characterId: b.id, asGuest: true });
  const guestCookie = (guest.headers.get("set-cookie") ?? "").split(";")[0]!;
  assert.deepEqual(await open(), [], "both Agents claimed");
  await gm.until((s) => s.access.guests.includes(b.id!) && s.access.members.some((m) => m.characterId === a.id));

  const member = connect({ auth: { campaignId: cid, clerkToken: leaver } });
  const guestSock = connect({ auth: { campaignId: cid }, headers: { cookie: guestCookie } });
  t.after(() => (member.socket.close(), guestSock.socket.close()));
  assert.deepEqual(await gm.send({ type: "seat.leave" }), { ok: false, error: "Only a seated player can leave" });
  assert.ok((await member.send({ type: "seat.leave" })).ok);
  assert.ok((await guestSock.send({ type: "seat.leave" })).ok);
  await gm.until((s) => s.access.guests.length === 0 && !s.access.members.some((m) => m.userId === "leaver"));
  assert.deepEqual(await open(), [a.id, b.id].sort(), "the room QR offers both again");
});

test("character builder: the creation catalogue for seats, and character.build decided by the server", async (t) => {
  const gm = await newCampaign("Builder", 4);
  t.after(() => gm.socket.close());

  // The catalogue is book text: seats only, without the homebrew books unless the campaign allows them.
  assert.equal((await get(`/campaigns/${gm.campaignId}/creation`)).status, 401);
  const res = await get(`/campaigns/${gm.campaignId}/creation`, bearer(gm.gmClerk));
  assert.equal(res.status, 200);
  const payload = (await res.json()) as CreationPayload;
  assert.equal(payload.homebrew, false);
  assert.ok(payload.creation.archetypes.some((a) => a.id === "primaris-incursor"));
  assert.ok(!payload.creation.archetypes.some((a) => a.source === "apocrypha"));
  const etag = res.headers.get("etag")!;
  assert.equal(
    (await get(`/campaigns/${gm.campaignId}/creation`, { ...bearer(gm.gmClerk), "if-none-match": etag })).status,
    304,
  );
  assert.ok((await gm.send({ type: "campaign.update", homebrew: true })).ok);
  const withHomebrew = (await (
    await get(`/campaigns/${gm.campaignId}/creation`, bearer(gm.gmClerk))
  ).json()) as CreationPayload;
  assert.ok(withHomebrew.creation.archetypes.some((a) => a.source === "apocrypha"));

  // The GM builds a new character; the server writes the sheet it derives, and keeps the choices.
  const made = await gm.send({ type: "character.build", name: "Veyl", build: disruptor });
  assert.ok(made.ok && made.id, JSON.stringify(made));
  const veyl = (await gm.until((s) => s.characters.some((c) => c.id === made.id))).characters.find(
    (c) => c.id === made.id,
  )!;
  assert.equal(veyl.stats.archetype, "Primaris Incursor");
  assert.deepEqual(veyl.stats.attributes, { S: 5, T: 5, A: 5, I: 5, Wil: 4, Int: 5, Fel: 1 });
  assert.equal(veyl.build?.archetypeId, "primaris-incursor");

  // Refused: a build with choices left, one over budget, one for another Tier.
  const { languages: _, ...noLanguage } = disruptor;
  assert.deepEqual(await gm.send({ type: "character.build", build: noLanguage }), {
    ok: false,
    error: "Still to choose: Choose 1 free language",
  });
  assert.deepEqual(await gm.send({ type: "character.build", build: { ...disruptor, attributes: { A: 7 } } }), {
    ok: false,
    error: "29 XP over the budget of 400 (Core p.20)", // 399 − 30 (A 5, Int 5) + 60 (A 4 → 7)
  });
  assert.deepEqual(await gm.send({ type: "character.build", build: { ...disruptor, tier: 3 } }), {
    ok: false,
    error: "This campaign is Tier 4; build for Tier 4",
  });

  // A player rebuilds only their own character, and can't make the GM's rulings.
  const issued = await gm.send({ type: "token.issue", characterId: made.id! });
  assert.ok(issued.ok && issued.token);
  const player = connect({ auth: { token: issued.token } });
  t.after(() => player.socket.close());
  await player.until((s) => s.characters.length === 1);
  assert.deepEqual(await player.send({ type: "character.build", build: disruptor }), {
    ok: false,
    error: "Not your character",
  });
  const rebuilt = await player.send({
    type: "character.build",
    id: made.id,
    build: { ...disruptor, gm: { keywords: ["DEATHWATCH"] } },
  });
  assert.ok(rebuilt.ok, JSON.stringify(rebuilt));
  const after = await gm.until((s) =>
    s.characters.some((c) => c.id === made.id && (c.build?.gm as { keywords: string[] }).keywords.length === 0),
  );
  assert.ok(!after.characters.find((c) => c.id === made.id)!.stats.keywords.includes("DEATHWATCH"));

  // The GM's overrides are on the character, not the build: a rebuild keeps them. A player can't grant bonuses either.
  assert.ok((await gm.send({ type: "character.update", id: made.id, overrides: { maxWounds: 20 } })).ok);
  await gm.until((s) => s.characters.find((c) => c.id === made.id)?.overrides.maxWounds === 20);
  assert.ok(
    (await player.send({ type: "character.build", id: made.id, build: { ...disruptor, gm: { mods: { resolve: 5 } } } }))
      .ok,
  );
  const ruled = (
    await gm.until(
      (s) => (s.characters.find((c) => c.id === made.id)?.build?.gm as { mods?: object })?.mods !== undefined,
    )
  ).characters.find((c) => c.id === made.id)!;
  assert.deepEqual((ruled.build?.gm as { mods: object }).mods, {}, "the player's gm.mods is dropped");
  assert.equal(ruled.overrides.maxWounds, 20, "a rebuild keeps the overrides");

  // A draft sent to the table waits for the GM: a player's keeps the GM's part, only their own, and a save clears it.
  const other = await gm.send({ type: "character.create", name: "Other" });
  assert.ok(other.ok && other.id);
  assert.deepEqual(await player.send({ type: "character.draft", id: other.id, draft: { tier: 4 } }), {
    ok: false,
    error: "Not your character",
  });
  const sent = await player.send({
    type: "character.draft",
    id: made.id!,
    draft: { ...disruptor, name: "Veyl", gm: { keywords: ["DEATHWATCH"] } },
  });
  assert.ok(sent.ok, JSON.stringify(sent));
  const waiting = (await gm.until((s) => !!s.characters.find((c) => c.id === made.id)?.draft)).characters.find(
    (c) => c.id === made.id,
  )!;
  assert.equal(waiting.draft?.archetypeId, "primaris-incursor");
  assert.deepEqual((waiting.draft?.gm as { keywords: string[] }).keywords, [], "the player's GM part is dropped");
  assert.ok((await gm.send({ type: "character.build", id: made.id, build: disruptor })).ok);
  await gm.until((s) => s.characters.find((c) => c.id === made.id)?.draft === null);

  // Advancement (issue #9 step 5): a session's XP is spent from the builder; play's Wealth survives the rebuild, and a
  // player can't change the creation choices any more.
  assert.ok((await gm.send({ type: "session.start" })).ok);
  assert.ok((await gm.send({ type: "session.end", xp: 40, recap: "" })).ok);
  assert.ok((await player.send({ type: "character.supply", id: made.id!, wealth: -1 })).ok);
  const before = (await gm.until((s) => s.characters.find((c) => c.id === made.id)?.xp === 40)).characters.find(
    (c) => c.id === made.id,
  )!;
  assert.deepEqual(
    await player.send({ type: "character.build", id: made.id, build: { ...disruptor, attributes: { A: 6 } } }),
    { ok: false, error: "Only your GM changes a character's creation choices once it's made" },
  );
  assert.deepEqual(
    await player.send({
      type: "character.build",
      id: made.id,
      build: { ...disruptor, advancement: { attributes: { S: 7 } } },
    }),
    { ok: false, error: "5 XP more than the 40 earned in play (Core p.146)" }, // S 5 → 7: 20 + 25 = 45
  );
  const spent = await player.send({
    type: "character.build",
    id: made.id,
    build: { ...disruptor, advancement: { skills: { Stealth: 6 } } },
  });
  assert.ok(spent.ok, JSON.stringify(spent));
  const advanced = (
    await gm.until((s) => s.characters.find((c) => c.id === made.id)?.stats.skills.Stealth === 6)
  ).characters.find((c) => c.id === made.id)!;
  assert.equal(advanced.stats.wealth, before.stats.wealth, "play's Wealth is kept");

  // A sheet written in another hand (a pregen's printed lines, issue #18) survives a save with no build changes: the
  // rebuild adds only what the build adds over the stored one. The new name marks the save's broadcast.
  const printed = {
    ...advanced.stats,
    weapons: advanced.stats.weapons.map((w) => ({ ...w, name: `${w.name} (printed)` })),
  };
  assert.ok((await gm.send({ type: "character.update", id: made.id, stats: printed })).ok);
  const unchanged = { ...disruptor, advancement: { skills: { Stealth: 6 } } };
  assert.ok((await gm.send({ type: "character.build", id: made.id, name: "Veyl II", build: unchanged })).ok);
  const resaved = (
    await gm.until((s) => s.characters.find((c) => c.id === made.id)?.name === "Veyl II")
  ).characters.find((c) => c.id === made.id)!;
  assert.deepEqual(resaved.stats.weapons, printed.weapons);
});

test("book pages: a GM tablet serves one page, relayed back to the player who asked", async (t) => {
  const gm = await newCampaign("Books", 2);
  t.after(() => gm.socket.close());
  const a = await gm.send({ type: "character.create", name: "A" });
  assert.ok(a.ok && a.id);
  const issued = await gm.send({ type: "token.issue", characterId: a.id });
  assert.ok(issued.ok && issued.token);
  const p = connect({ auth: { token: issued.token } });
  t.after(() => p.socket.close());
  let available: string[] | null = null;
  p.socket.on("book:available", (b: BookAvailable) => (available = b.sources));
  const ask = (page: unknown, source = "core") =>
    p.socket.emitWithAck("book:request", { source, page }) as Promise<BookReply>;
  await eventually(() => available?.length === 0, "nothing served on connect");
  assert.deepEqual(await ask(113), { ok: false, error: "The GM isn't serving that book." });

  // A player can't claim to serve; only a GM socket answers requests.
  p.socket.emit("book:serving", { sources: ["core"] });
  assert.equal((await ask(113)).ok, false, "a player's book:serving is ignored");

  // The GM tablet's render, stubbed: a JPEG-ish buffer that carries the page it was asked for.
  const asked: BookPage[] = [];
  gm.socket.on("book:request", (req: BookPage, ack: (r: BookReply) => void) => {
    asked.push(req);
    ack({ ok: true, image: new Uint8Array([0xff, 0xd8, req.page]).buffer });
  });
  gm.socket.emit("book:serving", { sources: ["core"] });
  await eventually(() => !!available?.includes("core"), "players hear the GM is serving Core");
  const r = await ask(113);
  assert.ok(r.ok);
  assert.deepEqual([...new Uint8Array(r.image)], [0xff, 0xd8, 113]);
  assert.deepEqual(asked, [{ source: "core", page: 113 }], "the printed page goes to the tablet (it adds the offset)");
  assert.deepEqual(await ask(113, "threat-assessment"), { ok: false, error: "The GM isn't serving that book." });
  assert.equal((await ask(0)).ok, false, "pages start at 1");
  assert.equal(asked.length, 1, "refused requests never reach the tablet");

  // The tablet leaving (tab closed, signal lost) turns the links back into text.
  gm.socket.close();
  await eventually(() => available?.length === 0, "a GM leaving stops serving");
  assert.equal((await ask(113)).ok, false);
});

test("the guest door is rate limited per caller IP", async () => {
  // Unique IPs, so this doesn't eat into the other tests' (localhost) bucket.
  const from = (ip: string) => get("/guest", { "cf-connecting-ip": ip });
  for (let i = 0; i < 60; i++) assert.equal((await from("203.0.113.9")).status, 401);
  assert.equal((await from("203.0.113.9")).status, 429);
  assert.equal((await from("203.0.113.10")).status, 401, "another caller is unaffected");
});

test("the character library: a signed-in user builds without a campaign (issue #14)", async () => {
  // A fresh user per run: library rows outlive a test, unlike a campaign, which each test creates for itself.
  const who = `library-${Date.now()}`;
  const owner = clerk(`${who}-owner`);
  const stranger = clerk(`${who}-stranger`);

  // Book text needs an account: no seat, but no anonymous callers and no guests either.
  assert.equal((await get("/library")).status, 401);
  assert.equal((await get("/creation")).status, 401);
  assert.equal((await get("/rules")).status, 401);
  assert.equal(
    (await get("/library", { cookie: "wg_token=not-a-clerk-session" })).status,
    401,
    "a guest has no library",
  );

  // The catalogue outside a campaign: the caller picks the books, because no campaign decides for them.
  const official = await get("/creation", bearer(owner));
  assert.equal(official.status, 200);
  const plain = (await official.json()) as CreationPayload;
  assert.equal(plain.homebrew, false);
  assert.ok(!plain.creation.archetypes.some((a) => a.source === "apocrypha"));
  const etag = official.headers.get("etag")!;
  assert.equal((await get("/creation", { ...bearer(owner), "if-none-match": etag })).status, 304);
  const homebrew = (await (await get("/creation?homebrew=1", bearer(owner))).json()) as CreationPayload;
  assert.ok(homebrew.creation.archetypes.some((a) => a.source === "apocrypha"));
  assert.ok(((await (await get("/rules", bearer(owner))).json()) as RuleEntry[]).length > 0);

  // A new character starts empty, so the builder has a row to autosave its draft to.
  const created = await post("/library", {}, bearer(owner));
  assert.equal(created.status, 201);
  const { id } = (await created.json()) as LibraryCharacter;
  assert.deepEqual(
    ((await (await get("/library", bearer(owner))).json()) as LibraryCharacter[]).map((c) => [c.id, c.done]),
    [[id, false]],
  );
  assert.deepEqual((await (await get("/library", bearer(stranger))).json()) as LibraryCharacter[], []);

  // A draft autosaves as any shape the builder writes; a build is re-resolved here and refused unless it's ready.
  assert.equal(
    (await put(`/library/${id}`, { name: "Veyl", draft: { tier: 4, name: "Veyl" } }, bearer(owner))).status,
    200,
  );
  const { languages: _, ...noLanguage } = disruptor;
  const refused = await put(`/library/${id}`, { build: noLanguage }, bearer(owner));
  assert.equal(refused.status, 400);
  assert.equal(
    ((await refused.json()) as { message: string }).message,
    "Still to choose: Choose 1 free language",
    "the library refuses a build in the builder's words",
  );
  const saved = await put(
    `/library/${id}`,
    { build: { ...disruptor, gm: { keywords: ["DEATHWATCH"] } } },
    bearer(owner),
  );
  assert.equal(saved.status, 200);
  assert.deepEqual(
    { ...((await saved.json()) as LibraryCharacter), id: "", updatedAt: "" },
    { id: "", name: "Veyl", tier: 4, archetype: "Primaris Incursor", homebrew: false, done: true, updatedAt: "" },
  );
  // The lobby carries the library, so YOUR CHARACTERS lists them without a second request (issue #14 step 3).
  const inLobby = ((await (await get("/lobby", bearer(owner))).json()) as Lobby).characters;
  assert.deepEqual(
    inLobby.map((c) => [c.name, c.tier, c.archetype, c.done]),
    [["Veyl", 4, "Primaris Incursor", true]],
  );

  const entry = (await (await get(`/library/${id}`, bearer(owner))).json()) as LibraryEntry;
  assert.equal(entry.build?.archetypeId, "primaris-incursor");
  assert.deepEqual(entry.build?.gm.keywords, [], "the GM's part belongs to a table, not to the library");

  // Another user's character is not found, never forbidden: a 403 would tell them the id exists.
  assert.equal((await get(`/library/${id}`, bearer(stranger))).status, 404);
  assert.equal((await put(`/library/${id}`, { name: "Theirs" }, bearer(stranger))).status, 404);
  assert.equal((await del(`/library/${id}`, bearer(stranger))).status, 404);
  assert.equal(entry.name, "Veyl", "and it is untouched");

  // A draft is stored as the builder writes it, so a Tier outside 1–5 can't reach the lobby's schema and take the whole
  // lobby down with it.
  assert.equal((await put(`/library/${id}`, { draft: { tier: 0, name: "Bad" } }, bearer(owner))).status, 200);
  assert.equal(
    Lobby.safeParse(await (await get("/lobby", bearer(owner))).json()).success,
    true,
    "the lobby still parses with a bad draft Tier",
  );

  // One account is bounded: 20 characters (LIBRARY_CAP), then it has to delete one. The cap is exact, so a burst of
  // concurrent posts can't overshoot it (the insert locks the owner's row).
  const capped = clerk(`${who}-hoarder`);
  const burst = await Promise.all(Array.from({ length: LIBRARY_CAP + 10 }, () => post("/library", {}, bearer(capped))));
  assert.equal(burst.filter((r) => r.status === 201).length, LIBRARY_CAP, `${LIBRARY_CAP} created, the rest refused`);
  const refusedCap = burst.find((r) => r.status === 400)!;
  assert.match(((await refusedCap.json()) as { message: string }).message, /at most 20 characters/);
  const over = burst.find((r) => r.status === 201)!;
  assert.equal((await del(`/library/${((await over.json()) as LibraryCharacter).id}`, bearer(capped))).status, 200);
  assert.equal((await post("/library", {}, bearer(capped))).status, 201, "a deletion makes room again");

  assert.equal((await del(`/library/${id}`, bearer(owner))).status, 200);
  assert.equal((await get(`/library/${id}`, bearer(owner))).status, 404);
});

test("a library character comes into a campaign as a copy (issue #14 step 4)", async (t) => {
  const owner = clerk(`import-${Date.now()}`);
  const created = await post("/library", {}, bearer(owner));
  const { id } = (await created.json()) as LibraryCharacter;
  assert.equal((await put(`/library/${id}`, { name: "Sila", build: disruptor }, bearer(owner))).status, 200);
  const { build } = (await (await get(`/library/${id}`, bearer(owner))).json()) as LibraryEntry;
  assert.ok(build, "the library holds the finished build");

  // The import is a copy made in the builder, so the server sees the ordinary `character.build` (no new action).
  const table = await newCampaign("Import", 4);
  t.after(() => table.socket.close());
  const brought = await table.send({ type: "character.build", name: "Sila", build });
  assert.ok(brought.ok && brought.id, JSON.stringify(brought));
  const sila = (await table.until((s) => s.characters.some((c) => c.id === brought.id))).characters.find(
    (c) => c.id === brought.id,
  )!;
  assert.equal(sila.stats.archetype, "Primaris Incursor");

  // Later library edits don't reach the campaign character: it was snapshotted on the way in.
  assert.equal(
    (
      await put(
        `/library/${id}`,
        { name: "Sila Renamed", build: { ...disruptor, skills: { ...disruptor.skills, Stealth: 4 } } },
        bearer(owner),
      )
    ).status,
    200,
  );
  const after = (await table.until(() => true)).characters.find((c) => c.id === brought.id)!;
  assert.deepEqual([after.name, after.stats.skills.Stealth], ["Sila", 5], "the campaign copy is untouched");

  // A campaign only takes a character built for its own Tier; the builder blocks it first, the server refuses it too.
  const other = await newCampaign("ImportT2", 2);
  t.after(() => other.socket.close());
  assert.deepEqual(await other.send({ type: "character.build", name: "Sila", build }), {
    ok: false,
    error: "This campaign is Tier 2; build for Tier 2",
  });

  // What only a GM judges waits for the campaign's GM (rules-flow §11.59): the library finishes a build with it open,
  // and the table refuses it until the GM ticks it. Augmetic's XP is "20 plus the Value": the GM adds it (Core p.129).
  const augmented = {
    ...disruptor,
    talents: [{ id: "wraith-slipping" }, { id: "bolter-discipline" }, { id: "augmetic" }],
    choices: { "talent/augmetic/0": [0], "talent/augmetic/0/0": ["augmetic-eye", "augmetic-arm"] },
  };
  const gmLater = await put(`/library/${id}`, { build: augmented }, bearer(owner));
  assert.equal(gmLater.status, 200, "the library leaves the GM's items open");
  assert.equal(((await gmLater.json()) as LibraryCharacter).done, true);
  const xp = "Augmetic costs 20 XP plus the Value of the augmetic you choose: the GM adds it";
  assert.deepEqual(await table.send({ type: "character.build", name: "Aug", build: augmented }), {
    ok: false,
    error: xp,
  });
  const ticked = await table.send({
    type: "character.build",
    name: "Aug",
    build: { ...augmented, gm: { approved: ["talent/augmetic/xp"] } },
  });
  assert.ok(ticked.ok, JSON.stringify(ticked));
});
