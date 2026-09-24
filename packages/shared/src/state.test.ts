import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  Action, CharacterStats, Threat, canAct, canSeize, deriveStats, isOut, pcStatus, poolMax, sideUpNext, threatStatus, toPlayerCodex,
  toPlayerView,
  type Character, type Codex, type Combatant, type Encounter, type LiveState, type ThreatCombatant,
} from "./index.ts";

const orkBoy = Threat.parse(JSON.parse(readFileSync(new URL("../../data/threats/ork-boy.json", import.meta.url), "utf8")));
const threat = (id: string, o: Partial<ThreatCombatant> = {}): ThreatCombatant => ({
  id, kind: "threat", acted: false, ambushed: false, threatId: "ork-boy", threatClass: "T", label: "Boyz", marker: "red",
  mobCount: null, mobStart: null, wounds: 0, shock: 0, personalRuin: 0, maxWounds: 6, maxShock: 2, conditions: ["Prone"],
  revealed: false, stats: orkBoy, ...o,
});
const pc = (id: string, o: Partial<Combatant> = {}): Combatant =>
  ({ id, kind: "pc", characterId: `ch-${id}`, acted: false, ambushed: false, ...o }) as Combatant;
const enc = (combatants: Combatant[], o: Partial<Encounter> = {}): Encounter =>
  ({ id: "e", round: 1, currentId: null, lastSide: null, seizedSide: null, combatants, ...o });
const noAccess: LiveState["access"] = { members: [], invites: [] };
const char = (o: Partial<Character>): Character =>
  ({ id: "x", name: "x", stats: CharacterStats.parse({}), overrides: {}, wounds: 0, shock: 0, wrath: 2, traumatic: 0, xp: 0, conditions: [], ...o });
// A Tier 1 table around an encounter; the turn rules need the characters to know who's Dead.
const table = (e: Encounter, characters: Character[] = []): LiveState =>
  ({ campaign: { id: "c", name: "C", tier: 1, glory: 0, ruin: 0, framework: "", patron: "" }, characters, encounter: e, access: noAccess });

test("toPlayerView hides unrevealed threat stats, keeps bars and conditions", () => {
  const s: LiveState = {
    campaign: { id: "c", name: "C", tier: 1, glory: 0, ruin: 0, framework: "", patron: "" },
    characters: [],
    encounter: enc([threat("a"), threat("b", { revealed: true }), pc("p")]),
    access: {
      members: [{ userId: "u1", name: "Ana", role: "player", characterId: null }],
      invites: [{ id: "i", mode: "room", characterId: null, allowGuests: true, expiresAt: "", uses: 0, maxUses: null }],
    },
  };
  const [hidden, shown, p] = toPlayerView(s).encounter!.combatants as [ThreatCombatant, ThreatCombatant, Combatant];
  assert.equal(hidden.stats, null);
  assert.equal(hidden.maxWounds, 6);
  assert.deepEqual(hidden.conditions, ["Prone"]);
  assert.equal(shown.stats?.name, "Ork Boy");
  assert.deepEqual(p, pc("p"));
  assert.notEqual((s.encounter!.combatants[0] as ThreatCombatant).stats, null, "input not mutated");
  assert.deepEqual(toPlayerView(s).access, { members: s.access.members, invites: [] }, "players see who's seated, never the invite links");
});

test("deriveStats: sheet formulas, additive mods, overrides, minimum 1", () => {
  const s = CharacterStats.parse({
    attributes: { S: 5, T: 6, A: 5, I: 5, Wil: 3, Int: 3, Fel: 1 }, armour: { name: "Mk X Tacticus", ar: 5 },
    skills: { Awareness: 3 }, mods: { maxWounds: 3, resolve: 1 }, // Primaris +3 Wounds, Honour the Chapter +1 Resolve
  });
  const d = deriveStats({ stats: s, overrides: {}, tier: 4 });
  assert.equal(d.maxWounds, 6 + 8 + 3);
  assert.equal(d.maxShock, 3 + 4);
  assert.equal(d.defence, 4);
  assert.equal(d.resilience, 6 + 1 + 5);
  assert.equal(d.resolve, 3);
  assert.equal(d.influence, 1, "Fel 1 − 1 = 0, clamped to 1 (p.36)");
  assert.equal(d.passiveAwareness, 3, "ceil((3 + Int 3) / 2)");
  assert.equal(d.maxTraumatic, 5);
  assert.equal(deriveStats({ stats: s, overrides: { maxWounds: 20 }, tier: 4 }).maxWounds, 20);
  assert.equal(CharacterStats.parse({}).speed, 6, "empty stats parse with defaults");
});

test("pool caps", () => {
  assert.equal(poolMax("glory", 3), 6);
  assert.equal(poolMax("glory", 5), 7);
  assert.equal(poolMax("ruin", 5), 10);
});

test("sideUpNext alternates, skips ambushed in Round 1, falls back to the side with someone left", () => {
  assert.equal(sideUpNext(table(enc([pc("a"), threat("t")]))), "agents", "players choose first each round");
  assert.equal(sideUpNext(table(enc([pc("a", { acted: true }), pc("b"), threat("t")], { lastSide: "agents" }))), "threats");
  assert.equal(sideUpNext(table(enc([pc("a", { acted: true }), pc("b"), threat("t", { acted: true })], { lastSide: "agents" }))), "agents");
  assert.equal(sideUpNext(table(enc([pc("a", { ambushed: true }), threat("t")]))), "threats", "ambushed agent has no turn in round 1");
  assert.equal(sideUpNext(table(enc([pc("a", { ambushed: true }), threat("t")], { round: 2 }))), "agents");
});

test("canSeize: same side once, GM-only at round start", () => {
  assert.equal(canSeize(table(enc([], { lastSide: "agents" })), "agents"), true);
  assert.equal(canSeize(table(enc([], { lastSide: "agents", seizedSide: "agents" })), "agents"), false, "once before the other side acts");
  assert.equal(canSeize(table(enc([], { lastSide: "agents" })), "threats"), false, "threats act next anyway");
  assert.equal(canSeize(table(enc([])), "threats"), true, "GM seizes the first turn of a round (p.176)");
  assert.equal(canSeize(table(enc([])), "agents"), false);
  assert.equal(canSeize(table(enc([pc("a", { acted: true }), pc("b")], { lastSide: "agents" })), "agents"), false,
    "no Threat left to act: the Agents go again without paying");
});

test("Slain threats and Dead characters are out: no Turns, and they don't hold up the Round", () => {
  const slain = threat("t", { shock: 3 }); // Troop over max Shock (p.324)
  assert.equal(isOut(table(enc([slain])), slain), true);
  assert.equal(sideUpNext(table(enc([pc("a", { acted: true }), slain], { lastSide: "agents" }))), null, "Round is over");
  const dead = pc("a");
  const e = enc([dead, threat("t")]);
  assert.equal(isOut(table(e, [char({ id: "ch-a", traumatic: 3 })]), dead), true, "Tier 1: more than 2 Traumatic Injuries (p.193)");
  assert.equal(canAct(table(e, [char({ id: "ch-a", traumatic: 3 })]), dead), false);
  assert.equal(sideUpNext(table(e, [char({ id: "ch-a", traumatic: 3 })])), "threats");
  assert.equal(isOut(table(e, [char({ id: "ch-a", wounds: 99 })]), dead), false, "Dying characters still take Turns (p.193)");
});

test("threatStatus follows class rules (p.324)", () => {
  assert.deepEqual(threatStatus(threat("t", { shock: 3 })), ["Slain"], "Troop over max Shock dies");
  assert.deepEqual(threatStatus(threat("e", { threatClass: "E", shock: 3 })), ["Exhausted"]);
  assert.deepEqual(threatStatus(threat("a", { threatClass: "A", wounds: 7 })), ["Dying or dead (GM)"]);
  assert.deepEqual(threatStatus(threat("m", { threatClass: "M", wounds: 7 })), ["Slain"]);
  assert.deepEqual(threatStatus(threat("mob", { mobCount: 5, mobStart: 10 })), ["Resolve DN 3 at Round end"], "half slain");
  assert.deepEqual(threatStatus(threat("mob", { mobCount: 0, mobStart: 10 })), ["Slain"]);
});

test("pcStatus: Dying above max Wounds, Dead above Tier + 1 Traumatic Injuries", () => {
  const d = deriveStats({ stats: CharacterStats.parse({ attributes: { S: 4, T: 4, A: 4, I: 4, Wil: 3, Int: 3, Fel: 2 } }), overrides: {}, tier: 1 });
  const c = char;
  assert.deepEqual(pcStatus(c({ wounds: 6 }), d), ["Wounded"], "equal to max is not Dying");
  assert.deepEqual(pcStatus(c({ wounds: 7 }), d), ["Dying"]);
  assert.deepEqual(pcStatus(c({ wounds: 7, traumatic: 3 }), d), ["Dead"]);
  assert.deepEqual(pcStatus(c({ shock: 5 }), d), ["Exhausted"]);
});

test("codex.save validates per kind; player codex drops secrets and unrevealed entries", () => {
  assert.equal(Action.safeParse({ type: "codex.save", kind: "npc", data: { name: "Magos Vex" } }).success, true);
  assert.equal(Action.safeParse({ type: "codex.save", kind: "npc", data: {} }).success, false);
  const beat = (encounter: unknown[]) =>
    Action.safeParse({ type: "codex.save", kind: "beat", data: { adventureId: crypto.randomUUID(), title: "Ambush", encounter } }).success;
  assert.equal(beat([{ threatId: "ork-boy", count: 61 }]), false, "too many individual combatants");
  assert.equal(beat([{ threatId: "ork-boy", count: 500, asMob: true }]), true, "a Mob is one row");
  const codex: Codex = {
    factions: [{ id: "f", name: "Mechanicus", keywords: [], stance: "rival", notes: "", secrets: "wants the tomb" }],
    adventures: [],
    locations: [],
    npcs: [
      { id: "n1", name: "Magos", factionId: null, role: "", description: "", gmNotes: "lies", secrets: "x", attitude: "neutral", statSource: { kind: "quick", tier: 4 }, revealed: true },
      { id: "n2", name: "Hidden", factionId: null, role: "", description: "", gmNotes: "", secrets: "", attitude: "neutral", statSource: { kind: "none" }, revealed: false },
    ],
    handouts: [],
    sessions: [],
  };
  const p = toPlayerCodex(codex);
  assert.deepEqual(p.npcs.map((n) => n.name), ["Magos"]);
  assert.equal(p.npcs[0]!.gmNotes, "");
  assert.equal(p.factions.length, 0);
});
