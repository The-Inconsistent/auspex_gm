import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  Action,
  CharacterDetail,
  CharacterStats,
  Threat,
  threatCite,
  adjustAmmo,
  gearLine,
  requisitionOutcome,
  sheetWeapon,
  requisitionTest,
  requisitionYield,
  canAct,
  canSeize,
  ascensionGroup,
  deriveStats,
  exhaustedShock,
  isExhausted,
  isOut,
  isTimed,
  pcHit,
  pcStatus,
  poolMax,
  roundEndReminders,
  sideUpNext,
  threatStatus,
  toPlayerCodex,
  CodexInput,
  toPlayerView,
  UNSEEN_ID,
  type Character,
  type Codex,
  type Combatant,
  type Encounter,
  type LiveState,
  type ThreatCombatant,
} from "./index.ts";

const orkBoy = Threat.parse(
  JSON.parse(readFileSync(new URL("../../data/threats/ork-boy.json", import.meta.url), "utf8")),
);
const threat = (id: string, o: Partial<ThreatCombatant> = {}): ThreatCombatant => ({
  id,
  kind: "threat",
  acted: false,
  ambushed: false,
  threatId: "ork-boy",
  threatClass: "T",
  label: "Boyz",
  marker: "red",
  mobCount: null,
  mobStart: null,
  wounds: 0,
  shock: 0,
  personalRuin: 0,
  maxWounds: 6,
  maxShock: 2,
  conditions: ["Prone"],
  visibility: "bars",
  stats: orkBoy,
  ...o,
});
const pc = (id: string, o: Partial<Combatant> = {}): Combatant =>
  ({ id, kind: "pc", characterId: `ch-${id}`, acted: false, ambushed: false, ...o }) as Combatant;
const enc = (combatants: Combatant[], o: Partial<Encounter> = {}): Encounter => ({
  id: "e",
  round: 1,
  currentId: null,
  lastSide: null,
  seizedSide: null,
  combatants,
  ...o,
});
const noAccess: LiveState["access"] = { members: [], invites: [], guests: [] };
const char = (o: Partial<Character>): Character => ({
  id: "x",
  name: "x",
  stats: CharacterStats.parse({}),
  overrides: {},
  wounds: 0,
  shock: 0,
  wrath: 2,
  traumatic: 0,
  annihilated: false,
  xp: 0,
  xpSpent: 0,
  xpAtAscension: 0,
  ascensionPackageWaived: false,
  conditions: [],
  detail: CharacterDetail.parse({}),
  objectives: [],
  build: null,
  draft: null,
  builtAt: null,
  ownedUpgrades: [],
  ...o,
});
// A Tier 1 table around an encounter; the turn rules need the characters to know who's Dead.
const table = (e: Encounter, characters: Character[] = []): LiveState => ({
  campaign: {
    id: "c",
    name: "C",
    tier: 1,
    glory: 0,
    ruin: 0,
    framework: "",
    frameworkBonus: "",
    patron: "",
    kind: [],
    limits: [],
    homebrew: false,
    archived: false,
  },
  characters,
  encounter: e,
  spendRequests: [],
  access: noAccess,
});

test("toPlayerView drops hidden threats, hides bars-only threat stats, keeps bars and conditions", () => {
  const s: LiveState = {
    campaign: {
      id: "c",
      name: "C",
      tier: 1,
      glory: 0,
      ruin: 0,
      framework: "",
      frameworkBonus: "",
      patron: "",
      kind: ["investigative"],
      limits: ["body horror"],
      homebrew: false,
      archived: false,
    },
    characters: [],
    encounter: enc(
      [
        threat("a"),
        threat("b", { visibility: "stats" }),
        threat("h", { visibility: "hidden" }),
        pc("p", { acted: true }),
      ],
      { lastSide: "agents" },
    ),
    spendRequests: [],
    access: {
      members: [{ userId: "u1", name: "Ana", role: "player", characterId: null }],
      invites: [{ id: "i", mode: "room", characterId: null, allowGuests: true, expiresAt: "", uses: 0, maxUses: null }],
      guests: [],
    },
  };
  const [hidden, shown, p] = toPlayerView(s, null).encounter!.combatants as [
    ThreatCombatant,
    ThreatCombatant,
    Combatant,
  ];
  assert.equal(hidden.stats, null);
  assert.equal(hidden.maxWounds, 6);
  assert.deepEqual(hidden.conditions, ["Prone"]);
  assert.equal(shown.stats?.name, "Ork Boy");
  assert.deepEqual(p, pc("p", { acted: true }));
  assert.equal(toPlayerView(s, null).encounter!.combatants.length, 3, "the hidden threat isn't sent at all");
  assert.notEqual((s.encounter!.combatants[0] as ThreatCombatant).stats, null, "input not mutated");
  assert.deepEqual(
    toPlayerView(s, null).access,
    { members: s.access.members, invites: [], guests: [] },
    "players see who's seated, never the invite links",
  );
  // The table agreed on them together, so every phone shows them under MISSION (rules-flow §11.79).
  assert.deepEqual(toPlayerView(s, null).campaign.limits, ["body horror"]);
});

test("toPlayerView: each player gets only their own Agent's objectives", () => {
  const goal = [{ text: "Recover the relic", done: false }];
  const s = table(enc([]), [char({ id: "a", objectives: goal }), char({ id: "b", objectives: goal })]);
  const objectives = (viewer: string | null) => toPlayerView(s, viewer).characters.map((c) => c.objectives);
  assert.deepEqual(objectives("a"), [goal, []]);
  assert.deepEqual(objectives("b"), [[], goal]);
  assert.deepEqual(objectives(null), [[], []], "a player without a character sees none");
});

test("toPlayerView: each player sees only their own Agent's Corruption", () => {
  const stats = CharacterStats.parse({ corruption: 7 });
  const s = table(enc([]), [char({ id: "a", stats }), char({ id: "b", stats })]);
  const corruption = (viewer: string | null) => toPlayerView(s, viewer).characters.map((c) => c.stats.corruption);
  assert.deepEqual(corruption("a"), [7, 0]);
  assert.deepEqual(corruption(null), [0, 0], "a player without a character sees none");
});

test("toPlayerView: the GM's Ruin isn't sent", () => {
  const s = table(enc([]), []);
  s.campaign.ruin = 3;
  assert.equal(toPlayerView(s, null).campaign.ruin, 0);
});

test("toPlayerCodex: a handout with an audience reaches only those Agents", () => {
  const h = (id: string, o: Partial<Codex["handouts"][number]> = {}): Codex["handouts"][number] => ({
    id,
    title: id,
    body: "",
    style: "plain",
    header: "",
    revealed: true,
    audience: [],
    revealedAt: null,
    imageId: null,
    imageRevealed: false,
    ...o,
  });
  const codex: Codex = {
    customThreats: [],
    factions: [],
    adventures: [],
    locations: [],
    npcs: [],
    handouts: [h("public"), h("for-a", { audience: ["a", "c"] }), h("unrevealed", { revealed: false })],
    items: [],
    sessions: [],
  };
  const titles = (viewer: string | null) => toPlayerCodex(codex, viewer).handouts.map((x) => x.title);
  assert.deepEqual(titles("a"), ["public", "for-a"]);
  assert.deepEqual(titles("b"), ["public"]);
  assert.deepEqual(titles(null), ["public"]);
  assert.deepEqual(toPlayerCodex(codex, "a").handouts[1]!.audience, ["a"], "the rest of the audience isn't sent");
});

test("the table screen's view (viewer null) carries no Agent's private data", () => {
  const goal = [{ text: "Recover the relic", done: false }];
  const s = table(enc([threat("h", { visibility: "hidden" }), threat("t"), pc("p")]), [
    char({ id: "a", objectives: goal }),
  ]);
  s.campaign.ruin = 3;
  const v = toPlayerView(s, null);
  assert.deepEqual(
    v.characters.map((c) => c.objectives),
    [[]],
  );
  assert.equal(v.campaign.ruin, 0);
  assert.equal(v.encounter!.combatants.length, 2, "the hidden threat isn't sent");
  const codex: Codex = {
    customThreats: [],
    factions: [],
    adventures: [],
    locations: [],
    npcs: [],
    handouts: [
      {
        id: "h",
        title: "private",
        body: "",
        style: "plain",
        header: "",
        revealed: true,
        audience: ["a"],
        revealedAt: null,
        imageId: null,
        imageRevealed: false,
      },
      {
        id: "p",
        title: "public",
        body: "",
        style: "vox",
        header: "",
        revealed: true,
        audience: [],
        revealedAt: null,
        imageId: null,
        imageRevealed: false,
      },
    ],
    items: [],
    sessions: [],
  };
  assert.deepEqual(
    toPlayerCodex(codex, null).handouts.map((h) => [h.title, h.style]),
    [["public", "vox"]], // the style is player-facing: the phone draws the prop (issue #204)
  );
});

test("toPlayerView: a hidden threat's Turn still shows as due", () => {
  const s = table(
    enc([threat("a", { acted: true }), threat("h", { visibility: "hidden" }), pc("p")], { lastSide: "agents" }),
  );
  const e = toPlayerView(s, null).encounter!;
  assert.equal(e.upNext, "threats");
  assert.equal(sideUpNext({ ...s, encounter: e }), "agents", "the filtered combatants alone would get it wrong");
  const acting = (currentId: string) =>
    toPlayerView({ ...s, encounter: { ...s.encounter!, currentId } }, null).encounter!;
  assert.equal(acting("h").currentId, UNSEEN_ID, "a hidden threat's real id never reaches the phones");
  assert.equal(acting("p").currentId, "p");
});

test("deriveStats: sheet formulas, additive mods, overrides, minimum 1", () => {
  const s = CharacterStats.parse({
    attributes: { S: 5, T: 6, A: 5, I: 5, Wil: 3, Int: 3, Fel: 1 },
    armour: { name: "Mk X Tacticus", ar: 5 },
    skills: { Awareness: 3 },
    mods: { maxWounds: 3, resolve: 1 }, // Primaris +3 Wounds, Honour the Chapter +1 Resolve
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
  const bonus = deriveStats({
    stats: { ...s, mods: { passiveAwareness: 2, maxTraumatic: 1 } },
    overrides: {},
    tier: 4,
  });
  assert.equal(bonus.passiveAwareness, 3 + 2, "Ever Vigilant, Core p.133");
  assert.equal(bonus.maxTraumatic, 5 + 1, "Ded 'Ard!, Apocrypha p.235");
  assert.equal(CharacterStats.parse({}).speed, 6, "empty stats parse with defaults");
});

test("pool caps", () => {
  assert.equal(poolMax("glory", 3), 6);
  assert.equal(poolMax("glory", 5), 7);
  assert.equal(poolMax("ruin", 5), 10);
});

test("sideUpNext alternates, skips ambushed in Round 1, falls back to the side with someone left", () => {
  assert.equal(sideUpNext(table(enc([pc("a"), threat("t")]))), "agents", "players choose first each round");
  assert.equal(
    sideUpNext(table(enc([pc("a", { acted: true }), pc("b"), threat("t")], { lastSide: "agents" }))),
    "threats",
  );
  assert.equal(
    sideUpNext(table(enc([pc("a", { acted: true }), pc("b"), threat("t", { acted: true })], { lastSide: "agents" }))),
    "agents",
  );
  assert.equal(
    sideUpNext(table(enc([pc("a", { ambushed: true }), threat("t")]))),
    "threats",
    "ambushed agent has no turn in round 1",
  );
  assert.equal(sideUpNext(table(enc([pc("a", { ambushed: true }), threat("t")], { round: 2 }))), "agents");
});

test("canSeize: same side once, GM-only at round start", () => {
  assert.equal(canSeize(table(enc([], { lastSide: "agents" })), "agents"), true);
  assert.equal(
    canSeize(table(enc([], { lastSide: "agents", seizedSide: "agents" })), "agents"),
    false,
    "once before the other side acts",
  );
  assert.equal(canSeize(table(enc([], { lastSide: "agents" })), "threats"), false, "threats act next anyway");
  assert.equal(canSeize(table(enc([])), "threats"), true, "GM seizes the first turn of a round (p.176)");
  assert.equal(canSeize(table(enc([])), "agents"), false);
  assert.equal(
    canSeize(table(enc([pc("a", { acted: true }), pc("b")], { lastSide: "agents" })), "agents"),
    false,
    "no Threat left to act: the Agents go again without paying",
  );
});

test("Slain threats and Dead characters are out: no Turns, and they don't hold up the Round", () => {
  const slain = threat("t", { shock: 3 }); // Troop over max Shock (p.324)
  assert.equal(isOut(table(enc([slain])), slain), true);
  assert.equal(
    sideUpNext(table(enc([pc("a", { acted: true }), slain], { lastSide: "agents" }))),
    null,
    "Round is over",
  );
  const dead = pc("a");
  const e = enc([dead, threat("t")]);
  assert.equal(
    isOut(table(e, [char({ id: "ch-a", traumatic: 3 })]), dead),
    true,
    "Tier 1: more than 2 Traumatic Injuries (p.193)",
  );
  assert.equal(canAct(table(e, [char({ id: "ch-a", traumatic: 3 })]), dead), false);
  assert.equal(sideUpNext(table(e, [char({ id: "ch-a", traumatic: 3 })])), "threats");
  assert.equal(
    isOut(table(e, [char({ id: "ch-a", wounds: 99 })]), dead),
    false,
    "Dying characters still take Turns (p.193)",
  );
});

test("threatStatus follows class rules (p.324)", () => {
  assert.deepEqual(threatStatus(threat("t", { shock: 3 })), ["Slain"], "Troop over max Shock dies");
  assert.deepEqual(threatStatus(threat("e", { threatClass: "E", shock: 3 })), ["Exhausted"]);
  assert.deepEqual(threatStatus(threat("a", { threatClass: "A", wounds: 7 })), ["Dying or dead (GM)"]);
  assert.deepEqual(threatStatus(threat("m", { threatClass: "M", wounds: 7 })), ["Slain"]);
  assert.deepEqual(
    threatStatus(threat("mob", { mobCount: 5, mobStart: 10 })),
    ["Resolve DN 3 at Round end"],
    "half slain",
  );
  assert.deepEqual(threatStatus(threat("mob", { mobCount: 0, mobStart: 10 })), ["Slain"]);
});

test("pcStatus: Dying above max Wounds, Dead above Tier + 1 Traumatic Injuries", () => {
  const d = deriveStats({
    stats: CharacterStats.parse({ attributes: { S: 4, T: 4, A: 4, I: 4, Wil: 3, Int: 3, Fel: 2 } }),
    overrides: {},
    tier: 1,
  });
  const c = char;
  assert.deepEqual(pcStatus(c({ wounds: 6 }), d), ["Wounded"], "equal to max is not Dying");
  assert.deepEqual(pcStatus(c({ wounds: 7 }), d), ["Dying"]);
  assert.deepEqual(pcStatus(c({ wounds: 7, traumatic: 3 }), d), ["Dead"]);
  assert.deepEqual(pcStatus(c({ shock: 5 }), d), ["Exhausted"]);
});

test("pcHit: Exhausted Shock → Mortal Wounds, Dying → Traumatic Injury, Annihilation (pp.193-199)", () => {
  // Tier 1, T 4, Wil 3: Max Wounds 6, Max Shock 4.
  const d = deriveStats({
    stats: CharacterStats.parse({ attributes: { S: 4, T: 4, A: 4, I: 4, Wil: 3, Int: 3, Fel: 2 } }),
    overrides: {},
    tier: 1,
  });
  const hit = (o: Partial<Character>, h: { wounds?: number; shock?: number }) => pcHit({ c: char(o), d, hit: h });
  assert.deepEqual(
    hit({ shock: 3 }, { shock: 2 }),
    { wounds: 0, shock: 5, traumatic: 0, prone: false, annihilated: false },
    "the Shock that Exhausts stays Shock (§11.12)",
  );
  assert.equal(hit({ shock: 5 }, { shock: 2 }).wounds, 2, "Exhausted: Shock → Mortal Wounds (p.199)");
  assert.equal(hit({ shock: 5 }, { shock: 2 }).shock, 5);
  assert.equal(
    hit({ conditions: ["Exhausted"] }, { shock: 1 }).wounds,
    1,
    "the Exhausted Condition from another source counts too",
  );
  assert.equal(hit({ shock: 5 }, { shock: -1 }).shock, 4, "recovering Shock is never converted");
  assert.deepEqual(
    hit({ wounds: 5 }, { wounds: 2 }),
    { wounds: 7, shock: 0, traumatic: 0, prone: true, annihilated: false },
    "becoming Dying: Prone",
  );
  assert.deepEqual(
    hit({ wounds: 7 }, { wounds: 4 }),
    { wounds: 7, shock: 0, traumatic: 1, prone: false, annihilated: false },
    "one Traumatic Injury per hit",
  );
  assert.equal(
    hit({ wounds: 7, shock: 5 }, { shock: 3 }).traumatic,
    1,
    "Mortal Wounds from Shock while Dying are a Traumatic Injury too",
  );
  assert.equal(hit({ wounds: 9 }, { wounds: -1 }).wounds, 6, "any healing ends Dying");
  assert.equal(hit({}, { wounds: 12 }).annihilated, false, "exactly double is not Annihilation");
  assert.deepEqual(
    hit({ wounds: 2 }, { wounds: 13 }),
    { wounds: 2, shock: 0, traumatic: 0, prone: false, annihilated: true },
    "more than double: dead (p.194)",
  );
  assert.deepEqual(pcStatus(char({ annihilated: true }), d), ["Dead"]);
});

test("Threats: Exhausted Shock, timed Conditions, Round-end Mob Resolve", () => {
  assert.equal(isExhausted(threat("e", { threatClass: "E", shock: 3 })), true);
  assert.deepEqual(exhaustedShock({ exhausted: true, wounds: 1, shock: 2 }), { wounds: 3, shock: 0 });
  assert.deepEqual(exhaustedShock({ exhausted: false, shock: 2 }), { wounds: 0, shock: 2 });
  assert.deepEqual(["Hindered", "Hindered (2)", "Vulnerable (1)", "Staggered", "Pinned", "Prone"].filter(isTimed), [
    "Hindered",
    "Hindered (2)",
    "Vulnerable (1)",
    "Staggered",
  ]);
  const e = enc([
    threat("m", { label: "Boyz ×10", mobCount: 5, mobStart: 10 }),
    threat("n", { mobCount: 6, mobStart: 10 }),
    threat("z", { mobCount: 0, mobStart: 10 }),
  ]);
  assert.deepEqual(
    roundEndReminders(e).map((r) => r.split(":")[0]),
    ["Boyz ×10"],
    "half or more slain; a wiped Mob has no one left to flee",
  );
});

test("codex.save validates per kind; player codex drops secrets and unrevealed entries", () => {
  assert.equal(Action.safeParse({ type: "codex.save", kind: "npc", data: { name: "Magos Vex" } }).success, true);
  assert.equal(Action.safeParse({ type: "codex.save", kind: "npc", data: {} }).success, false);
  const beat = (encounter: unknown[]) =>
    Action.safeParse({
      type: "codex.save",
      kind: "beat",
      data: { adventureId: crypto.randomUUID(), title: "Ambush", encounter },
    }).success;
  assert.equal(beat([{ threatId: "ork-boy", count: 61 }]), false, "too many individual combatants");
  assert.equal(beat([{ threatId: "ork-boy", count: 500, asMob: true }]), true, "a Mob is one row");
  const codex: Codex = {
    customThreats: [],
    factions: [{ id: "f", name: "Mechanicus", keywords: [], stance: "rival", notes: "", secrets: "wants the tomb" }],
    adventures: [],
    locations: [],
    npcs: [
      {
        id: "n1",
        name: "Magos",
        factionId: null,
        role: "",
        description: "",
        gmNotes: "lies",
        secrets: "x",
        attitude: "uncooperative",
        statSource: { kind: "quick", tier: 4 },
        revealed: true,
        imageId: null,
        imageRevealed: false,
      },
      {
        id: "n2",
        name: "Hidden",
        factionId: null,
        role: "",
        description: "",
        gmNotes: "",
        secrets: "",
        attitude: "neutral",
        statSource: { kind: "none" },
        revealed: false,
        imageId: null,
        imageRevealed: false,
      },
    ],
    handouts: [],
    items: [],
    sessions: [],
  };
  const p = toPlayerCodex(codex, null);
  assert.deepEqual(
    p.npcs.map((n) => n.name),
    ["Magos"],
  );
  assert.equal(p.npcs[0]!.gmNotes, "");
  assert.equal(p.npcs[0]!.secrets, "");
  assert.deepEqual(p.npcs[0]!.statSource, { kind: "none" });
  assert.equal(p.npcs[0]!.attitude, "uncooperative", "attitude reaches phones (rules-flow §11.89)");
  assert.equal(p.factions.length, 0);
});

test("a revealed place reaches phones without its hazards, notes or list (issue #49)", () => {
  const hazard = { id: "00000000-0000-4000-8000-000000000002", kind: "book", hazardId: "core-falling" };
  const place = {
    id: "00000000-0000-4000-8000-000000000001",
    ...CodexInput.location.parse({ name: "Shaft", revealed: true, hazards: "[notes]", hazardList: [hazard] }),
  };
  const [p] = toPlayerCodex(
    {
      factions: [],
      adventures: [],
      locations: [place],
      npcs: [],
      handouts: [],
      items: [],
      sessions: [],
      customThreats: [],
    },
    null,
  ).locations;
  assert.deepEqual([p!.name, p!.hazards, p!.hazardList], ["Shaft", "", []]);
});

test("a revealed entry's picture reaches phones only once it's shown too (issue #199)", () => {
  const imageId = "00000000-0000-4000-8000-0000000000aa";
  const npc = (imageRevealed: boolean) => ({
    id: "00000000-0000-4000-8000-000000000001",
    ...CodexInput.npc.parse({ name: "Magos", revealed: true, imageId, imageRevealed }),
  });
  const handout = (imageRevealed: boolean) => ({
    id: "00000000-0000-4000-8000-000000000002",
    revealedAt: null,
    ...CodexInput.handout.parse({ title: "Pict", revealed: true, imageId, imageRevealed }),
  });
  const view = (shown: boolean) =>
    toPlayerCodex(
      {
        factions: [],
        adventures: [],
        locations: [],
        npcs: [npc(shown)],
        handouts: [handout(shown)],
        items: [],
        sessions: [],
        customThreats: [],
      },
      null,
    );
  assert.deepEqual([view(false).npcs[0]!.imageId, view(false).handouts[0]!.imageId], [null, null]);
  assert.deepEqual([view(true).npcs[0]!.imageId, view(true).handouts[0]!.imageId], [imageId, imageId]);
  assert.equal(CodexInput.location.parse({ name: "Shaft" }).imageId, null, "no picture by default");
});

test("adjustAmmo: per type, clamped at 0, −1 on an empty type removes it (p.229)", () => {
  assert.deepEqual(adjustAmmo({}, { kind: "Bolt", delta: 1 }), { Bolt: 1 });
  assert.deepEqual(adjustAmmo({ Bolt: 1, Las: 2 }, { kind: "Bolt", delta: -3 }), { Bolt: 0, Las: 2 });
  assert.deepEqual(adjustAmmo({ Bolt: 0, Las: 2 }, { kind: "Bolt", delta: -1 }), { Las: 2 });
});

test("requisitionTest: shared Keywords, bonus dice, [ANY], DN = Value + Rarity (pp.205-206)", () => {
  const gwyth = ["IMPERIUM", "ASTRA MILITARUM", "SCUM"];
  // The book's example: Hot-Shot Volley Gun, Value 6, Rare → DN 8, one extra matching Keyword → +1 die (p.205).
  const volley = requisitionTest({
    keywords: gwyth,
    itemKeywords: ["Imperium", "Astra Militarum"],
    value: 6,
    rarity: "Rare",
  });
  assert.deepEqual([volley.eligible, volley.dn, volley.bonusDice], [true, 8, 1]);
  assert.equal(
    requisitionTest({ keywords: gwyth, itemKeywords: ["AELDARI"], value: 6, rarity: "Rare" }).eligible,
    false,
  );
  // [ANY] is open to everyone, and counts as one more of their Keywords when one is left unmatched (§11.15).
  assert.equal(
    requisitionTest({ keywords: ["ORK"], itemKeywords: ["[ANY]"], value: 2, rarity: "Common" }).eligible,
    true,
  );
  assert.equal(
    requisitionTest({ keywords: gwyth, itemKeywords: ["IMPERIUM", "SCUM", "[ANY]"], value: 3, rarity: "Uncommon" })
      .bonusDice,
    2,
  );
  assert.equal(
    requisitionTest({ keywords: ["IMPERIUM"], itemKeywords: ["IMPERIUM", "[ANY]"], value: 3, rarity: "Common" })
      .bonusDice,
    0,
  );
});

test("requisitionOutcome and requisitionYield (p.205, p.229)", () => {
  // The example again: 7 Icons against DN 8, 1 Wealth spent → success.
  assert.deepEqual(requisitionOutcome({ dn: 8, icons: 7, spend: 1, complication: false, wealth: 3 }), {
    success: true,
    wealth: 2,
  });
  assert.deepEqual(requisitionOutcome({ dn: 8, icons: 5, spend: 0, complication: true, wealth: 0 }), {
    success: false,
    wealth: 0,
  });
  assert.equal(requisitionYield("ammo", "Uncommon"), 3);
  assert.equal(requisitionYield("grenade", "Very Rare"), 2); // Plasma Grenades example
});

test("sheetWeapon and gearLine: catalogue entries on a sheet (p.207)", () => {
  const knife = { name: "Knife", weapon: { addStrength: true, damage: 2, ed: 2, range: [1], thrown: 4, traits: [] } };
  assert.deepEqual(sheetWeapon(knife, 5), {
    name: "Knife",
    addStrength: true,
    damage: 2,
    ed: 2,
    range: [1],
    traits: ["Thrown (20 m)"],
  });
  const frag = {
    name: "Frag Grenade",
    weapon: { addStrength: false, damage: 10, ed: 4, thrown: 4, salvo: null, traits: ["Blast (6)"] },
  };
  assert.deepEqual(sheetWeapon(frag, 9).range, [36]);
  assert.equal(
    gearLine({
      name: "Tacticus Mk X",
      source: "core",
      page: 233,
      armour: { ar: 5, invulnerable: false, powered: 4, traits: [] },
    }),
    "Tacticus Mk X (AR 5, Powered (4); Core p.233)",
  );
});

test("threatCite uses the SOURCES cite, or the threat-only one", () => {
  assert.equal(threatCite({ source: "core", page: 339 }), "Core p.339");
  assert.equal(threatCite({ source: "vow-of-absolution", page: 43 }), "VoA p.43");
  assert.equal(threatCite({ source: "gutshivas-kommandos", page: 8 }), "GK p.8");
});

test("phones get no items: an Agent sees one as a line on their sheet once it's given (issue #51)", () => {
  const item = {
    id: "00000000-0000-4000-8000-000000000003",
    givenTo: "a",
    ...CodexInput.item.parse({ name: "Auspex" }),
  };
  assert.deepEqual(item.mods, [], "an item defaults to no Powers");
  assert.equal(item.wargearId, null);
  const codex: Codex = {
    factions: [],
    adventures: [],
    locations: [],
    npcs: [],
    handouts: [],
    items: [item],
    sessions: [],
    customThreats: [],
  };
  assert.deepEqual(toPlayerCodex(codex, "a").items, []);
});

test("toPlayerView: every phone sees every pending spend request (rules-flow §11.123)", () => {
  const spendRequests = [
    { id: "r1", characterId: "a", kind: "reroll" as const, amount: 1, createdAt: "2026-01-01T00:00:00.000Z" },
    { id: "r2", characterId: "b", kind: "gloryDice" as const, amount: 2, createdAt: "2026-01-01T00:00:01.000Z" },
  ];
  const s = { ...table(enc([])), spendRequests };
  assert.deepEqual(toPlayerView(s, "a").spendRequests, spendRequests);
  assert.deepEqual(toPlayerView(s, null).spendRequests, spendRequests);
});

test("Chaos Spawn: an Agent at 26 Corruption is Lost, out of the fight and of the Ascension (Core p.286)", () => {
  const lost = char({ id: "lost", stats: CharacterStats.parse({ corruption: 26 }) });
  const fine = char({ id: "fine", stats: CharacterStats.parse({ corruption: 25 }) });
  const status = (c: Character) => pcStatus(c, deriveStats({ stats: c.stats, overrides: {}, tier: 1 }));
  assert.deepEqual(status(lost), ["Lost"]);
  assert.deepEqual(status(fine), []);
  assert.deepEqual(
    ascensionGroup([lost, fine], 1).group.map((c) => c.id),
    ["fine"],
  );
  // Another phone doesn't get the points, but sees who is Lost.
  const seen = toPlayerView({ ...table(null as never, [lost, fine]), encounter: null }, null).characters;
  assert.deepEqual(seen.map(status), [["Lost"], []]);
  assert.deepEqual(
    seen.map((c) => c.stats.corruption),
    [26, 0],
  );
});
