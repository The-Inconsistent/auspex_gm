// End-to-end check against a running api (bun run dev:api) + postgres (bun run dev:db). The api must run with
// CLERK_TEST_SECRET set (apps/api/.env, dev only), so these tests can act as signed-in Clerk users.
import { test } from "node:test";
import assert from "node:assert/strict";
import { isDeepStrictEqual } from "node:util";
import { io } from "socket.io-client";
import { testSessionToken } from "@wg/auth/api";
import { wargear } from "@wg/data";
import {
  ASCENSION_XP,
  BeatTest,
  CUSTOM_THREAT_CAP,
  LIBRARY_CAP,
  Lobby,
  MAX_CUSTOM_THREAT_CHARS,
  SKILL_XP,
  deriveStats,
  poolMax,
  type ActionInput,
  type ActionResult,
  type BookAvailable,
  type BookPage,
  type BookReply,
  type CampaignExport,
  type Character,
  type Codex,
  type CreationPayload,
  type FactionPresets,
  type FlavourTable,
  type NpcPreset,
  type HulkRow,
  type PlaceSummary,
  type FrameworkCatalogue,
  type LibraryCharacter,
  type LibraryEntry,
  type LiveState,
  type RuleEntry,
  presetFaction,
  presetNpc,
  presetLine,
  presetScene,
  rollLook,
  type ScenePresets,
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

test("NEW CAMPAIGN: the Frameworks before a campaign exists, then one POST with every step", async () => {
  assert.equal((await get("/frameworks")).status, 401, "book text needs a signed-in user");
  assert.equal((await get("/frameworks", bearer(clerk("not-a-creator")))).status, 403, "and the creator role");
  const gmClerk = clerk("gm-new-campaign", "creator");
  const frameworks = await get("/frameworks", bearer(gmClerk));
  assert.equal(frameworks.status, 200);
  assert.ok(((await frameworks.json()) as FrameworkCatalogue).patrons.length > 0);

  const setup = {
    framework: "Deathwatch",
    frameworkBonus: "+1 die",
    patron: "Ordo Xenos",
    kind: ["investigative"],
    limits: ["body horror"],
  };
  const tooLong = { name: "Fresh", tier: 3, limits: ["x".repeat(61)] };
  assert.equal((await post("/campaigns", tooLong, bearer(gmClerk))).status, 400, "the same limits as campaign.update");
  const created = await post("/campaigns", { name: "Fresh", tier: 3, ...setup }, bearer(gmClerk));
  assert.equal(created.status, 201);
  const { campaignId } = (await created.json()) as { campaignId: string };
  // The export reads the row back without a socket (the suite is near the connect rate limit).
  const file = (await (await get(`/campaigns/${campaignId}/export`, bearer(gmClerk))).json()) as CampaignExport;
  const { framework, frameworkBonus, patron, kind, limits } = file.campaign;
  assert.deepEqual({ framework, frameworkBonus, patron, kind, limits }, setup);
  assert.equal(file.campaign.tier, 3);
});

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
  // Fitting an upgrade (Core pp.227-228, rules-flow §11.63-§11.65): instant, no Test, but the fit, the maximum of
  // three and one-per-slot are the server's to check. The Laspistol just requisitioned is the weapon.
  const fit = { type: "character.fitUpgrade" as const, id: hero.id!, weapon: "Laspistol" };
  // A player fits only what their character owns; the GM grants (§11.57).
  assert.deepEqual(await player.send({ ...fit, upgradeId: "magnocular-scope" }), {
    ok: false,
    error: "Hero doesn't have Magnocular Scope to fit",
  });
  assert.deepEqual(await player.send({ ...fit, id: other.id!, upgradeId: "magnocular-scope" }), {
    ok: false,
    error: "Not your character",
  });
  // What the table receives is the derived sheet, so the fit has to show on the weapon itself, not only as an id.
  assert.ok((await gm.send({ ...fit, upgradeId: "mastercrafted" })).ok);
  const shown = await gm.until((s) => {
    const w = s.characters.find((c) => c.id === hero.id)?.stats.weapons.find((x) => x.name === "Laspistol");
    return Boolean(w?.fitted?.includes("mastercrafted") && w.traits.includes("Reliable"));
  });
  const laspistol = shown.characters.find((c) => c.id === hero.id)!.stats.weapons.find((w) => w.name === "Laspistol")!;
  assert.deepEqual(laspistol.upgradeNames, ["Mastercrafted"]);
  assert.ok(
    laspistol.notes?.some((n) => n.includes("bonus dice")),
    "the prose the GM applies (Core p.228)",
  );
  // That prose is rules text, so an invite holder without a seat sees the fitted profile but not the notes.
  const heroInvite = await gm.send({ type: "invite.create", mode: "character", characterId: hero.id! });
  assert.ok(heroInvite.ok && heroInvite.token);
  const previewed = (
    (await (await get(`/invites/${heroInvite.token}`)).json()) as { character: Character }
  ).character.stats.weapons.find((w) => w.name === "Laspistol")!;
  assert.ok(previewed.traits.includes("Reliable"));
  assert.equal(previewed.notes, undefined);
  assert.equal(previewed.upgradeNames, undefined);
  assert.ok(
    (await gm.send({ type: "character.removeUpgrade", id: hero.id!, weapon: "Laspistol", upgradeId: "mastercrafted" }))
      .ok,
  );

  assert.ok((await gm.send({ ...fit, upgradeId: "magnocular-scope" })).ok);
  await gm.until((s) =>
    Boolean(
      s.characters
        .find((c) => c.id === hero.id)
        ?.stats.weapons.find((w) => w.name === "Laspistol")
        ?.fitted?.includes("magnocular-scope"),
    ),
  );
  assert.deepEqual(await gm.send({ ...fit, upgradeId: "magnocular-scope" }), {
    ok: false,
    error: "Laspistol already has Magnocular Scope",
  });
  assert.deepEqual(await gm.send({ ...fit, upgradeId: "red-dot-sight" }), {
    ok: false,
    error: "Laspistol already has a sight: Magnocular Scope (Core p.227)",
  });
  // An armour upgrade doesn't go on a weapon, and nothing outside the catalogue goes on anything.
  const armourFit = await gm.send({ ...fit, upgradeId: "voa-adamantine-cuirass" });
  assert.match(armourFit.ok ? "fitted" : armourFit.error, /fits armour/);
  assert.deepEqual(await gm.send({ ...fit, upgradeId: "no-such-upgrade" }), { ok: false, error: "Unknown upgrade" });
  assert.deepEqual(await gm.send({ ...fit, weapon: "Nothing", upgradeId: "magnocular-scope" }), {
    ok: false,
    error: 'Hero has no weapon called "Nothing"',
  });
  // removeUpgrade refuses what isn't fitted, someone else's character, what the build gives, and a full gear list.
  const off = { type: "character.removeUpgrade" as const, id: hero.id!, weapon: "Laspistol" };
  assert.deepEqual(await gm.send({ ...off, upgradeId: "mastercrafted" }), {
    ok: false,
    error: "Laspistol has no Mastercrafted fitted",
  });
  assert.deepEqual(await player.send({ ...off, id: other.id!, upgradeId: "magnocular-scope" }), {
    ok: false,
    error: "Not your character",
  });
  const stored = (await gm.until((s) => s.characters.some((c) => c.id === hero.id))).characters.find(
    (c) => c.id === hero.id,
  )!.stats;
  const crowded = {
    ...stored,
    weapons: stored.weapons.map((w) => (w.name === "Frag Grenade" ? { ...w, upgrades: ["mastercrafted"] } : w)),
    gear: [...stored.gear, ...Array.from({ length: 60 - stored.gear.length }, (_, i) => `Trinket ${i}`)],
  };
  assert.ok((await gm.send({ type: "character.update", id: hero.id!, stats: crowded })).ok);
  assert.deepEqual(await gm.send({ ...off, weapon: "Frag Grenade", upgradeId: "mastercrafted" }), {
    ok: false,
    error: "Mastercrafted is part of Frag Grenade as it was built: change the build to take it off",
  });
  assert.deepEqual(await gm.send({ ...off, upgradeId: "magnocular-scope" }), {
    ok: false,
    error: "Hero's gear list is full (60 lines)",
  });
  assert.ok((await gm.send({ type: "character.update", id: hero.id!, stats: stored })).ok);

  // Taking it off puts it back in the character's gear, so their own player can fit it again.
  const { type: _fitType, ...onLaspistol } = fit;
  assert.ok((await gm.send({ type: "character.removeUpgrade", ...onLaspistol, upgradeId: "magnocular-scope" })).ok);
  await gm.until((s) =>
    Boolean(s.characters.find((c) => c.id === hero.id)?.stats.gear.some((g) => g.startsWith("Magnocular Scope"))),
  );
  assert.ok((await player.send({ ...fit, upgradeId: "magnocular-scope" })).ok);
  await gm.until((s) => {
    const st = s.characters.find((c) => c.id === hero.id)?.stats;
    return (
      st?.weapons.find((w) => w.name === "Laspistol")?.fitted?.length === 1 &&
      !st.gear.some((g) => g.startsWith("Magnocular Scope"))
    );
  });

  // The upgrades the character holds in gear reach the phones as ids, so a sheet can offer the fit without the
  // catalogue (#15 step 4).
  await gm.until((s) => {
    const owned = s.characters.find((c) => c.id === hero.id)?.ownedUpgrades ?? [];
    // The Mastercrafted taken off earlier is back in gear, named and with its slot, ready to be fitted again.
    return owned.some((u) => u.id === "mastercrafted" && u.name === "Mastercrafted" && u.slot === "craft");
  });

  // Upgrades on armour (issue #32 item 3, §11.65): the suit is a host like a weapon, under the same cap, and what is
  // fitted reaches the AR the table reads. Hero wears nothing until the GM gives them a suit.
  const onSuit = { type: "character.fitUpgrade" as const, id: hero.id!, host: "armour" as const };
  assert.deepEqual(await gm.send({ ...onSuit, upgradeId: "voa-adamantine-cuirass" }), {
    ok: false,
    error: "Hero wears no armour",
  });
  const suited = (await gm.until((s) => s.characters.some((c) => c.id === hero.id))).characters.find(
    (c) => c.id === hero.id,
  )!.stats;
  assert.ok(
    (
      await gm.send({
        type: "character.update",
        id: hero.id!,
        stats: {
          ...suited,
          armour: { name: "Mk VII Aquila Armour", wargearId: "voa-mk-vii-aquila-armour", ar: 5, powered: 3 },
          gear: [...suited.gear, "Adamantine Cuirass (Vow of Absolution p.73)"],
        },
      })
    ).ok,
  );
  // A player fits one the character holds; the AR and the Trait it grants show on the derived sheet (VoA p.73).
  assert.ok((await player.send({ ...onSuit, upgradeId: "voa-adamantine-cuirass" })).ok);
  const worn = (
    await gm.until((s) => !!s.characters.find((c) => c.id === hero.id)?.stats.armour.fitted?.length)
  ).characters.find((c) => c.id === hero.id)!.stats.armour;
  assert.equal(worn.ar, 6, "5 printed + 1 (VoA p.73)");
  assert.ok(worn.traits.includes("Bulk (1)"));
  assert.deepEqual(worn.upgradeNames, ["Adamantine Cuirass"]);
  assert.ok(
    worn.notes?.some((n) => n.includes("Flight Speed")),
    "the prose the GM applies",
  );
  // The notes are rules text, so an invite holder sees the AR but not them; the AR is the profile, so it stays.
  const suitInvite = await gm.send({ type: "invite.create", mode: "character", characterId: hero.id! });
  assert.ok(suitInvite.ok && suitInvite.token);
  const peeked = ((await (await get(`/invites/${suitInvite.token}`)).json()) as { character: Character }).character
    .stats.armour;
  assert.equal(peeked.ar, 6);
  assert.equal(peeked.notes, undefined);
  assert.equal(peeked.upgradeNames, undefined);
  // The GM's editor sends the derived sheet back; storing it would apply the +1 AR twice (storedProfiles).
  assert.ok((await gm.send({ type: "character.update", id: hero.id!, stats: { ...suited, armour: worn } })).ok);
  await gm.until((s) => s.characters.find((c) => c.id === hero.id)?.stats.armour.ar === 6);
  // One per slot and three at most hold on a suit too (§11.65): a second `plate`, then a full suit.
  assert.deepEqual(await gm.send({ ...onSuit, upgradeId: "ioe-chains-blades-and-hooks" }), {
    ok: false,
    error: "Chains, Blades and Hooks doesn't fit Mk VII Aquila Armour",
  });
  assert.deepEqual(await gm.send({ ...onSuit, upgradeId: "voa-adamantine-cuirass" }), {
    ok: false,
    error: "Mk VII Aquila Armour already has Adamantine Cuirass",
  });
  // Matched Pair reads on two weapons at once, so it is the GM's to fit, never a player's (§11.64).
  assert.deepEqual(await player.send({ ...fit, upgradeId: "apoc-matched-pair" }), {
    ok: false,
    error: "Matched Pair is the GM's to fit: it reads on two weapons at once (rules-flow.md §11.64)",
  });
  // Naming no weapon is only allowed for the armour host.
  const noHost = await gm.send({ type: "character.fitUpgrade", id: hero.id!, upgradeId: "magnocular-scope" });
  assert.match(noHost.ok ? "fitted" : noHost.error, /Name the weapon/);
  // Taking it off the suit puts it back in gear and the AR with it.
  assert.ok(
    (
      await gm.send({
        type: "character.removeUpgrade",
        ...{ id: hero.id!, host: "armour" as const },
        upgradeId: "voa-adamantine-cuirass",
      })
    ).ok,
  );
  await gm.until((s) => {
    const st = s.characters.find((c) => c.id === hero.id)?.stats;
    return st?.armour.ar === 5 && st.gear.some((g) => g.startsWith("Adamantine Cuirass"));
  });

  assert.ok((await gm.send({ type: "session.end", xp: 10, recap: "Boyz krumped." })).ok);
  await gm.until((s) => s.characters.every((c) => c.xp === 10));

  // Requisitioning an upgrade onto a weapon (#15 step 4): the fit is checked before the Test is recorded, so a target
  // that can't take it costs the session nothing and the GM can record the roll again.
  assert.ok((await gm.send({ type: "session.start" })).ok);
  await gm.until((s) => s.campaign.glory === 0);
  const rqUp = {
    type: "character.requisition" as const,
    id: hero.id!,
    kind: "wargear" as const,
    item: "Red-Dot Sight",
    wargearId: "red-dot-sight",
    value: 5,
    rarity: "Uncommon" as const,
    keywords: ["[ANY]"],
    icons: 6,
  };
  assert.deepEqual(await gm.send({ ...rqUp, fitTo: "Frag Grenade" }), {
    ok: false,
    error: "Red-Dot Sight fits weapon; Frag Grenade is grenade (rules-flow.md §11.64)",
  });
  // A sight is already on the Laspistol, so the slot refuses this one too — again before the Test is spent.
  assert.deepEqual(await gm.send({ ...rqUp, fitTo: "Laspistol" }), {
    ok: false,
    error: "Laspistol already has a sight: Magnocular Scope (Core p.227)",
  });
  // Neither refusal used up the session's Wargear Test: the same item requisitioned into gear still works.
  assert.ok((await gm.send(rqUp)).ok);
  await gm.until((s) =>
    Boolean(s.characters.find((c) => c.id === hero.id)?.ownedUpgrades.some((u) => u.id === "red-dot-sight")),
  );

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
  // A scene's Ruin line tapped at the maximum is lost (Core p.320), and a spend never takes the pool below 0 (issue #40).
  assert.ok((await gm.send({ type: "pool.adjust", pool: "ruin", delta: 1 })).ok);
  assert.ok((await gm.send({ type: "pool.adjust", pool: "ruin", delta: -1 })).ok);
  await gm.until((s) => s.campaign.ruin === poolMax("ruin", 2) - 1);
  assert.ok((await gm.send({ type: "pool.adjust", pool: "ruin", delta: -(poolMax("ruin", 2) + 3) })).ok);
  await gm.until((s) => s.campaign.ruin === 0);

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
  // So are the scene presets (issue #39): the sample DNs per Skill (Core pp.122-126) and the books' event tables.
  const presets = await get(`/campaigns/${campaignId}/scene-presets`, bearer(gmClerk));
  assert.equal(presets.status, 200);
  const { skillDns, tables, pools, hazards, spaceHulk } = (await presets.json()) as ScenePresets;
  assert.equal(skillDns.length, 85);
  // A place's hazard tables (issue #49) ride along: Threat Assessment p.11 prints no Space Hulk row for 66 (§11.93).
  assert.deepEqual(hazards.find((x) => x.id === "threat-assessment-space-hulk")?.gaps, [66]);
  // So does the Space Hulk Generator (issue #50 step 8): RR1 p.8 prints no Objective for 14–16 or 46.
  assert.deepEqual(spaceHulk?.objectives.gaps, [14, 15, 16, 46]);
  // ADD FROM BOOK (issue #40): a Core Ruin spend copies into a scene with its cite; Core p.316's Glory award prints no
  // amount and starts at 1 (§11.77).
  const spends = pools.find((x) => x.id === "core-ruin-spends")!;
  assert.deepEqual(presetLine({ table: spends, row: spends.rows[0]! }).line, {
    pool: "ruin",
    name: "Reroll Failures",
    cost: 1,
    text: "You can spend 1 Ruin to reroll failures (but not Complications) on any Test for an NPC. (Core p.320)",
  });
  const awards = pools.find((x) => x.id === "core-glory-awards")!;
  assert.deepEqual(presetLine({ table: awards, row: awards.rows[0]! }), {
    list: "glory",
    line: { text: "A particularly impressive feat (Core p.316)", amount: 1 },
  });
  // NEW SCENE FROM A TABLE: a Church of Steel event becomes a scene, one Test per Skill it offers at the table's
  // printed DN 5 (Church of Steel p.36).
  const battlefield = tables.find((x) => x.id === "church-of-steel-battlefield-events")!;
  const shelling = battlefield.rows.find((e) => e.from === 11)!;
  const convoy = await gm.send({ type: "codex.save", kind: "adventure", data: { title: "Convoy" } });
  assert.ok(convoy.ok && convoy.id);
  const made = await gm.send({
    type: "codex.save",
    kind: "beat",
    data: { ...presetScene({ table: battlefield, row: shelling }), adventureId: convoy.id },
  });
  assert.ok(made.ok, "a book event saves as a scene");
  await eventually(
    () =>
      gm
        .codex()
        ?.adventures.find((a) => a.id === convoy.id)
        ?.beats[0]?.tests.map((x) => `${x.skill} ${x.dn}`)
        .join() === "Awareness 5,Leadership 5,Survival 5",
    "one Test per Skill at the table's DN",
  );
  assert.equal(
    (await get(`/campaigns/${campaignId}/scene-presets`, { cookie: `wg_token=${issued.token}` })).status,
    403,
  );
  // And the printed patrons and Frameworks for SETUP's picker (issue #45).
  const frameworks = await get(`/campaigns/${campaignId}/frameworks`, bearer(gmClerk));
  assert.equal(frameworks.status, 200);
  const { patrons } = (await frameworks.json()) as FrameworkCatalogue;
  assert.ok(patrons.some((p) => p.options.some((o) => o.name === "Varonius Vanguard")));
  assert.equal((await get(`/campaigns/${campaignId}/frameworks`, { cookie: `wg_token=${issued.token}` })).status, 403);
  assert.equal((await get(`/campaigns/${campaignId}/frameworks`, bearer(clerk("stranger")))).status, 401);
  // CODEX › FACTIONS' Keywords (issue #46): keyword records and the ones sub-factions fill in, GM only.
  const factionPresets = await get(`/campaigns/${campaignId}/faction-presets`, bearer(gmClerk));
  assert.equal(factionPresets.status, 200);
  const { keywords, presets: printed } = (await factionPresets.json()) as FactionPresets;
  assert.ok(
    keywords.some((k) => k.name === "ORK" && k.text),
    "ORK, with its glossary text (Core p.377)",
  );
  assert.ok(
    keywords.some((k) => k.name === "SPACE WOLVES"),
    "a sub-faction's Keyword",
  );
  assert.equal(new Set(keywords.map((k) => k.name)).size, keywords.length, "each Keyword once");
  assert.equal(
    (await get(`/campaigns/${campaignId}/faction-presets`, { cookie: `wg_token=${issued.token}` })).status,
    403,
  );
  assert.equal((await get(`/campaigns/${campaignId}/faction-presets`, bearer(clerk("stranger")))).status, 401);
  // A Keyword the books don't list saves as typed, and a faction never reaches a phone.
  const kommandos = await gm.send({
    type: "codex.save",
    kind: "faction",
    data: { name: "Gutshiva's Kommandos", keywords: ["ORK", "KOMMANDO"], stance: "enemy" },
  });
  assert.ok(kommandos.ok);
  await eventually(
    () =>
      gm
        .codex()
        ?.factions.find((f) => f.id === kommandos.id)
        ?.keywords.join() === "ORK,KOMMANDO",
    "a write-in Keyword survives the save",
  );
  assert.equal(player.codex()?.factions.length, 0, "factions never reach a phone");
  // ADD FROM BOOK: Core's Orks (p.80) come in with the ORK Keyword and the cite opening the notes.
  const orks = await gm.send({
    type: "codex.save",
    kind: "faction",
    data: presetFaction(printed.find((p) => p.id === "orks")!),
  });
  assert.ok(orks.ok);
  await eventually(() => {
    const f = gm.codex()?.factions.find((x) => x.id === orks.id);
    return f?.keywords.join() === "ORK" && f.notes.startsWith("Core p.80") && f.stance === "neutral";
  }, "a printed faction saves with its Keyword and cite");
  assert.ok(!printed.some((p) => p.source === "apocrypha"), "no homebrew factions unless the campaign allows them");
  // ROLL NAME and ROLL LOOK (issue #48): the name and appearance tables, GM only, no homebrew books unless allowed.
  const flavour = await get(`/campaigns/${campaignId}/flavour`, bearer(gmClerk));
  assert.equal(flavour.status, 200);
  const flavourList = (await flavour.json()) as FlavourTable[];
  assert.ok(
    ["human-names", "asuryani-names", "eye-colour", "hair-colour", "features"].every((id) =>
      flavourList.some((t) => t.id === id),
    ),
  );
  assert.ok(
    !flavourList.some((t) => t.id === "custodian-names" || t.id === "drukhari-names-apocrypha" || t.id === "age"),
  );
  assert.ok(rollLook({ tables: flavourList, species: "aeldari" })?.line, "the tables roll a look");
  assert.equal((await get(`/campaigns/${campaignId}/flavour`, { cookie: `wg_token=${issued.token}` })).status, 403);
  assert.equal((await get(`/campaigns/${campaignId}/flavour`, bearer(clerk("stranger")))).status, 401);
  // CODEX › NPCS (issue #47): printed NPCs, GM only. The catalogue's patrons come in with their cite.
  const npcPresets = await get(`/campaigns/${campaignId}/npc-presets`, bearer(gmClerk));
  assert.equal(npcPresets.status, 200);
  const printedNpcs = (await npcPresets.json()) as NpcPreset[];
  assert.equal((await get(`/campaigns/${campaignId}/npc-presets`, { cookie: `wg_token=${issued.token}` })).status, 403);
  assert.equal((await get(`/campaigns/${campaignId}/npc-presets`, bearer(clerk("stranger")))).status, 401);
  const fylamon = await gm.send({
    type: "codex.save",
    kind: "npc",
    data: presetNpc(
      printedNpcs.find((p) => p.id === "lord-militant-taleria-fylamon")!,
      [],
    ),
  });
  assert.ok(fylamon.ok);
  await eventually(() => {
    const n = gm.codex()?.npcs.find((x) => x.id === fylamon.id);
    return n?.gmNotes === "Core p.312" && n.role === "Patron" && !n.revealed && !n.description;
  }, "a patron saves hidden, with its cite and no printed text");
  // Both stat sources round-trip: a Quick NPC with a specialty (rules-flow §11.87) and a bestiary threat.
  for (const statSource of [
    { kind: "quick", tier: 3, specialty: { skill: "Ballistic Skill", dice: 10 } },
    { kind: "bestiary", threatId: "gutshiva" },
  ] as const) {
    const r = await gm.send({
      type: "codex.save",
      kind: "npc",
      data: { name: `Stats ${statSource.kind}`, statSource },
    });
    assert.ok(r.ok);
    await eventually(
      () => isDeepStrictEqual(gm.codex()?.npcs.find((x) => x.id === r.id)?.statSource, statSource),
      `a ${statSource.kind} stat source comes back unchanged`,
    );
  }
  // A revealed NPC reaches a phone with its Attitude (§11.89), and without stats, GM notes or secrets.
  const sentry = await gm.send({
    type: "codex.save",
    kind: "npc",
    data: {
      name: "Sentry",
      attitude: "hostile",
      gmNotes: "x",
      secrets: "y",
      statSource: { kind: "bestiary", threatId: "gutshiva" },
      revealed: true,
    },
  });
  assert.ok(sentry.ok);
  await eventually(() => {
    const n = player.codex()?.npcs.find((x) => x.id === sentry.id);
    return n?.attitude === "hostile" && n.statSource.kind === "none" && !n.gmNotes && !n.secrets;
  }, "a phone gets the Attitude, not the stats or notes");
  // The rules reference is book text for any seat: a guest player reads it, a stranger doesn't. An entry from the
  // Gamemaster chapter reaches only the GM (§11.74).
  const rules = await get(`/campaigns/${campaignId}/rules`, { cookie: `wg_token=${issued.token}` });
  assert.equal(rules.status, 200);
  const playerRules = ((await rules.json()) as RuleEntry[]).map((r) => r.id);
  assert.ok(playerRules.length > 50 && playerRules.includes("test-shifting"));
  assert.ok(!playerRules.includes("test-fail-forward"), "Fail Forward is the GM's");
  assert.ok(!playerRules.includes("character-ruin"), "so is Ruin (§11.76)");
  assert.ok(playerRules.includes("character-complications"), "Complications are in the Rules chapter");
  const gmRules = (await (await get(`/campaigns/${campaignId}/rules`, bearer(gmClerk))).json()) as RuleEntry[];
  assert.ok(gmRules.some((r) => r.id === "test-fail-forward") && gmRules.some((r) => r.id === "character-ruin"));
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

  assert.ok(
    (
      await gm.send({
        type: "campaign.update",
        framework: "Deathwatch",
        frameworkBonus: "+1 die",
        patron: "Ordo Xenos",
        kind: [" combat heavy "],
        limits: ["body horror"],
      })
    ).ok,
  );
  await gm.until(
    (s) =>
      s.campaign.framework === "Deathwatch" &&
      s.campaign.frameworkBonus === "+1 die" &&
      s.campaign.patron === "Ordo Xenos" &&
      s.campaign.kind[0] === "combat heavy" && // trimmed
      s.campaign.limits[0] === "body horror",
  );
  // A table line is short, and there are at most 12 (rules-flow §11.79).
  assert.equal((await gm.send({ type: "campaign.update", limits: ["x".repeat(61)] })).ok, false);
  assert.equal((await gm.send({ type: "campaign.update", kind: Array(13).fill("x") })).ok, false);

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
  const seenState = await player.until((s) => !!threatOf(s));
  const seen = threatOf(seenState)!;
  assert.deepEqual([seen.threatId, seen.personalRuin, seen.stats], ["", 0, null]);
  // The whole table agreed the limits, so every phone has them (MISSION).
  assert.deepEqual(seenState.campaign.limits, ["body horror"]);
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
  // A beat added after a reorder goes last, not into a tie with the first beat at order 0.
  const b3 = await gm.send({ type: "codex.save", kind: "beat", data: { adventureId: adv.id, title: "Aftermath" } });
  assert.ok(b3.ok && b3.id);
  await eventually(
    () =>
      gm
        .codex()
        ?.adventures[0]?.beats.map((x) => `${x.id}:${x.order}`)
        .join() === `${b2.id}:0,${b1.id}:1,${b3.id}:2`,
    "new beat goes last",
  );
  // Exits lead to a scene of the same adventure (issue #38). Deleting the target keeps the label, so the source scene's
  // DONE and SET ACTIVE, which re-send the whole beat, still save.
  const elsewhere = await gm.send({ type: "codex.save", kind: "adventure", data: { title: "Elsewhere" } });
  assert.ok(elsewhere.ok && elsewhere.id);
  const away = await gm.send({ type: "codex.save", kind: "beat", data: { adventureId: elsewhere.id, title: "Away" } });
  const theirAdv = await other.send({ type: "codex.save", kind: "adventure", data: { title: "Not yours" } });
  assert.ok(away.ok && away.id && theirAdv.ok && theirAdv.id);
  const theirs = await other.send({ type: "codex.save", kind: "beat", data: { adventureId: theirAdv.id, title: "X" } });
  assert.ok(theirs.ok && theirs.id);
  const meetVex = { adventureId: adv.id, title: "Meet Vex", npcIds: [vex.id] };
  for (const beatId of [crypto.randomUUID(), theirs.id, away.id])
    assert.deepEqual(
      await gm.send({
        type: "codex.save",
        kind: "beat",
        id: b1.id,
        data: { ...meetVex, exits: [{ label: "x", beatId }] },
      }),
      { ok: false, error: "Exit scene not found" },
    );
  const exits = [{ label: "If they side with Vex", beatId: b3.id }, { label: "If they run" }];
  const saved = await gm.send({
    type: "codex.save",
    kind: "beat",
    id: b1.id,
    data: { ...meetVex, goal: "Learn what Vex wants", exits },
  });
  assert.ok(saved.ok);
  const exitsOf = () =>
    gm
      .codex()
      ?.adventures[0]?.beats.find((x) => x.id === b1.id)
      ?.exits.map((e) => `${e.label}>${e.beatId}`)
      .join();
  await eventually(() => exitsOf() === `If they side with Vex>${b3.id},If they run>null`, "exits saved");
  assert.ok((await gm.send({ type: "codex.delete", kind: "beat", id: b3.id })).ok);
  await eventually(
    () => exitsOf() === "If they side with Vex>null,If they run>null",
    "a deleted target keeps its label",
  );
  const { id: _id, order: _order, ...kept } = gm.codex()!.adventures[0]!.beats.find((x) => x.id === b1.id)!;
  assert.equal(kept.goal, "Learn what Vex wants");
  assert.ok((await gm.send({ type: "codex.save", kind: "beat", id: b1.id, data: { ...kept, status: "active" } })).ok);
  assert.equal(player.codex()?.adventures.length, 0, "scenes never reach a phone");
  // Scene Tests (issue #39): the kind sets the pool, and a combination the book doesn't have is refused.
  const tested = await gm.send({
    type: "codex.save",
    kind: "beat",
    id: b1.id,
    data: {
      ...kept,
      tests: [
        { kind: "skill", skill: "Insight", dn: 5, who: "each", shifts: ["She lies about the gallery"] },
        { kind: "opposed", skill: "Persuasion" },
      ],
    },
  });
  assert.ok(tested.ok);
  await eventually(
    () =>
      gm
        .codex()
        ?.adventures[0]?.beats.find((x) => x.id === b1.id)
        ?.tests.map((x) => `${x.kind}:${x.skill}:${x.dn}:${x.shifts.length}`)
        .join() === "skill:Insight:5:1,opposed:Persuasion:null:0",
    "scene Tests saved",
  );
  const bad = await gm.send({
    type: "codex.save",
    kind: "beat",
    id: b1.id,
    data: { ...kept, tests: [{ kind: "opposed", skill: "Persuasion", dn: 3 }] },
  });
  assert.ok(!bad.ok && bad.error.includes("An Opposed Test has no DN"), "an Opposed Test with a DN is refused");
  // Scene Ruin and Glory (issue #40): earned lines and planned spends, a spend with its pool and cost.
  const pooled = await gm.send({
    type: "codex.save",
    kind: "beat",
    id: b1.id,
    data: {
      ...kept,
      ruin: [{ text: "Each failed Survival Test" }],
      glory: [{ text: "They spare the courier", amount: 2 }],
      spends: [{ pool: "glory", name: "Covering Fire", cost: 1 }],
    },
  });
  assert.ok(pooled.ok);
  await eventually(() => {
    const x = gm.codex()?.adventures[0]?.beats.find((y) => y.id === b1.id);
    return x?.ruin[0]?.amount === 1 && x.glory[0]?.amount === 2 && x.spends[0]?.text === "";
  }, "scene Ruin and Glory saved");
  const costless = { ...kept, spends: [{ pool: "ruin", name: "Sniper" }] };
  assert.equal((await gm.send({ type: "codex.save", kind: "beat", id: b1.id, data: costless })).ok, false, "no cost");
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
  // Standing weapon effects (rules-flow.md §11.68) are applied on read: Bolter Discipline gives the Occulus Bolt
  // Carbine's Rapid Fire (1) +Rank, at Rank 1 here.
  const carbine = (c: { stats: { weapons: { name: string; traits: string[]; effects?: string[] }[] } }) =>
    c.stats.weapons.find((w) => w.name === "Occulus Bolt Carbine")!;
  assert.ok(carbine(veyl).traits.includes("Rapid Fire (2)"), JSON.stringify(carbine(veyl)));
  assert.deepEqual(carbine(veyl).effects, ["Bolter Discipline"]);
  // The effects carry book prose (their notes and `gm` mods), so an invite holder without a seat sees the numbers only.
  const veylInvite = await gm.send({ type: "invite.create", mode: "character", characterId: made.id! });
  assert.ok(veylInvite.ok && veylInvite.token);
  const previewed = ((await (await get(`/invites/${veylInvite.token}`)).json()) as { character: Character }).character;
  assert.equal(previewed.stats.weaponEffects, undefined);
  assert.ok(previewed.stats.weapons.every((w) => !w.effects && !w.notes));
  assert.ok(carbine(previewed).traits.includes("Rapid Fire (2)"), "the profile stays");
  assert.ok(veyl.builtAt && veyl.builtAt <= Date.now(), "the save is stamped, so older device drafts go stale");
  assert.equal(veyl.xpSpent, 0, "a character just made has spent no XP in play");

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
  const first = await gm.send({ type: "session.start" });
  assert.ok(first.ok);
  assert.equal(first.notices, undefined, "nothing earned yet, so nothing to nudge about");
  assert.ok((await gm.send({ type: "session.end", xp: 40, recap: "" })).ok);
  assert.ok((await player.send({ type: "character.supply", id: made.id!, wealth: -1 })).ok);
  const before = (await gm.until((s) => s.characters.find((c) => c.id === made.id)?.xp === 40)).characters.find(
    (c) => c.id === made.id,
  )!;
  // 40 XP is Rank 2 (Core p.146): the line follows with no rebuild, because the Rank is read, not stored.
  assert.ok(carbine(before).traits.includes("Rapid Fire (3)"), JSON.stringify(carbine(before)));
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
  // What advancement spent is stored, so a sheet shows the XP left without resolving the build (#15 step 5).
  assert.equal(advanced.xpSpent, SKILL_XP[6]! - SKILL_XP[5]!, "Stealth 5 → 6, priced from where creation left it");

  // The purchase history (§11.69): bought between sessions, so it belongs to the session whose XP paid for it.
  const historyOf = (c: Character) =>
    (c.build?.advancement as { boughtIn?: Record<string, number> } | undefined)?.boughtIn;
  assert.deepEqual(historyOf(advanced), { "advance/skill/Stealth/6": 1 });

  // XP is spent between sessions (Core p.146), so the next session's start names whoever still has some (issue #32).
  const nudged = await gm.send({ type: "session.start" });
  assert.ok(nudged.ok);
  assert.deepEqual(nudged.notices, [
    `Unspent XP: Veyl ${40 - (SKILL_XP[6]! - SKILL_XP[5]!)} — ADVANCE spends it (Core p.146, p.148)`,
  ]);

  // A date is the server's: a client that makes one up is ignored, and what is bought now is stamped with session 2.
  assert.ok(
    (
      await player.send({
        type: "character.build",
        id: made.id,
        build: {
          ...disruptor,
          advancement: {
            skills: { Stealth: 6 },
            languages: ["glossia"],
            boughtIn: { "advance/skill/Stealth/6": 99, "advance/language/glossia": 99 },
          },
        },
      })
    ).ok,
  );
  const learned = (
    await gm.until((s) => !!historyOf(s.characters.find((c) => c.id === made.id)!)?.["advance/language/glossia"])
  ).characters.find((c) => c.id === made.id)!;
  assert.deepEqual(historyOf(learned), { "advance/skill/Stealth/6": 1, "advance/language/glossia": 2 });

  // A purchase taken back takes its date with it.
  assert.ok(
    (
      await player.send({
        type: "character.build",
        id: made.id,
        build: { ...disruptor, advancement: { skills: { Stealth: 6 } } },
      })
    ).ok,
  );
  const pruned = (
    await gm.until((s) => !historyOf(s.characters.find((c) => c.id === made.id)!)?.["advance/language/glossia"])
  ).characters.find((c) => c.id === made.id)!;
  assert.deepEqual(historyOf(pruned), { "advance/skill/Stealth/6": 1 });

  // A sheet written in another hand (a pregen's printed lines, issue #18) survives a save with no build changes: the
  // rebuild adds only what the build adds over the stored one. The new name marks the save's broadcast.
  const printed = {
    ...advanced.stats,
    // Written by hand: no catalogue entry, so no upgrades or Talents applied to it (rules-flow.md §11.68). A line the
    // table shows carries those marks, and the server would put back the stored one in its place (storedProfiles).
    weapons: advanced.stats.weapons.map(
      ({ wargearId: _id, upgrades: _u, upgradeNames: _n, effects: _e, notes: _no, ...w }) => ({
        ...w,
        name: `${w.name} (printed)`,
      }),
    ),
  };
  assert.ok((await gm.send({ type: "character.update", id: made.id, stats: printed })).ok);
  const unchanged = { ...disruptor, advancement: { skills: { Stealth: 6 } } };
  assert.ok((await gm.send({ type: "character.build", id: made.id, name: "Veyl II", build: unchanged })).ok);
  const resaved = (
    await gm.until((s) => s.characters.find((c) => c.id === made.id)?.name === "Veyl II")
  ).characters.find((c) => c.id === made.id)!;
  assert.deepEqual(resaved.stats.weapons, printed.weapons);

  // keepSheet (GM only): a first build over a hand-made sheet keeps its armour and gear lines, in the same action. Its
  // weapons are the build's, with their Talents applied on read; a hand-written one the build has none of by name (a
  // GM's own profile) stays (rules-flow.md §11.68).
  assert.deepEqual(await player.send({ type: "character.build", id: made.id, build: unchanged, keepSheet: true }), {
    ok: false,
    error: "GM only",
  });
  const sheet = await gm.send({ type: "character.create", name: "Hand-made", stats: printed });
  assert.ok(sheet.ok && sheet.id);
  assert.ok((await gm.send({ type: "character.build", id: sheet.id, build: disruptor, keepSheet: true })).ok);
  const attached = (await gm.until((s) => !!s.characters.find((c) => c.id === sheet.id)?.build)).characters.find(
    (c) => c.id === sheet.id,
  )!;
  const names = attached.stats.weapons.map((w) => w.name);
  // The "(printed)" lines have no counterpart by name, so they stay exactly as written (keepSheetWeapons).
  for (const w of printed.weapons)
    assert.deepEqual(
      attached.stats.weapons.find((a) => a.name === w.name),
      w,
      `${w.name} stays as written`,
    );
  assert.ok(names.includes("Occulus Bolt Carbine"), "the build's weapons join them");
  assert.deepEqual(attached.stats.gear, printed.gear, "the hand-made gear lines stay");
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
  const seatless = ((await (await get("/rules", bearer(owner))).json()) as RuleEntry[]).map((r) => r.id);
  assert.ok(seatless.length > 0 && !seatless.includes("test-fail-forward"), "no seat, no Gamemaster chapter");

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

test("ADD FROM BOOK copies a printed place and the places inside it (issue #50)", async (t) => {
  const gm = await newCampaign("Places", 3);
  t.after(() => gm.socket.close());
  const path = `/campaigns/${gm.campaignId}/places`;
  const res = await get(path, bearer(gm.gmClerk));
  assert.equal(res.status, 200);
  const list = (await res.json()) as PlaceSummary[];
  const primus = list.find((p) => p.id === "core-gilead-primus")!;
  assert.deepEqual(Object.keys(primus).sort(), ["id", "name", "page", "parentId", "source"], "no printed text");
  assert.equal((await get(path, bearer(clerk("stranger")))).status, 401);

  const sector = await gm.send({ type: "codex.save", kind: "location", data: { name: "Sector", revealed: true } });
  assert.ok(sector.ok && sector.id);
  const added = await gm.send({ type: "codex.addPlaces", placeId: primus.id, parentId: sector.id });
  assert.ok(added.ok && added.id);
  await eventually(() => (gm.codex()?.locations.length ?? 0) > 2, "the copied places");
  const world = gm.codex()!.locations.find((l) => l.id === added.id)!;
  const inside = gm.codex()!.locations.filter((l) => l.parentId === world.id);
  assert.equal(world.parentId, sector.id);
  assert.equal(world.name, primus.name);
  assert.deepEqual([world.revealed, world.description], [false, ""], "hidden, and DESCRIPTION is the GM's to write");
  assert.equal(world.gmNotes.split("\n", 1)[0], "Core p.304", "GM NOTES open with the cite");
  assert.deepEqual(
    inside.map((l) => l.name),
    list.filter((p) => p.parentId === primus.id).map((p) => p.name),
    "the places inside come along, nested",
  );

  assert.deepEqual(await gm.send({ type: "codex.addPlaces", placeId: "nope", parentId: null }), {
    ok: false,
    error: 'Unknown place "nope"',
  });
  assert.deepEqual(await gm.send({ type: "codex.addPlaces", placeId: primus.id, parentId: crypto.randomUUID() }), {
    ok: false,
    error: "Parent location not found",
  });

  const kael = await gm.send({ type: "character.create", name: "Kael" });
  assert.ok(kael.ok && kael.id);
  const token = await gm.send({ type: "token.issue", characterId: kael.id });
  assert.ok(token.ok && token.token);
  assert.equal((await get(path, { cookie: `wg_token=${token.token}` })).status, 403);
  const phone = connect({ auth: { token: token.token } });
  t.after(() => phone.socket.close());
  await eventually(() => !!phone.codex(), "the player's codex");
  assert.deepEqual(await phone.send({ type: "codex.addPlaces", placeId: primus.id, parentId: null }), {
    ok: false,
    error: "GM only",
  });
  // Only the revealed Sector reaches the phone; the copies start hidden, and their text never leaves the GM's seat.
  assert.deepEqual(
    phone.codex()!.locations.map((l) => [l.name, l.gmNotes]),
    [["Sector", ""]],
  );
});

test("the Space Hulk Generator writes a hulk with its rooms, and rooms into a place (issue #50 step 8)", async (t) => {
  const gm = await newCampaign("Hulk", 3);
  t.after(() => gm.socket.close());
  const res = await get(`/campaigns/${gm.campaignId}/scene-presets`, bearer(gm.gmClerk));
  const g = ((await res.json()) as ScenePresets).spaceHulk!;
  const [o1, o2] = g.origin.rows as [HulkRow, HulkRow];
  const [r1, r2, r3] = g.rooms.rows as [HulkRow, HulkRow, HulkRow];
  const hazard = "rr1-space-hulk-genestealer-trap";
  const hulk = { origins: [o1.id, o2.id], occupants: g.occupants.rows[0]!.id, objective: g.objectives.rows[0]!.id };

  const made = await gm.send({
    type: "codex.addHulk",
    hulk: { name: "The Wreck", ...hulk, hazards: [hazard] },
    rooms: [r1.id, r2.id, r1.id],
  });
  assert.ok(made.ok && made.id);
  await eventually(() => (gm.codex()?.locations.length ?? 0) === 4, "the hulk and its rooms");
  const wreck = gm.codex()!.locations.find((l) => l.id === made.id)!;
  assert.deepEqual([wreck.name, wreck.parentId, wreck.revealed, wreck.description], ["The Wreck", null, false, ""]);
  assert.equal(wreck.gmNotes.split("\n", 1)[0], "RR1 p.6", "GM NOTES open with the cite");
  assert.ok(wreck.gmNotes.includes(`ORIGIN: ${o2.name}`), "every origin rolled (§11.103)");
  assert.deepEqual(
    wreck.hazardList.map((h) => h.kind === "book" && [h.hazardId, h.variant]),
    [[hazard, null]],
    "Stage 4 goes on the hulk's hazard list (§11.102)",
  );
  const rooms = () => gm.codex()!.locations.filter((l) => l.parentId === wreck.id);
  assert.deepEqual(
    rooms().map((l) => l.name),
    [r1.name, r2.name, r1.name],
    "rooms in the order rolled; a repeat is a second room",
  );
  assert.equal(rooms()[0]!.gmNotes.split("\n", 1)[0], `RR1 p.${r1.page}`);

  // ROOMS FOR A PLACE: more rooms inside the hulk later, and no new hulk.
  const more = await gm.send({ type: "codex.addHulk", parentId: wreck.id, hulk: null, rooms: [r3.id] });
  assert.deepEqual(more, { ok: true, id: wreck.id });
  await eventually(() => rooms().length === 4, "the later room");

  const refused = async (a: object, error: string) =>
    assert.deepEqual(await gm.send({ type: "codex.addHulk", hulk: null, rooms: [], ...a } as ActionInput), {
      ok: false,
      error,
    });
  await refused({ rooms: [r1.id] }, "Pick a room, and the place it goes inside");
  await refused({ parentId: wreck.id }, "Pick a room, and the place it goes inside");
  await refused({ parentId: wreck.id, rooms: [o1.id] }, `"${o1.id}" isn't on the Rooms Table`);
  await refused({ hulk: { name: "X", ...hulk, origins: [r1.id] } }, `"${r1.id}" isn't on the Origin Table`);
  await refused(
    { hulk: { name: "X", ...hulk, hazards: ["threat-assessment-space-hulk-1"] } },
    `"threat-assessment-space-hulk-1" isn't on the space hulk Hazards Table`,
  );
  await refused({ parentId: crypto.randomUUID(), rooms: [r1.id] }, "Parent location not found");
  assert.equal(gm.codex()!.locations.length, 5, "a refusal writes nothing");

  const kael = await gm.send({ type: "character.create", name: "Kael" });
  assert.ok(kael.ok && kael.id);
  const token = await gm.send({ type: "token.issue", characterId: kael.id });
  assert.ok(token.ok && token.token);
  const phone = connect({ auth: { token: token.token } });
  t.after(() => phone.socket.close());
  await eventually(() => !!phone.codex(), "the player's codex");
  assert.deepEqual(await phone.send({ type: "codex.addHulk", parentId: wreck.id, hulk: null, rooms: [r1.id] }), {
    ok: false,
    error: "GM only",
  });
  assert.deepEqual(phone.codex()!.locations, [], "the hulk starts hidden, its text on the GM's seat only");
});

test("items: what the Agents can find, in a place, with an NPC or on a scene (issue #51)", async (t) => {
  const gm = await newCampaign("Items", 3);
  const other = await newCampaign("Items elsewhere", 3);
  t.after(() => (gm.socket.close(), other.socket.close()));
  const id = async (r: Promise<ActionResult>) => {
    const x = await r;
    assert.ok(x.ok && x.id, JSON.stringify(x));
    return x.id;
  };
  const save = (kind: string, data: object, rowId?: string) =>
    gm.send({ type: "codex.save", kind, data, ...(rowId ? { id: rowId } : {}) } as never);
  const shaft = await id(save("location", { name: "Shaft" }));
  const tull = await id(save("npc", { name: "Magos Tull" }));
  const theirs = await id(other.send({ type: "codex.save", kind: "location", data: { name: "Elsewhere" } }));
  const theirItem = await id(other.send({ type: "codex.save", kind: "item", data: { name: "Not yours" } }));

  const refused = async (a: Promise<ActionResult>, error: string) => assert.deepEqual(await a, { ok: false, error });
  await refused(save("item", { name: "X", wargearId: "nope" }), 'Unknown wargear "nope"');
  await refused(save("item", { name: "X", locationId: theirs }), "Location not found");
  await refused(
    save("item", { name: "X", locationId: shaft, npcId: tull }),
    "X lies in a place or is carried by an NPC, not both",
  );
  const pistol = await id(save("item", { name: "Bolt Pistol", wargearId: "bolt-pistol", locationId: shaft }));
  const oil = await id(save("item", { name: "Sacred Machine Oil", npcId: tull }));
  const adv = await id(save("adventure", { title: "Dig" }));
  await refused(save("beat", { adventureId: adv, title: "X", itemIds: [theirItem] }), "Item not found");
  await id(save("beat", { adventureId: adv, title: "Down the shaft", itemIds: [pistol, oil] }));
  await eventually(() => gm.codex()?.items.length === 2, "the items");
  assert.deepEqual(
    gm.codex()!.items.map((i) => [i.name, i.wargearId, i.locationId, i.npcId, i.givenTo]),
    [
      ["Bolt Pistol", "bolt-pistol", shaft, null, null],
      ["Sacred Machine Oil", null, null, tull, null],
    ],
  );

  // An export carries the items, and an import remaps where they lie and who has them.
  const file = await (await get(`/campaigns/${gm.campaignId}/export`, bearer(gm.gmClerk))).json();
  assert.equal(file.codex.items.length, 2);
  const unknown = structuredClone(file);
  unknown.codex.items[0].wargearId = "nope";
  assert.equal((await post("/campaigns/import", { file: unknown }, bearer(gm.gmClerk))).status, 400);
  const twoHolders = structuredClone(file);
  twoHolders.codex.items[0].npcId = tull;
  assert.equal((await post("/campaigns/import", { file: twoHolders }, bearer(gm.gmClerk))).status, 400);
  const r = await post("/campaigns/import", { file }, bearer(gm.gmClerk));
  assert.equal(r.status, 201);
  const copy = connect({ auth: { campaignId: (await r.json()).campaignId, clerkToken: gm.gmClerk } });
  t.after(() => copy.socket.close());
  await eventually(() => copy.codex()?.items.length === 2, "the imported items");
  const cx = copy.codex()!;
  assert.deepEqual(
    cx.items.map((i) => [i.locationId, i.npcId]),
    [
      [cx.locations[0]!.id, null],
      [null, cx.npcs[0]!.id],
    ],
  );
  assert.deepEqual(
    cx.adventures[0]!.beats[0]!.itemIds,
    cx.items.map((i) => i.id),
  );

  // Deleting an NPC leaves its item loose; deleting an item takes it off its scenes.
  assert.ok((await gm.send({ type: "codex.delete", kind: "npc", id: tull })).ok);
  await eventually(() => gm.codex()!.items[1]!.npcId === null, "the item is loose");
  assert.ok((await gm.send({ type: "codex.delete", kind: "item", id: pistol })).ok);
  await eventually(() => gm.codex()!.adventures[0]!.beats[0]!.itemIds.join() === oil, "the scene lists the rest");

  // Players see no item list.
  const kael = await id(gm.send({ type: "character.create", name: "Kael" }));
  const token = await gm.send({ type: "token.issue", characterId: kael });
  assert.ok(token.ok && token.token);
  const phone = connect({ auth: { token: token.token } });
  t.after(() => phone.socket.close());
  await eventually(() => !!phone.codex(), "the player's codex");
  assert.deepEqual(phone.codex()!.items, []);
  await refused(phone.send({ type: "codex.save", kind: "item", data: { name: "Mine" } }), "GM only");
});

test("GIVE and TAKE BACK: a found item onto an Agent's sheet and off it again (issue #51)", async (t) => {
  const gm = await newCampaign("Give", 3);
  t.after(() => gm.socket.close());
  const id = async (r: Promise<ActionResult>) => {
    const x = await r;
    assert.ok(x.ok && x.id, JSON.stringify(x));
    return x.id;
  };
  const refused = async (a: Promise<ActionResult>, error: string) => assert.deepEqual(await a, { ok: false, error });
  const newItem = (data: object) => id(gm.send({ type: "codex.save", kind: "item", data } as never));
  const give = (who: string, itemId: string) => gm.send({ type: "character.giveItem", id: who, itemId });
  const take = (who: string, itemId: string) => gm.send({ type: "character.takeItem", id: who, itemId });
  const nextSession = async () => {
    assert.ok((await gm.send({ type: "session.end", xp: 0, recap: "" })).ok);
    assert.ok((await gm.send({ type: "session.start" })).ok);
  };
  const sheet = (who: string) => gm.until(() => true).then((s) => s.characters.find((c) => c.id === who)!.stats);
  const itemOf = (itemId: string) => gm.codex()!.items.find((i) => i.id === itemId)!;

  const kael = await id(gm.send({ type: "character.create", name: "Kael" }));
  const vex = await id(gm.send({ type: "character.create", name: "Vex" }));
  const shaft = await id(gm.send({ type: "codex.save", kind: "location", data: { name: "Shaft" } }));
  const pistol = await newItem({ name: "Bolt Pistol", wargearId: "bolt-pistol", locationId: shaft });
  const scope = await newItem({ name: "Magnocular Scope", wargearId: "magnocular-scope" });
  const sight = await newItem({ name: "Red-Dot Sight", wargearId: "red-dot-sight" });
  const slate = await newItem({ name: "Surveyor's Slate" });
  const frag = await newItem({ name: "Frag Grenade", wargearId: "frag-grenade" });
  const relic = await newItem({
    name: "Saint's Laspistol",
    wargearId: "laspistol",
    mods: [{ kind: "damage", delta: 1 }],
  });

  await refused(
    give(kael, pistol),
    "Start a session first: giving an item uses the Agent's Wargear Test (rules-flow.md §11.112)",
  );
  assert.ok((await gm.send({ type: "session.start" })).ok);
  await refused(
    give(kael, frag),
    "Frag Grenade is counted by type on the sheet: award it with SUPPLY or a requisition (rules-flow.md §11.113)",
  );
  const token = await gm.send({ type: "token.issue", characterId: kael });
  assert.ok(token.ok && token.token);
  const phone = connect({ auth: { token: token.token } });
  t.after(() => phone.socket.close());
  await eventually(() => !!phone.codex(), "the player's codex");
  await refused(phone.send({ type: "character.giveItem", id: kael, itemId: pistol }), "GM only");
  await refused(phone.send({ type: "character.takeItem", id: kael, itemId: pistol }), "GM only");

  // A catalogue weapon joins the armament with its wargearId; the item leaves its place and records the Agent.
  assert.ok((await give(kael, pistol)).ok);
  const armed = await gm.until((s) => !!s.characters.find((c) => c.id === kael)?.stats.weapons.length);
  const bolt = armed.characters.find((c) => c.id === kael)!.stats.weapons[0]!;
  assert.deepEqual([bolt.name, bolt.wargearId], ["Bolt Pistol", "bolt-pistol"]);
  await eventually(() => itemOf(pistol).givenTo === kael, "the codex records the gift");
  assert.equal(itemOf(pistol).locationId, null);
  await refused(give(kael, scope), "Kael already made this session's wargear Test (p.205)");
  await refused(give(vex, pistol), "Bolt Pistol was given already: take it back first");
  await refused(
    gm.send({ type: "codex.save", kind: "item", id: pistol, data: { name: "Bolt Pistol", locationId: shaft } }),
    "Bolt Pistol is with an Agent now: take it back first",
  );
  // TAKE BACK finds the sheet line by the item's name and entry, so those stay as given; its notes don't.
  await refused(
    gm.send({ type: "codex.save", kind: "item", id: pistol, data: { name: "Ordo Pistol", wargearId: "bolt-pistol" } }),
    "Bolt Pistol is with an Agent now: take it back first",
  );
  assert.ok(
    (
      await gm.send({
        type: "codex.save",
        kind: "item",
        id: pistol,
        data: { name: "Bolt Pistol", wargearId: "bolt-pistol", gmNotes: "Maren wants it back" },
      })
    ).ok,
  );
  // The same weapon again would be a silent no-op, and TAKE BACK would then take the Agent's own (§11.118).
  await nextSession();
  const spare = await newItem({ name: "Bolt Pistol", wargearId: "bolt-pistol" });
  await refused(give(kael, spare), "Kael already carries a Bolt Pistol (rules-flow.md §11.118)");

  // Other kinds become a gear line with the cite; a custom item a plain line; a full gear list refuses.
  assert.ok((await give(kael, scope)).ok);
  await gm.until(
    (s) => !!s.characters.find((c) => c.id === kael)?.stats.gear.some((g) => g.startsWith("Magnocular Scope (")),
  );
  const full = Array.from({ length: 60 }, (_, i) => `line ${i}`);
  assert.ok((await gm.send({ type: "character.update", id: vex, stats: { gear: full } })).ok);
  await refused(give(vex, slate), "Vex's gear list is full (60 lines)");
  assert.ok((await gm.send({ type: "character.update", id: vex, stats: { gear: [] } })).ok);
  assert.ok((await give(vex, slate)).ok);
  await gm.until((s) => s.characters.find((c) => c.id === vex)?.stats.gear.join() === "Surveyor's Slate");

  // A relic's Powers show on the table's sheet and stay stored beside the printed profile (§11.116).
  await nextSession();
  assert.ok((await give(vex, relic)).ok);
  const shown = await gm.until((s) => !!s.characters.find((c) => c.id === vex)?.stats.weapons.length);
  const las = shown.characters.find((c) => c.id === vex)!.stats.weapons[0]!;
  assert.equal(las.damage, wargear.get("laspistol")!.weapon!.damage + 1);

  // TAKE BACK: the weapon comes off and its fitted upgrade returns as a gear line (§11.114).
  assert.ok(
    (
      await gm.send({
        type: "character.fitUpgrade",
        id: kael,
        host: "weapon",
        weapon: "Bolt Pistol",
        upgradeId: "red-dot-sight",
      })
    ).ok,
  );
  await refused(take(vex, pistol), "Vex doesn't have Bolt Pistol");
  assert.ok((await take(kael, pistol)).ok);
  const after = await gm.until((s) => !s.characters.find((c) => c.id === kael)?.stats.weapons.length);
  assert.ok(after.characters.find((c) => c.id === kael)!.stats.gear.some((g) => g.startsWith("Red-Dot Sight (")));
  await eventually(() => itemOf(pistol).givenTo === null, "the pistol is loose again");
  // A line the GM already deleted just ends the record.
  assert.ok((await gm.send({ type: "character.update", id: kael, stats: { gear: [] } })).ok);
  assert.ok((await take(kael, scope)).ok);
  await eventually(() => itemOf(scope).givenTo === null, "the scope is loose again");
  // A given upgrade fitted since comes off its weapon.
  await nextSession();
  assert.ok((await give(vex, sight)).ok);
  assert.ok(
    (
      await gm.send({
        type: "character.fitUpgrade",
        id: vex,
        host: "weapon",
        weapon: "Laspistol",
        upgradeId: "red-dot-sight",
      })
    ).ok,
  );
  assert.deepEqual((await sheet(vex)).weapons[0]!.upgradeNames, ["Red-Dot Sight"]);
  assert.ok((await take(vex, sight)).ok);
  await gm.until((s) => !s.characters.find((c) => c.id === vex)?.stats.weapons[0]?.fitted);
  // Deleting the Agent leaves what they were given loose.
  assert.ok((await gm.send({ type: "character.delete", id: vex })).ok);
  await eventually(() => itemOf(relic).givenTo === null && itemOf(slate).givenTo === null, "Vex's items are loose");
});

test("FROM LOOT TABLE: a book row makes loose items with its text in GM NOTES (issue #51)", async (t) => {
  const gm = await newCampaign("Loot", 3);
  t.after(() => gm.socket.close());
  const presets = (await (
    await get(`/campaigns/${gm.campaignId}/scene-presets`, bearer(gm.gmClerk))
  ).json()) as ScenePresets;
  const trinkets = presets.loot.find((x) => x.id === "core-trinkets-1")!;
  const row = trinkets.rows[0]!;
  const refused = async (a: object, error: string) =>
    assert.deepEqual(await gm.send({ type: "codex.addLoot", rowId: row.id, ...a } as ActionInput), {
      ok: false,
      error,
    });
  await refused({ rowId: "nope" }, 'Unknown loot row "nope"');
  await refused(
    { faultId: "rr1-loot-faults-1" },
    '"rr1-loot-faults-1" isn\'t on the fault table for Trinket Table One',
  );
  await refused({ picks: ["laspistol"] }, `Pick 0 catalogue items for ${row.name}`);
  const made = await gm.send({ type: "codex.addLoot", rowId: row.id, roll: row.from });
  assert.ok(made.ok && made.id);
  await eventually(() => gm.codex()?.items.length === 1, "the item");
  const [it] = gm.codex()!.items;
  assert.deepEqual(
    [it!.id, it!.name, it!.wargearId, it!.locationId, it!.givenTo],
    [made.id, row.name, null, null, null],
  );
  assert.ok(
    it!.gmNotes.startsWith(`Core p.${row.page} · ${trinkets.name}, roll ${row.from}: ${row.name}`),
    it!.gmNotes,
  );
  assert.ok(it!.gmNotes.includes(row.text), "the printed result");

  // A pick (RR1 p.18, three Adeptus Mechanicus weapons the GM chooses): the choice must match, and makes one per piece.
  const archaic = "rr1-loot-imperium-2";
  await refused({ rowId: archaic }, "Pick 1 catalogue item for Archaic Weaponry");
  await refused({ rowId: archaic, picks: ["laspistol"] }, "Laspistol isn't one Archaic Weaponry offers");
  await refused(
    { rowId: archaic, picks: ["arc-pistol"], faultId: "core-trinket-1-11" },
    '"core-trinket-1-11" isn\'t on the fault table for Imperium Loot',
  );
  assert.ok(
    (await gm.send({ type: "codex.addLoot", rowId: archaic, picks: ["arc-pistol"], faultId: "rr1-loot-faults-1" })).ok,
  );
  await eventually(() => gm.codex()?.items.length === 4, "three Arc Pistols");
  const arc = gm.codex()!.items.slice(1);
  assert.deepEqual(
    arc.map((i) => i.wargearId),
    ["arc-pistol", "arc-pistol", "arc-pistol"],
  );
  assert.ok(arc[0]!.gmNotes.includes("FAULT (RR1 p."), "the fault rides in the notes");
  // Ammo isn't an item: GIVE refuses it (§11.113), so a row of only Ammo makes nothing and says to award it.
  await refused(
    { rowId: "rr1-loot-imperium-1", picks: ["bolt-ammo"] },
    "Malfunctioning Munitions makes no item: award it in PARTY",
  );

  const kael = await gm.send({ type: "character.create", name: "Kael" });
  assert.ok(kael.ok && kael.id);
  const token = await gm.send({ type: "token.issue", characterId: kael.id });
  assert.ok(token.ok && token.token);
  const phone = connect({ auth: { token: token.token } });
  t.after(() => phone.socket.close());
  await eventually(() => !!phone.codex(), "the player's codex");
  assert.deepEqual(await phone.send({ type: "codex.addLoot", rowId: row.id }), { ok: false, error: "GM only" });
  assert.equal(
    (await get(`/campaigns/${gm.campaignId}/scene-presets`, { cookie: `wg_token=${token.token}` })).status,
    403,
  );
});

test("the Holy Relic creator writes one item from its rolls (RR2 pp.12–19, issue #51 step 8)", async (t) => {
  const gm = await newCampaign("Relic", 3);
  t.after(() => gm.socket.close());
  const relic = {
    type: "codex.addRelic",
    form: "rr2-relic-form-61", // Force Weapon (p.13)
    wargearId: "force-sword",
    owner: "rr2-relic-owner-1",
    anointment: "rr2-relic-anointment-4",
    power: "rr2-power-melee-4", // Holy Hatred: names an enemy
    oddity: "rr2-relic-oddity-1",
    enemy: "rr2-enemy-11",
  } as const;
  const refused = async (a: object, error: string) =>
    assert.deepEqual(await gm.send({ ...relic, ...a } as ActionInput), { ok: false, error });
  await refused({ form: "nope" }, '"nope" isn\'t on the Relic Form');
  await refused({ power: "rr2-power-ranged-1" }, '"rr2-power-ranged-1" isn\'t on the Melee Weapon Relic Powers');
  await refused({ power: "rr2-power-melee-1" }, "Transformative Strength names no enemy");
  await refused({ wargearId: "laspistol" }, "Laspistol isn't a Force Weapon");
  const made = await gm.send(relic);
  assert.ok(made.ok && made.id);
  await eventually(() => gm.codex()?.items.length === 1, "the relic");
  const [it] = gm.codex()!.items;
  assert.deepEqual([it!.name, it!.wargearId, it!.givenTo], ["Relic Force Sword", "force-sword", null]);
  assert.ok(it!.gmNotes.startsWith("RR2 p.12 · Holy Relic"), it!.gmNotes);
  assert.ok(it!.gmNotes.includes("ENEMY: HERETIC") && it!.gmNotes.includes("POWER (melee): Holy Hatred"));
});

test("export and import: a campaign file becomes a new campaign, whole or as a fresh start", async (t) => {
  const gm = await newCampaign("Export", 3);
  t.after(() => gm.socket.close());
  const kael = await gm.send({ type: "character.create", name: "Kael" });
  assert.ok(kael.ok && kael.id);
  assert.ok((await gm.send({ type: "character.adjust", id: kael.id, wounds: 2 })).ok);
  // A catalogue Boltgun with Bolter Discipline: the table shows Rapid Fire (3), the sheet stores (2) (rules-flow.md
  // §11.68). The file must hold what is stored, or an import would apply the Talent again.
  const boltgun = { name: "Boltgun", wargearId: "boltgun", damage: 10, ed: 1, range: [12, 24, 36], salvo: 2 };
  const discipline = {
    source: "Bolter Discipline",
    fits: { wargearKeywords: ["BOLT"] },
    mods: [
      { kind: "traitRating" as const, traitId: "rapid-fire", delta: { perRank: 1 } },
      { kind: "trait" as const, traitId: "rapid-fire", rating: 2 },
    ],
  };
  const armed = { weapons: [{ ...boltgun, traits: ["Brutal", "Rapid Fire (2)"] }], weaponEffects: [discipline] };
  assert.ok((await gm.send({ type: "character.update", id: kael.id, stats: armed })).ok);
  const hive = await gm.send({ type: "codex.save", kind: "location", data: { name: "Hive", revealed: true } });
  assert.ok(hive.ok && hive.id);
  // A place's hazards (issue #49): a book row at an intensity it prints, and the GM's own. The book text stays in the
  // catalogue; an unknown row or an intensity the row doesn't print is refused.
  const shock = { id: crypto.randomUUID(), kind: "book", hazardId: "core-electricity", variant: "Moderate" } as const;
  const climb = {
    id: crypto.randomUUID(),
    kind: "custom",
    name: "Climb",
    tests: [{ kind: "skill", skill: "Athletics" }],
  };
  const place = (hazardList: unknown[]) =>
    gm.send({
      type: "codex.save",
      kind: "location",
      data: { name: "Spire", parentId: hive.id, revealed: true, hazardList },
    } as never);
  assert.deepEqual(await place([{ ...shock, hazardId: "nope" }]), { ok: false, error: 'Unknown hazard "nope"' });
  assert.deepEqual(await place([{ ...shock, hazardId: "core-falling" }]), {
    ok: false,
    error: '"Falling" has no Moderate intensity',
  });
  const spire = await place([shock, climb]);
  assert.ok(spire.ok && spire.id);
  // The place tree (issue #50): the Hive can't go inside the Spire, which is inside it.
  assert.deepEqual(
    await gm.send({ type: "codex.save", kind: "location", id: hive.id, data: { name: "Hive", parentId: spire.id } }),
    { ok: false, error: "Hive can't go inside Spire: it is already inside it" },
  );
  const orders = await gm.send({
    type: "codex.save",
    kind: "handout",
    data: { title: "Orders", revealed: true, audience: [kael.id] },
  });
  const adv = await gm.send({ type: "codex.save", kind: "adventure", data: { title: "Descent" } });
  assert.ok(spire.ok && orders.ok && orders.id && adv.ok && adv.id);
  // A custom threat (issue #43) and a scene that uses it, so the file has to carry both.
  const own = await gm.send({
    type: "threat.save",
    data: {
      name: "Pit Beast",
      faction: "heretic",
      threat: ["M", "M", "M", "M"],
      keywords: ["CHAOS"],
      attributes: { S: 8, T: 8, A: 2, I: 2, Wil: 3, Int: 1, Fel: 1 },
      resilience: { value: 10 },
      defence: 1,
      wounds: 20,
      shock: null,
      skills: { default: 4, list: [] },
      conviction: 5,
      resolve: 3,
      speed: 8,
      size: "Huge",
    },
  });
  assert.ok(own.ok && own.slug === "pit-beast");
  // A second one, so the file's order is something the import has to keep.
  const own2 = await gm.send({
    type: "threat.save",
    data: {
      name: "Sump Crawler",
      faction: "heretic",
      threat: ["T", "T", "T", "T"],
      keywords: ["CHAOS"],
      attributes: { S: 3, T: 3, A: 4, I: 3, Wil: 1, Int: 1, Fel: 1 },
      resilience: { value: 4 },
      defence: 2,
      wounds: 1,
      shock: 3,
      skills: { default: 2, list: [] },
      conviction: 2,
      resolve: 1,
      speed: 6,
      size: "Small",
    },
  });
  assert.ok(own2.ok && own2.slug === "sump-crawler");
  const ambush = await gm.send({
    type: "codex.save",
    kind: "beat",
    data: {
      adventureId: adv.id,
      title: "Ambush",
      status: "done",
      locationId: spire.id,
      handoutIds: [orders.id],
      // One entry carries a profile and scaling (issue #42), so the export and import keep both, and one names the
      // campaign's own threat (issue #43).
      encounter: [
        { threatId: "ork-boy", count: 3, profiles: ["heretical-strength"], scale: true },
        { threatId: "custom-pit-beast" },
      ],
      // The scene picks its place's hazards (§11.95); a pick its place doesn't list is dropped.
      hazards: [
        { id: shock.id, spotted: true },
        { id: crypto.randomUUID(), spotted: true },
      ],
    },
  });
  assert.ok(ambush.ok && ambush.id);
  await eventually(
    () =>
      gm
        .codex()
        ?.adventures[0]?.beats[0]?.hazards.map((h) => h.id)
        .join() === shock.id,
    "only the place's own hazard is kept",
  );
  const regroup = {
    adventureId: adv.id,
    title: "Regroup",
    goal: "Hold the lift",
    exits: [{ label: "Again", beatId: ambush.id }],
    tests: [{ kind: "resolve", dn: 5, who: "each" }],
    ruin: [{ text: "Each failed Survival Test" }],
    spends: [{ pool: "ruin", name: "Barrage", cost: 1, text: "[effect]" }],
  };
  assert.ok((await gm.send({ type: "codex.save", kind: "beat", data: regroup })).ok);
  assert.ok((await gm.send({ type: "session.start" })).ok);

  const player = await gm.send({ type: "token.issue", characterId: kael.id });
  assert.ok(player.ok && player.token);
  // A phone sees the revealed place, never its hazards.
  const phone = connect({ auth: { token: player.token } });
  t.after(() => phone.socket.close());
  await eventually(() => phone.codex()?.locations.some((l) => l.name === "Spire") ?? false, "the player's codex");
  const seen = phone.codex()!.locations.find((l) => l.name === "Spire")!;
  assert.deepEqual([seen.hazards, seen.hazardList], ["", []]);
  const exportPath = `/campaigns/${gm.campaignId}/export`;
  assert.equal((await get(exportPath, { cookie: `wg_token=${player.token}` })).status, 403, "GM only");
  const res = await get(exportPath, bearer(gm.gmClerk));
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-disposition") ?? "", /export\.auspex\.json/);
  const file = await res.json();
  const exported = (file as CampaignExport).characters[0]!.stats.weapons[0]!;
  assert.ok(exported.traits.includes("Rapid Fire (2)") && !exported.effects, "the file holds the stored line");

  assert.equal((await post("/campaigns/import", { file }, bearer(clerk("not-a-creator")))).status, 403);
  assert.equal((await post("/campaigns/import", { file: { format: "pack" } }, bearer(gm.gmClerk))).status, 400);
  assert.equal((file as CampaignExport).codex.customThreats[0]?.id, "custom-pit-beast", "the file holds it");
  const notCustom = structuredClone(file);
  notCustom.codex.customThreats[0].source = "core";
  assert.equal(
    (await post("/campaigns/import", { file: notCustom }, bearer(gm.gmClerk))).status,
    400,
    "a custom threat claiming a book is refused",
  );
  const twice = structuredClone(file);
  twice.codex.customThreats.push(structuredClone(twice.codex.customThreats[0]));
  assert.equal(
    (await post("/campaigns/import", { file: twice }, bearer(gm.gmClerk))).status,
    400,
    "two customs with one id are refused, not left to the unique constraint",
  );
  const longSlug = structuredClone(file);
  longSlug.codex.customThreats.push({ ...longSlug.codex.customThreats[0], id: `custom-${"a".repeat(61)}` });
  assert.equal(
    (await post("/campaigns/import", { file: longSlug }, bearer(gm.gmClerk))).status,
    400,
    "a slug threat.save and threat.delete would refuse is refused here too",
  );
  // The 101st custom threat is refused (issue #43). 100 come in through one import; saving them one by one would run
  // into the 120 actions a minute a socket may send.
  const full = structuredClone(file);
  const pit = full.codex.customThreats[0];
  full.codex.customThreats = Array.from({ length: CUSTOM_THREAT_CAP }, (_, i) => ({
    ...pit,
    id: i ? `${pit.id}-${i + 1}` : pit.id,
  }));
  const fullRes = await post("/campaigns/import", { file: full }, bearer(gm.gmClerk));
  assert.equal(fullRes.status, 201);
  const fullGm = connect({
    auth: { campaignId: ((await fullRes.json()) as { campaignId: string }).campaignId, clerkToken: gm.gmClerk },
  });
  t.after(() => fullGm.socket.close());
  await eventually(() => fullGm.codex()?.customThreats.length === CUSTOM_THREAT_CAP, "a campaign at the cap");
  const { id: _id, source: _source, page: _page, ...pitData } = pit;
  assert.deepEqual(await fullGm.send({ type: "threat.save", data: pitData }), {
    ok: false,
    error: `At most ${CUSTOM_THREAT_CAP} custom threats per campaign`,
  });
  const forged = structuredClone(file);
  forged.codex.adventures[0].beats[0].encounter[0].threatId = "nope";
  assert.equal((await post("/campaigns/import", { file: forged }, bearer(gm.gmClerk))).status, 400, "unknown threat");
  const unknownHazard = structuredClone(file);
  unknownHazard.codex.locations[1].hazardList[0].hazardId = "nope";
  assert.equal(
    (await post("/campaigns/import", { file: unknownHazard }, bearer(gm.gmClerk))).status,
    400,
    "unknown hazard",
  );
  const loop = structuredClone(file);
  loop.codex.locations[0].parentId = loop.codex.locations[1].id; // Hive inside Spire, inside Hive
  assert.equal((await post("/campaigns/import", { file: loop }, bearer(gm.gmClerk))).status, 400, "a place loop");
  const orphan = structuredClone(file);
  orphan.codex.handouts[0].audience = [crypto.randomUUID()];
  assert.equal(
    (await post("/campaigns/import", { file: orphan }, bearer(gm.gmClerk))).status,
    400,
    "a private handout's reader must come along, or it would reach every player",
  );
  // Only the import route takes a big body; the guest door keeps Express's 100 kB.
  assert.equal((await post("/join", { token: "x".repeat(200_000) })).status, 413);

  const open = async (fresh: boolean) => {
    const r = await post("/campaigns/import", { file, fresh }, bearer(gm.gmClerk));
    assert.equal(r.status, 201);
    const { campaignId } = (await r.json()) as { campaignId: string };
    const s = connect({ auth: { campaignId, clerkToken: gm.gmClerk } });
    t.after(() => s.socket.close());
    const state = await s.until((x) => x.campaign.name === "Export");
    await eventually(() => !!s.codex(), "the imported codex");
    return { campaignId, state, codex: s.codex()! };
  };

  const whole = await open(false);
  assert.notEqual(whole.campaignId, gm.campaignId);
  const [c] = whole.state.characters;
  assert.ok(c && c.id !== kael.id && c.wounds === 2, "a new id, the same Wounds");
  assert.ok(c.stats.weapons[0]!.traits.includes("Rapid Fire (3)"), "the Talent applied once, on read");
  const [h] = whole.codex.handouts;
  assert.deepEqual(h?.audience, [c.id], "the audience follows the Agent to its new id");
  const locs = whole.codex.locations;
  assert.deepEqual(
    locs.map((l) => l.name),
    ["Hive", "Spire"],
    "rows keep the file's order",
  );
  const newHive = locs.find((l) => l.name === "Hive")!;
  assert.equal(locs.find((l) => l.name === "Spire")?.parentId, newHive.id);
  const b = whole.codex.adventures[0]?.beats[0];
  assert.equal(b?.locationId, locs.find((l) => l.name === "Spire")?.id);
  assert.deepEqual(b?.handoutIds, [h?.id]);
  assert.equal(b?.status, "done");
  const spireList = locs.find((l) => l.name === "Spire")?.hazardList;
  assert.deepEqual(spireList, [shock, { ...climb, effect: "", tests: [BeatTest.parse(climb.tests[0])] }]);
  assert.deepEqual(b?.hazards, [{ id: shock.id, spotted: true }], "the scene's pick comes along");
  assert.deepEqual(
    whole.codex.customThreats.map((t) => t.name),
    ["Pit Beast", "Sump Crawler"],
    "both custom threats are restored, in the file's order",
  );
  assert.equal(b?.encounter[1]?.threatId, "custom-pit-beast", "and the entry still names it by slug");
  assert.deepEqual(
    b?.encounter[0]?.profiles,
    ["heretical-strength"],
    "a prepared entry's profiles survive the round trip",
  );
  assert.equal(b?.encounter[0]?.scale, true);
  // An exit follows its target to the new id (issue #38), and the Tests come along (issue #39).
  const exitTo = (codex: Codex) => {
    const [first, second] = codex.adventures[0]!.beats;
    const t = second?.tests[0];
    const pools = `${second?.ruin[0]?.text} ${second?.spends[0]?.name} ${second?.spends[0]?.cost}`;
    return [
      second?.goal,
      second?.exits[0]?.beatId === first?.id && first?.id !== ambush.id,
      `${t?.kind} ${t?.dn}`,
      pools,
    ];
  };
  const scene2 = ["Hold the lift", true, "resolve 5", "Each failed Survival Test Barrage 1"];
  assert.deepEqual(exitTo(whole.codex), scene2, "and the Ruin and Glory lines (issue #40)");
  assert.equal(whole.codex.sessions.length, 1);
  assert.equal((await get("/lobby", bearer(gm.gmClerk)).then((r) => r.json())).mine.length >= 2, true);

  const fresh = await open(true);
  assert.equal(fresh.state.characters[0]?.wounds, 0);
  assert.equal(fresh.codex.sessions.length, 0);
  assert.equal(fresh.codex.adventures[0]?.beats[0]?.status, "planned");
  assert.deepEqual(exitTo(fresh.codex), scene2);
  assert.equal(fresh.codex.locations.find((l) => l.name === "Hive")?.revealed, false);
  assert.deepEqual(fresh.codex.adventures[0]?.beats[0]?.hazards, [{ id: shock.id, spotted: false }], "§11.92");
});

test("Ascension: the group's Tier goes up together (issue #15 steps 5-6, Core pp.147-148)", async (t) => {
  const gm = await newCampaign("Ascend", 2);
  t.after(() => gm.socket.close());
  const kell = await gm.send({ type: "character.create", name: "Kell" });
  const vyn = await gm.send({ type: "character.create", name: "Vyn" });
  assert.ok(kell.ok && kell.id && vyn.ok && vyn.id);
  await gm.until((s) => s.characters.length === 2);

  // Ascending is the group's decision and the GM's action (§11.66); a player can't raise the table's Tier.
  const issued = await gm.send({ type: "token.issue", characterId: kell.id! });
  assert.ok(issued.ok && issued.token);
  const player = connect({ auth: { token: issued.token } });
  t.after(() => player.socket.close());
  await player.until((s) => s.characters.length === 2);
  assert.deepEqual(await player.send({ type: "campaign.ascend", kind: "milestone" }), {
    ok: false,
    error: "GM only",
  });

  // Experience Ascension: every character needs 100 XP earned in the current Tier (Core p.147).
  assert.deepEqual(await gm.send({ type: "campaign.ascend", kind: "experience" }), {
    ok: false,
    error: "Kell and Vyn have not earned 100 XP in Tier 2 yet (Core p.147)",
  });

  // Session end awards the XP and tells the GM what it crossed: Rank (Core p.146) and the group's eligibility (p.147).
  assert.ok((await gm.send({ type: "session.start" })).ok);
  assert.deepEqual(await gm.send({ type: "session.end", xp: 45, recap: "" }), {
    ok: true,
    notices: ["Kell reached Rank 2 (Core p.146)", "Vyn reached Rank 2 (Core p.146)"],
  });
  await gm.until((s) => s.characters.every((c) => c.xp === 45));
  assert.ok((await gm.send({ type: "session.start" })).ok);
  assert.deepEqual(await gm.send({ type: "session.end", xp: 55, recap: "" }), {
    ok: true,
    notices: [
      "Kell reached Rank 3 (Core p.146)",
      "Vyn reached Rank 3 (Core p.146)",
      `Everyone has earned ${ASCENSION_XP} XP in Tier 2: the group may Ascend (Core p.147)`,
    ],
  });
  await gm.until((s) => s.characters.every((c) => c.xp === ASCENSION_XP));

  // A character who joined after the XP was awarded holds the group back, and is named on their own.
  const late = await gm.send({ type: "character.create", name: "Latecomer" });
  assert.ok(late.ok && late.id);
  assert.deepEqual(await gm.send({ type: "campaign.ascend", kind: "experience" }), {
    ok: false,
    error: "Latecomer has not earned 100 XP in Tier 2 yet (Core p.147)",
  });
  assert.ok((await gm.send({ type: "character.delete", id: late.id! })).ok);
  await gm.until((s) => s.characters.length === 2);

  // Experience Ascension: the Tier goes up, XP is untouched, and the 100-XP window restarts from here.
  assert.ok((await gm.send({ type: "campaign.ascend", kind: "experience" })).ok);
  const ascended = await gm.until((s) => s.campaign.tier === 3);
  assert.ok(
    ascended.characters.every((c) => c.xp === 100 && c.xpAtAscension === 100 && !c.ascensionPackageWaived),
    JSON.stringify(ascended.characters.map((c) => [c.xp, c.xpAtAscension])),
  );
  assert.deepEqual(await gm.send({ type: "campaign.ascend", kind: "experience" }), {
    ok: false,
    error: "Kell and Vyn have not earned 100 XP in Tier 3 yet (Core p.147)",
  });

  // Milestone Ascension is the GM's call: 100 XP each first (Core p.148 step 1), and the package may be waived (step 2).
  assert.ok((await gm.send({ type: "campaign.ascend", kind: "milestone", waivePackage: true })).ok);
  const milestone = await gm.until((s) => s.campaign.tier === 4);
  assert.ok(
    milestone.characters.every((c) => c.xp === 200 && c.xpAtAscension === 200 && c.ascensionPackageWaived),
    JSON.stringify(milestone.characters.map((c) => [c.xp, c.xpAtAscension, c.ascensionPackageWaived])),
  );

  // Tier 5 is the last one, and the next Ascension clears the waive.
  assert.ok((await gm.send({ type: "campaign.ascend", kind: "milestone" })).ok);
  const top = await gm.until((s) => s.campaign.tier === 5);
  assert.ok(top.characters.every((c) => c.xp === 300 && !c.ascensionPackageWaived));
  assert.deepEqual(await gm.send({ type: "campaign.ascend", kind: "milestone" }), {
    ok: false,
    error: "Tier 5 is the highest Tier; there is nothing to Ascend to",
  });
});

// A Milestone Ascension may waive the package (Core p.148 step 2): the server's resolve has to read the waive too, or
// the builder offers SAVE and the server refuses it.
test("Ascension: a waived package isn't asked for when the build is saved", async (t) => {
  const advanced = { ...disruptor, advancement: { skills: { Stealth: 6 } } };
  for (const waivePackage of [false, true]) {
    const gm = await newCampaign(`Waive ${waivePackage}`, 4);
    t.after(() => gm.socket.close());
    const made = await gm.send({ type: "character.build", name: "Veyl", build: disruptor });
    assert.ok(made.ok && made.id);
    assert.ok((await gm.send({ type: "campaign.ascend", kind: "milestone", waivePackage })).ok);
    await gm.until((s) => s.campaign.tier === 5);
    assert.deepEqual(
      await gm.send({ type: "character.build", id: made.id, build: advanced }),
      waivePackage
        ? { ok: true, id: made.id }
        : { ok: false, error: "Still to choose: Buy one Ascension Package (Tier 4 → 5)" },
    );
  }
});

// Core p.147 asks it of "every character in your group", and nothing removes a dead character's record, so a casualty
// would otherwise hold the party at its Tier for ever (rules-flow.md §11.66).
test("Ascension: a Dead character neither has to earn 100 XP nor blocks the group", async (t) => {
  const gm = await newCampaign("Fallen", 2);
  t.after(() => gm.socket.close());
  const live = await gm.send({ type: "character.create", name: "Survivor" });
  const lost = await gm.send({ type: "character.create", name: "Fallen" });
  assert.ok(live.ok && live.id && lost.ok && lost.id);
  await gm.until((s) => s.characters.length === 2);

  // Only the survivor earns the XP; the other is killed outright (p.194).
  assert.ok((await gm.send({ type: "character.adjust", id: live.id!, wrath: 0 })).ok);
  assert.ok((await gm.send({ type: "session.start" })).ok);
  assert.ok((await gm.send({ type: "session.end", xp: ASCENSION_XP, recap: "" })).ok);
  await gm.until((s) => s.characters.every((c) => c.xp === ASCENSION_XP));
  // Both are at 100 now, so take the XP back off the one that dies: it is short, and Dead.
  assert.ok((await gm.send({ type: "character.update", id: lost.id!, annihilated: true })).ok);
  assert.ok((await gm.send({ type: "session.start" })).ok);
  assert.ok((await gm.send({ type: "campaign.ascend", kind: "experience" })).ok);
  await gm.until((s) => s.campaign.tier === 3);

  // With nobody left alive there is nothing to Ascend, rather than a Tier that rises over a table of corpses.
  assert.ok((await gm.send({ type: "character.update", id: live.id!, annihilated: true })).ok);
  assert.deepEqual(await gm.send({ type: "campaign.ascend", kind: "milestone" }), {
    ok: false,
    error: "This campaign has no living characters to Ascend",
  });
});

// Raising the Tier by hand is still an Ascension as far as the rules are concerned: the 100-XP window has to restart,
// or the XP that paid for this Tier would pay for the next one too (Core p.147).
test("Ascension: campaign.update's Tier restarts the 100-XP window", async (t) => {
  const gm = await newCampaign("ByHand", 2);
  t.after(() => gm.socket.close());
  const c = await gm.send({ type: "character.create", name: "Hand" });
  assert.ok(c.ok && c.id);
  assert.ok((await gm.send({ type: "session.start" })).ok);
  assert.ok((await gm.send({ type: "session.end", xp: ASCENSION_XP, recap: "" })).ok);
  await gm.until((s) => s.characters.every((x) => x.xp === ASCENSION_XP));

  assert.ok((await gm.send({ type: "campaign.update", tier: 3 })).ok);
  await gm.until((s) => s.campaign.tier === 3 && s.characters.every((x) => x.xpAtAscension === ASCENSION_XP));
  // Without the reset this would succeed on the XP that already paid for Tier 3.
  assert.deepEqual(await gm.send({ type: "campaign.ascend", kind: "experience" }), {
    ok: false,
    error: "Hand has not earned 100 XP in Tier 3 yet (Core p.147)",
  });
});

// Issue #42: the Tier 5 Threat Profiles (VoA p.126) and Scaling Threats (Core p.326) are ticked on the entry or on
// + THREAT, and applied to the stat block before it is snapshotted.
test("threat profiles and scaling reach the snapshot (issue #42, VoA p.126, Core p.326)", async (t) => {
  const gm = await newCampaign("Scaling", 3);
  t.after(() => gm.socket.close());
  const kael = await gm.send({ type: "character.create", name: "Kael" });
  assert.ok(kael.ok && kael.id);
  // One Agent claimed: "the number of players" in Adversary scaling counts the Agents in the fight (§11.106).
  const issued = await gm.send({ type: "token.issue", characterId: kael.id });
  assert.ok(issued.ok && issued.token);

  assert.ok((await gm.send({ type: "encounter.start" })).ok);
  const byId = (s: LiveState, id: string) =>
    s.encounter?.combatants.find((c): c is ThreatCombatant => c.kind === "threat" && c.id === id);

  // An Adversary at Tier 3 with two profiles: +1 Agent +3 Tier on Wounds and Shock, Strength and Weapon Skill up.
  const archon = await gm.send({
    type: "combatant.addThreat",
    threatId: "archon",
    profiles: ["heretical-strength", "xenos-cunning"],
    scale: true,
  });
  assert.ok(archon.ok && archon.id);
  const a = byId(await gm.until((s) => !!byId(s, archon.id!)), archon.id)!;
  assert.equal(a.threatClass, "A");
  assert.equal(a.maxWounds, 18, "14 + 1 Agent + Tier 3");
  assert.equal(a.maxShock, 16, "12 + 1 Agent + Tier 3");
  assert.deepEqual(
    a.stats?.bonuses.slice(-3).map((b) => b.name),
    ["Heretical Strength (VoA p.126)", "Xenos Cunning (VoA p.126)", "Scaled (Core p.326)"],
    "each change explains itself in BONUSES",
  );

  // The same threat added plain is the printed stat block again: nothing was mutated in the shared bestiary.
  const plain = await gm.send({ type: "combatant.addThreat", threatId: "archon" });
  assert.ok(plain.ok && plain.id);
  const p = byId(await gm.until((s) => !!byId(s, plain.id!)), plain.id)!;
  assert.equal(p.maxWounds, 14);
  assert.equal(p.maxShock, 12);
  assert.ok(!p.stats?.bonuses.some((b) => b.name.startsWith("Scaled")), "no scaling on a plain add");

  // A Troop takes no scaling (Core p.326, §11.107), and a Mob's members have 1 Wound each (p.325), but both still
  // take a profile.
  const mob = await gm.send({
    type: "combatant.addThreat",
    threatId: "ork-boy",
    mobCount: 6,
    profiles: ["heretical-strength"],
    scale: true,
  });
  assert.ok(mob.ok && mob.id);
  const m = byId(await gm.until((s) => !!byId(s, mob.id!)), mob.id)!;
  assert.equal(m.threatClass, "T");
  assert.equal(m.maxWounds, 6, "the printed Wounds, unscaled");
  assert.equal(m.stats?.attributes.S, 6, "Strength +2 still applies");
  assert.equal(m.stats?.skills.list.find((s) => s.name === "Weapon Skill")?.dice, 9);
  assert.equal(m.stats?.resilience.value, 7);
  assert.ok(!m.stats?.bonuses.some((b) => b.name.startsWith("Scaled")));

  // A prepared entry carries the same two fields, and a beat saved before this change (no profiles, no scale) still
  // starts: the defaults parse for it.
  assert.ok((await gm.send({ type: "encounter.end" })).ok);
  const adv = await gm.send({ type: "codex.save", kind: "adventure", data: { title: "Raid" } });
  assert.ok(adv.ok && adv.id);
  const beat = await gm.send({
    type: "codex.save",
    kind: "beat",
    data: {
      adventureId: adv.id,
      title: "Ambush",
      encounter: [
        { threatId: "canoptek-wraith", profiles: ["enemy-within"], scale: true },
        { threatId: "ork-boy", count: 2 },
      ],
    },
  });
  assert.ok(beat.ok && beat.id);
  assert.ok((await gm.send({ type: "beat.startEncounter", id: beat.id })).ok);
  const prepared = await gm.until(
    (s) => (s.encounter?.combatants.filter((c) => c.kind === "threat").length ?? 0) === 3,
  );
  const wraith = prepared.encounter!.combatants.find(
    (c): c is ThreatCombatant => c.kind === "threat" && c.threatId === "canoptek-wraith",
  )!;
  assert.equal(wraith.threatClass, "E", "an Elite at Tier 3");
  assert.equal(wraith.maxWounds, 11, "8 + Tier 3, the Tier alone for an Elite");
  assert.equal(wraith.maxShock, 6);
  assert.equal(wraith.stats?.skills.list.find((s) => s.name === "Ballistic Skill")?.dice, 4, "unlisted: Default + 1");
  const boy = prepared.encounter!.combatants.find(
    (c): c is ThreatCombatant => c.kind === "threat" && c.threatId === "ork-boy",
  )!;
  assert.equal(boy.maxWounds, 6);
  assert.deepEqual(
    boy.stats?.bonuses.map((b) => b.name),
    ["'Ere We Go!"],
    "an untouched entry keeps the printed block",
  );
});

test("scaling counts the whole roster while nobody holds a seat (Core p.326, §11.106)", async (t) => {
  const gm = await newCampaign("Unseated", 3);
  t.after(() => gm.socket.close());
  for (const name of ["Kael", "Vex"]) assert.ok((await gm.send({ type: "character.create", name })).ok);
  assert.ok((await gm.send({ type: "encounter.start" })).ok);
  const archon = await gm.send({ type: "combatant.addThreat", threatId: "archon", scale: true });
  assert.ok(archon.ok && archon.id);
  const s = await gm.until((x) => !!x.encounter?.combatants.some((c) => c.id === archon.id));
  const a = s.encounter!.combatants.find((c): c is ThreatCombatant => c.id === archon.id)!;
  assert.equal(a.maxWounds, 19, "14 + 2 Agents on the roster + Tier 3, as the SCALE preview shows");
});

// Issue #43: a stat block the GM writes or clones, kept with the campaign and usable wherever a bestiary threat goes.
test("custom threats: saved, used, refused and never sent to a player", async (t) => {
  const gm = await newCampaign("Customs", 3);
  t.after(() => gm.socket.close());
  const kael = await gm.send({ type: "character.create", name: "Kael" });
  assert.ok(kael.ok && kael.id);
  const issued = await gm.send({ type: "token.issue", characterId: kael.id });
  assert.ok(issued.ok && issued.token);
  const player = connect({ auth: { token: issued.token } });
  t.after(() => player.socket.close());
  await player.until((s) => s.characters.length === 1);

  // A placeholder block, not a printed one: the editor sends everything but id, source and page.
  const data: Extract<ActionInput, { type: "threat.save" }>["data"] = {
    name: "Warped Ogryn",
    faction: "heretic",
    threat: ["E", "E", "A", "A"],
    keywords: ["CHAOS", "OGRYN"],
    attributes: { S: 7, T: 7, A: 3, I: 3, Wil: 2, Int: 1, Fel: 1 },
    resilience: { value: 9, note: "Scrap Plate (2)" },
    defence: 2,
    wounds: 10,
    shock: 4,
    skills: { default: 3, list: [{ name: "Weapon Skill", dice: 8 }] },
    conviction: 4,
    resolve: 2,
    speed: 6,
    size: "Large",
    abilities: [{ type: "ACTION", name: "Slab Fist", weapons: [{ name: "Slab Fist", damage: 12, ed: 2, range: [1] }] }],
  };
  const huge = await gm.send({
    type: "threat.save",
    data: { ...data, bonuses: [{ name: "Filler", text: "x".repeat(MAX_CUSTOM_THREAT_CHARS) }] },
  });
  assert.ok(!huge.ok && /at most 16,000 characters/.test(huge.error), "a custom threat has a size cap");
  const saved = await gm.send({ type: "threat.save", data });
  assert.ok(saved.ok && saved.slug === "warped-ogryn");
  await eventually(() => gm.codex()?.customThreats[0]?.id === "custom-warped-ogryn", "the GM's codex carries it");
  assert.equal(gm.codex()?.customThreats[0]?.source, "custom", "the server sets the source");
  await eventually(() => player.codex()?.customThreats.length === 0, "a player's codex carries none");

  // A player can't write one, and a guest can't either.
  assert.deepEqual(await player.send({ type: "threat.save", data }), { ok: false, error: "GM only" });
  assert.deepEqual(await player.send({ type: "threat.delete", slug: "warped-ogryn" }), { ok: false, error: "GM only" });

  // A rename keeps the slug, so everything pointing at custom-warped-ogryn still resolves.
  const renamed = await gm.send({ type: "threat.save", slug: "warped-ogryn", data: { ...data, name: "Ogryn Brute" } });
  assert.ok(renamed.ok && renamed.slug === "warped-ogryn");
  await eventually(() => gm.codex()?.customThreats[0]?.name === "Ogryn Brute", "the rename lands");
  assert.equal(gm.codex()?.customThreats[0]?.id, "custom-warped-ogryn");
  // A second one of the same name takes a suffix.
  const twin = await gm.send({ type: "threat.save", data });
  assert.ok(twin.ok && twin.slug === "warped-ogryn-2");

  // It goes in a fight like any other threat, with its class at this Tier and its own snapshot.
  assert.ok((await gm.send({ type: "encounter.start" })).ok);
  const added = await gm.send({ type: "combatant.addThreat", threatId: "custom-warped-ogryn", scale: true });
  assert.ok(added.ok && added.id);
  const c = (await gm.until((s) => !!threatOf(s)))!;
  const row = c.encounter!.combatants.find((x): x is ThreatCombatant => x.kind === "threat")!;
  assert.equal(row.threatClass, "A", "an Adversary at Tier 3");
  assert.equal(row.maxWounds, 14, "10 + 1 Agent + Tier 3 (Core p.326)");
  assert.equal(row.stats?.name, "Ogryn Brute");
  assert.deepEqual(await gm.send({ type: "combatant.addThreat", threatId: "custom-nope" }), {
    ok: false,
    error: 'Unknown threat "custom-nope"',
  });
  assert.ok((await gm.send({ type: "encounter.end" })).ok);

  // A prepared scene accepts it, and starting that scene adds it.
  const adv = await gm.send({ type: "codex.save", kind: "adventure", data: { title: "Pit" } });
  assert.ok(adv.ok && adv.id);
  const beat = await gm.send({
    type: "codex.save",
    kind: "beat",
    data: { adventureId: adv.id, title: "The Pit", encounter: [{ threatId: "custom-warped-ogryn" }] },
  });
  assert.ok(beat.ok && beat.id);
  assert.deepEqual(
    await gm.send({
      type: "codex.save",
      kind: "beat",
      data: { adventureId: adv.id, title: "Bad", encounter: [{ threatId: "custom-nope" }] },
    }),
    { ok: false, error: 'Unknown threat "custom-nope"' },
  );
  assert.ok((await gm.send({ type: "beat.startEncounter", id: beat.id })).ok);
  await gm.until(
    (s) => !!s.encounter?.combatants.some((x) => x.kind === "threat" && x.threatId === "custom-warped-ogryn"),
  );

  // DELETE is refused while a scene or an NPC names it, and allowed once they don't - even with a fight holding it,
  // because that combatant carries its own snapshot.
  const refused = await gm.send({ type: "threat.delete", slug: "warped-ogryn" });
  assert.ok(
    !refused.ok && refused.error === 'Still used by the scene "The Pit"',
    refused.ok ? "allowed" : refused.error,
  );
  assert.ok(
    (
      await gm.send({
        type: "codex.save",
        kind: "beat",
        id: beat.id,
        data: { adventureId: adv.id, title: "The Pit", encounter: [] },
      })
    ).ok,
  );
  const vex = await gm.send({
    type: "codex.save",
    kind: "npc",
    data: { name: "Vex", statSource: { kind: "bestiary", threatId: "custom-warped-ogryn" } },
  });
  assert.ok(vex.ok && vex.id);
  const byNpc = await gm.send({ type: "threat.delete", slug: "warped-ogryn" });
  assert.ok(!byNpc.ok && byNpc.error === "Still used by the NPC Vex", byNpc.ok ? "allowed" : byNpc.error);
  assert.ok((await gm.send({ type: "codex.delete", kind: "npc", id: vex.id })).ok);
  assert.ok((await gm.send({ type: "threat.delete", slug: "warped-ogryn" })).ok, "a fight holding it doesn't block it");
  await eventually(() => gm.codex()?.customThreats.length === 1, "only the twin is left");
  assert.deepEqual(await gm.send({ type: "threat.delete", slug: "warped-ogryn" }), {
    ok: false,
    error: "Threat not found",
  });

  // Another campaign can't see or use it.
  const other = await newCampaign("Elsewhere", 3);
  t.after(() => other.socket.close());
  await eventually(() => other.codex()?.customThreats.length === 0, "a second table sees none");
  assert.ok((await other.send({ type: "encounter.start" })).ok);
  assert.deepEqual(await other.send({ type: "combatant.addThreat", threatId: "custom-warped-ogryn-2" }), {
    ok: false,
    error: 'Unknown threat "custom-warped-ogryn-2"',
  });
});
