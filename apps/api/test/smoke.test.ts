// End-to-end check against a running api (pnpm start) + postgres (docker compose up -d postgres).
import { test } from "node:test";
import assert from "node:assert/strict";
import { io, type Socket } from "socket.io-client";
import type { ActionInput, ActionResult, Codex, LiveState, ThreatCombatant } from "@wg/shared";

const API = process.env.API_URL ?? `http://localhost:${process.env.PORT ?? 4000}`;

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${API}/api${path}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

function connect(token: string) {
  const socket = io(API, { auth: { token }, transports: ["websocket"], reconnection: false });
  let latest: LiveState | null = null;
  let codex: Codex | null = null;
  socket.on("codex", (c: Codex) => (codex = c));
  const waiters: Array<[(s: LiveState) => boolean, (s: LiveState) => void]> = [];
  socket.on("state", (s: LiveState) => {
    latest = s;
    for (const w of waiters.splice(0)) (w[0](s) ? w[1](s) : waiters.push(w));
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

const threatOf = (s: LiveState) => s.encounter?.combatants.find((c): c is ThreatCombatant => c.kind === "threat");

test("GM and player share a table", async (t) => {
  assert.equal((await post("/campaigns", { name: "Smoke", tier: 2 })).status, 401, "campaign creation needs the admin key");
  const created = await post("/campaigns", { name: "Smoke", tier: 2 }, { "x-admin-key": process.env.ADMIN_KEY! });
  assert.equal(created.status, 201);
  const { gmToken } = (await created.json()) as { gmToken: string };

  const join = await post("/join", { token: gmToken });
  assert.equal(join.status, 200);
  assert.match(join.headers.get("set-cookie") ?? "", /wg_token=.*HttpOnly/i);
  assert.equal((await post("/join", { token: "nope" })).status, 401);

  const gm = connect(gmToken);
  t.after(() => gm.socket.close());
  await gm.until((s) => s.campaign.name === "Smoke");

  const hero = await gm.send({ type: "character.create", name: "Hero" });
  const other = await gm.send({ type: "character.create", name: "Other" });
  assert.ok(hero.ok && hero.id && other.ok && other.id);
  const issued = await gm.send({ type: "token.issue", characterId: hero.id });
  assert.ok(issued.ok && issued.token);

  const player = connect(issued.token);
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
  await player.until((s) => threatOf(s)?.mobCount === 8, ); // Mob members have 1 Wound each (p.325)
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
  assert.deepEqual(await player.send({ type: "character.adjust", id: other.id, wounds: 1 }), { ok: false, error: "Not your character" });
  assert.equal((await player.send({ type: "nope" } as never)).ok, false, "invalid payloads are rejected");

  // Alternating turns: Agent, then Threat. Seize: the side that just acted pays 1 Glory to go again, once.
  const heroC = await gm.send({ type: "combatant.addCharacter", characterId: hero.id });
  const otherC = await gm.send({ type: "combatant.addCharacter", characterId: other.id });
  assert.ok(heroC.ok && heroC.id && otherC.ok && otherC.id);
  assert.deepEqual(await gm.send({ type: "turn.start", id: ork.id }), { ok: false, error: "It's the Agents' turn; Seize to go out of order" });
  assert.ok((await gm.send({ type: "turn.start", id: heroC.id })).ok);
  assert.deepEqual(await gm.send({ type: "turn.start", id: ork.id }), { ok: false, error: "End the current turn first" });
  assert.ok((await gm.send({ type: "turn.end" })).ok);
  assert.deepEqual(await gm.send({ type: "turn.start", id: heroC.id }), { ok: false, error: "Already acted this round" });
  assert.deepEqual(await gm.send({ type: "turn.start", id: otherC.id }), { ok: false, error: "It's the Threats' turn; Seize to go out of order" });
  assert.deepEqual(await gm.send({ type: "turn.seize", id: ork.id }), { ok: false, error: "Seizing lets the side that just acted go again" });
  const before = (await gm.until((s) => s.encounter?.lastSide === "agents")).campaign.glory;
  assert.ok((await gm.send({ type: "turn.seize", id: otherC.id })).ok);
  await gm.until((s) => s.campaign.glory === before - 1 && s.encounter?.currentId === otherC.id);
  await gm.send({ type: "turn.end" });
  await gm.send({ type: "turn.start", id: ork.id });
  await gm.send({ type: "turn.end" });
  await gm.until((s) => s.encounter?.round === 2 && s.encounter.combatants.every((c) => !c.acted) && s.encounter.lastSide === null);

  // Round start: only the GM can Seize (1 Ruin) to let a Threat go first; not twice in a row.
  await gm.send({ type: "pool.adjust", pool: "ruin", delta: 3 });
  assert.ok((await gm.send({ type: "turn.seize", id: ork.id })).ok, "GM seizes the first turn");
  await gm.send({ type: "turn.end" });

  // Mobs: every member has 1 Wound, so damage removes members (p.325).
  await gm.send({ type: "combatant.adjust", id: ork.id, wounds: 4 });
  await gm.until((s) => threatOf(s)?.mobCount === 4 && threatOf(s)?.mobStart === 10);
  await gm.send({ type: "combatant.adjust", id: ork.id, wounds: -20 });
  await gm.until((s) => threatOf(s)?.mobCount === 10, );

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
  assert.ok((await gm.send({ type: "session.end", xp: 10, recap: "Boyz krumped." })).ok);
  await gm.until((s) => s.characters.every((c) => c.xp === 10));

  // Codex: players only see revealed entries, without GM notes.
  const secret = await gm.send({ type: "codex.save", kind: "npc", data: { name: "Magos Vex", gmNotes: "wants the tomb", revealed: false } });
  const known = await gm.send({ type: "codex.save", kind: "npc", data: { name: "Inquisitor Hale", gmNotes: "patron", revealed: true } });
  const orders = await gm.send({ type: "codex.save", kind: "handout", data: { title: "Orders", body: "Kill the Orks.", revealed: true } });
  assert.ok(secret.ok && known.ok && orders.ok, "handouts can be created already revealed");
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(gm.codex()?.npcs.length, 2);
  assert.deepEqual(player.codex()?.npcs.map((n) => [n.name, n.gmNotes]), [["Inquisitor Hale", ""]]);

  // Pools are capped: Glory max(6, players + 2), Ruin 2 × players.
  await gm.send({ type: "pool.adjust", pool: "glory", delta: 100 });
  await gm.send({ type: "pool.adjust", pool: "ruin", delta: 100 });
  await gm.until((s) => s.campaign.glory === 6 && s.campaign.ruin === 4);

  // The bestiary endpoint is GM-only.
  const asCookie = (token: string) => ({ headers: { cookie: `wg_token=${token}` } });
  assert.equal((await fetch(`${API}/api/threats`, asCookie(gmToken))).status, 200);
  assert.equal((await fetch(`${API}/api/threats`, asCookie(issued.token))).status, 403);

  // Revoking kicks the player's socket and kills the link.
  const kicked = new Promise((r) => player.socket.on("disconnect", r));
  assert.ok((await gm.send({ type: "token.revoke", characterId: hero.id })).ok);
  await kicked;
  assert.equal((await post("/join", { token: issued.token })).status, 401);
});

test("a malformed login cookie is refused, not fatal", async () => {
  const bad = { cookie: "wg_token=%" }; // decodeURIComponent throws on this
  assert.equal((await fetch(`${API}/api/me`, { headers: bad })).status, 401);
  const socket = io(API, { transports: ["websocket"], reconnection: false, extraHeaders: bad });
  const err = await new Promise<Error>((resolve) => socket.once("connect_error", resolve));
  socket.close();
  assert.equal(err.message, "unauthorized");
  assert.equal((await fetch(`${API}/api/me`)).status, 401, "api still up");
});
