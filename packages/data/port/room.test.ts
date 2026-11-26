import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { CampaignExport, CharacterStats, type CharacterBuildInput } from "@wg/shared";
import { hazards, wargear } from "../index.ts";
import { remapApproval } from "./build-catalogue.ts";
import { buildParams } from "./build-params.ts";
import { buildCreationPacks, CATALOGUE_PACKS } from "./creation-packs.ts";
import { loadCoreSchema, loadEngine } from "./engine.ts";
import { buildCustomThreatPack, buildPack } from "./pack.ts";
import { buildRoomDocument, CAPS, Refusal } from "./room.ts";
import { buildRuleset } from "./ruleset.ts";
import { buildWorld, HANDOUT_DEFAULT_HEADER } from "./world.ts";

// The room converter on an export invented here: every name and text is made up; the sheets and builds are the repo's
// own pregens. Checked against InconsisTable's RoomDocument when its checkout has one, else those tests skip.
const core = await loadCoreSchema();
const engine = await loadEngine();
const noDocument =
  core === null
    ? "InconsisTable is not checked out beside this repo"
    : !core.RoomDocument && "this InconsisTable checkout has no room document yet";
// A GM approval moves with the creation pack's wording, which only the platform's ledger builder gives.
const reworded =
  engine?.BuildParams && engine.buildSchemas
    ? buildCreationPacks(engine.buildSchemas(engine.BuildParams.parse(buildParams()))).port.reworded
    : [];

const pregen = (file: string) =>
  JSON.parse(readFileSync(new URL(`../fixtures/pregens/${file}`, import.meta.url), "utf8")) as {
    build: CharacterBuildInput;
    stats: unknown;
  };
const [sergeant, marksman, disruptor] = [
  pregen("01-watch-sergeant.json"),
  pregen("04-marksman.json"),
  pregen("02-disruptor.json"),
];

// An approval of a requirement the creation pack rewords, which has to move to the port's path (when the platform's
// builder is here to say which are reworded).
const moved = reworded[0] ? [`archetype/requires/${reworded[0].auspex}`.slice(0, 200)] : [];

const id = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, "0")}`;
const ID = {
  ash: id(1),
  bel: id(2),
  cog: id(3),
  choir: id(10),
  rell: id(11),
  quill: id(12),
  herald: id(13),
  hive: id(14),
  vault: id(15),
  notice: id(16),
  intercept: id(17),
  scrap: id(18),
  key: id(19),
  bell: id(20),
  adventure: id(21),
  bells: id(22),
  descent: id(23),
  wire: id(24),
  fall: id(25),
  picture: id(30),
  session: id(40),
  nowhere: id(99),
} as const;
const threatPack = buildPack().pack;
const BOOK_THREAT = threatPack.entries.find((e) => e.type === "threat")!.key;
const BOOK_HAZARD = [...hazards.keys()][0]!;
const WARGEAR = [...wargear.keys()][0]!;
const LONG_PURPOSE = "Hear which of the bells is cracked before the choir notices the Agents in the gallery above";
const LONG_EXIT = "Back up the stairs to the bell gallery, if anyone is still standing after the vault gives way";

const character = (over: Record<string, unknown>) => ({
  builtAt: null,
  wounds: 0,
  shock: 0,
  wrath: 2,
  traumatic: 0,
  annihilated: false,
  xp: 0,
  conditions: [],
  detail: {},
  objectives: [],
  overrides: {},
  ...over,
});

const exported = CampaignExport.parse({
  format: "auspex-campaign",
  version: 1,
  exportedAt: "2026-01-01T00:00:00.000Z",
  campaign: {
    name: "The Silent Choir",
    tier: 3,
    glory: 2,
    ruin: 1,
    framework: "Hunt the choir",
    patron: "",
    kind: ["grim"],
    limits: [],
    homebrew: true,
    nextSessionAt: "2026-12-01T18:00:00.000Z",
    nextSessionPlace: "Upstairs",
  },
  characters: [
    character({
      id: ID.ash,
      name: "Ash Vey",
      build: sergeant.build,
      builtAt: 1,
      stats: {
        ...CharacterStats.parse(sergeant.stats),
        wealth: 5,
        ammo: { Bolt: 2, "Kraken Bolt": 1 },
        requisitioned: { ammo: ID.session },
      },
      wounds: 3,
      shock: 1,
      wrath: 1,
      traumatic: 1,
      xp: 12,
      conditions: ["Bleeding", "Hindered (2)", "Glowing"],
      detail: { appearance: "Tall.", personality: "Grim.", portrait: "p1" },
      overrides: { defence: 3 },
      objectives: [
        { text: "Find the vox key", adventureId: ID.adventure, beatId: ID.bells },
        { text: "Keep the oath", done: true, rolled: true },
        { text: "Mind the stair", adventureId: ID.nowhere },
      ],
    }),
    character({
      id: ID.bel,
      name: "Bel Ostra",
      build: { ...marksman.build, gm: { ...marksman.build.gm, approved: [...marksman.build.gm!.approved!, ...moved] } },
      stats: { ...(marksman.stats as object), ammo: {} },
    }),
    character({
      id: ID.cog,
      name: "Cog",
      build: null,
      stats: { ...(disruptor.stats as object), ammo: {} },
      annihilated: true,
    }),
  ],
  codex: {
    factions: [
      {
        id: ID.choir,
        name: "The Brass Choir",
        keywords: ["CHOIR", "BRASS"],
        stance: "rival",
        notes: "Sings for @[npc:" + ID.rell + "].",
        secrets: "Owes @[location:" + ID.hive + "].",
      },
    ],
    locations: [
      {
        id: ID.hive,
        name: "Rust Hive",
        description: "Scrap and steam.",
        hazards: "Falling scrap",
        hazardList: [
          { id: ID.fall, kind: "book", hazardId: BOOK_HAZARD, variant: "Moderate" },
          {
            id: ID.wire,
            kind: "custom",
            name: "Live wire",
            effect: "It bites.",
            tests: [{ kind: "attribute", attribute: "A", dn: 3, purpose: "Step over it" }],
          },
        ],
        revealed: true,
      },
      {
        id: ID.vault,
        name: "Lower Vault",
        parentId: ID.hive,
        description: "Dark under @[location:" + ID.hive + "].",
        gmNotes: "See @[scene:" + ID.descent + "].",
      },
    ],
    npcs: [
      {
        id: ID.rell,
        name: "Deacon Rell",
        factionId: ID.choir,
        role: "Cantor",
        description: "Hums. Holds @[handout:" + ID.notice + "].",
        gmNotes: "Sworn to @[faction:" + ID.choir + "].",
        secrets: "He cracked the bell.",
        attitude: "hostile",
        statSource: { kind: "bestiary", threatId: BOOK_THREAT },
        revealed: true,
        imageId: ID.picture,
        imageRevealed: true,
      },
      {
        id: ID.quill,
        name: "Old Quill",
        statSource: { kind: "quick", tier: 2, specialty: { skill: "Awareness", dice: 6 } },
      },
      {
        id: ID.herald,
        name: "Scrap Herald",
        attitude: "friendly",
        factionId: ID.nowhere,
        statSource: { kind: "bestiary", threatId: "custom-scrap-thrall" },
      },
    ],
    handouts: [
      { id: ID.notice, title: "Notice", body: "Silence at dusk.", style: "decree", revealed: true, revealedAt: null },
      {
        id: ID.intercept,
        title: "Intercept",
        body: "Bring @[item:" + ID.key + "].",
        style: "vox",
        header: "INTERCEPT 7",
        revealed: true,
        audience: [ID.ash],
        revealedAt: "2026-01-02T00:00:00.000Z",
      },
      // Shown once and sealed again: its reveal time has no place.
      { id: ID.scrap, title: "Scrap note", style: "plain", revealedAt: "2026-01-01T00:00:00.000Z" },
    ],
    items: [
      {
        id: ID.key,
        name: "Rusted Key",
        wargearId: WARGEAR,
        description: "Cold iron.",
        locationId: ID.vault,
        mods: [{ kind: "damage", delta: 1 }],
        givenTo: null,
      },
      { id: ID.bell, name: "Choir Bell", npcId: ID.rell, givenTo: null },
      { id: id(26), name: "Spare Bell", description: "Small.", givenTo: ID.bel },
    ],
    adventures: [
      {
        id: ID.adventure,
        title: "The Silent Choir",
        premise: "Stop @[npc:" + ID.rell + "].",
        status: "running",
        shown: true,
        brief: "Stop the song.",
        beats: [
          {
            id: ID.descent,
            order: 1,
            adventureId: ID.adventure,
            title: "The Descent",
            type: "investigation",
            goal: "Find the key",
            outcome: "Found it",
            locationId: ID.vault,
            exits: [{ label: LONG_EXIT, beatId: ID.bells }],
            tests: [{ kind: "attribute", attribute: "Int", dn: 4, purpose: "Read the lock" }],
          },
          {
            id: ID.bells,
            order: 0,
            adventureId: ID.adventure,
            title: "The Bells",
            type: "combat",
            goal: "Outlast @[npc:" + ID.rell + "]",
            status: "active",
            readAloud: "Bells ring. @[item:" + ID.key + "] glints.",
            gmNotes: "Keep it short.",
            locationId: ID.hive,
            npcIds: [ID.rell],
            handoutIds: [ID.notice],
            itemIds: [ID.key],
            encounter: [
              {
                threatId: BOOK_THREAT,
                count: 3,
                marker: "red",
                label: "Choir Guards",
                visibility: "stats",
                scale: true,
              },
              { threatId: "custom-scrap-thrall", count: 6, asMob: true },
            ],
            tests: [
              {
                kind: "skill",
                skill: "Awareness",
                dn: 3,
                who: "each",
                purpose: "Spot the bells",
                onSuccess: "They see it.",
                onFailure: "Ambushed.",
                shifts: ["One", "Two", "Three", "Four", "Five"],
              },
              { kind: "opposed", skill: "Deception", who: "one", purpose: "Out-sing the deacon" },
              { kind: "resolve", dn: 2, purpose: LONG_PURPOSE },
              { kind: "corruption", dn: 3, who: "each" },
            ],
            glory: [{ text: "A bold stand", amount: 2 }],
            ruin: [{ text: "A 6 on the Wrath Die", amount: 1 }],
            spends: [{ pool: "ruin", name: "Reinforcements", cost: 2, text: "Two more." }],
            exits: [
              { label: "Down to the vault", beatId: ID.descent },
              { label: "Run for it", beatId: null },
            ],
            hazards: [
              { id: ID.wire, spotted: true },
              { id: ID.nowhere, spotted: false },
            ],
            onEntry: [ID.rell, ID.notice, ID.vault],
          },
        ],
      },
    ],
    sessions: [
      {
        id: ID.session,
        number: 1,
        title: "First bell",
        startedAt: "2026-01-01T19:00:00.000Z",
        endedAt: "2026-01-01T23:00:00.000Z",
        recap: "Met @[npc:" + ID.rell + "] and @[npc:" + ID.nowhere + "].",
        notes: "Slow.",
        xp: 10,
      },
    ],
    customThreats: [
      {
        id: "custom-scrap-thrall",
        name: "Scrap Thrall",
        source: "custom",
        page: 1,
        faction: "heretic",
        keywords: ["HERETIC"],
        threat: ["T", "T", "T", "T"],
        attributes: { S: 3, T: 3, A: 3, I: 3, Wil: 2, Int: 1, Fel: 1 },
        resilience: { value: 4 },
        defence: 2,
        wounds: 1,
        shock: 2,
        skills: { default: 3, list: [] },
        conviction: 2,
        resolve: 1,
        speed: 6,
        size: "Avg",
      },
    ],
  },
  images: [
    { id: ID.picture, mime: "image/jpeg", base64: Buffer.from([0xff, 0xd8, 0xff, 0xe0]).toString("base64") },
    { broken: 1 },
  ],
});

const { document, report } = buildRoomDocument(exported, { reworded });
const entry = (entryId: string) => document.codex.find((e) => e.id === entryId)!;
const scene = entry(ID.bells);
const descent = entry(ID.descent);

test("the document passes InconsisTable's RoomDocument", { skip: noDocument }, () => {
  const parsed = core!.RoomDocument!.safeParse(document);
  if (!parsed.success)
    assert.fail(parsed.error.issues.map((i) => `${i.path.map(String).join(".")}: ${i.message}`).join("\n"));
});

test("the converter's caps are the platform's", { skip: noDocument }, () => {
  const limits = core!.ROOM_LIMITS!;
  assert.equal(CAPS.imageBase64, limits.imageBase64);
  assert.equal(CAPS.images, limits.images);
  assert.equal(CAPS.lines, core!.MAX_PREP_LINES);
  assert.equal(CAPS.outcomes, core!.MAX_TEST_OUTCOMES);
});

test("every reference in the document names something in it", () => {
  const entries = new Set(document.codex.map((e) => e.id));
  const actors = new Set(document.actors.map((a) => a.id));
  const images = new Set(document.images.map((p) => p.id));
  const linkFields = ["faction", "location", "holder"];
  for (const e of document.codex) {
    const named = [
      e.parentId,
      ...(e.links ?? []),
      ...(e.prep?.exits.map((l) => l.sceneId as string) ?? []),
      ...(e.prep?.reveals.map((l) => l.entryId as string) ?? []),
      ...[e.body, e.gmNotes].flatMap((t) => [...(t ?? "").matchAll(/@\[[^\]\n]*\]\(([^)\s]+)\)/g)].map((m) => m[1])),
      ...linkFields.map((f) => e.fields?.[f] as string | undefined),
    ];
    for (const n of named) if (n !== undefined) assert.ok(entries.has(n), `${e.title}: ${n}`);
    for (const a of e.audience ?? []) assert.ok(actors.has(a), `${e.title}: reader ${a}`);
    if (e.imageId) assert.ok(images.has(e.imageId), e.title);
  }
  for (const s of document.sessions)
    for (const m of (s.recap ?? "").matchAll(/@\[[^\]\n]*\]\(([^)\s]+)\)/g)) assert.ok(entries.has(m[1]!));
});

test("the room: name, next session, Tier, pools, and the versions it expects", () => {
  assert.deepEqual(document.room, {
    name: "The Silent Choir",
    nextSessionAt: "2026-12-01T18:00:00.000Z",
    nextSessionPlace: "Upstairs",
  });
  assert.deepEqual(document.campaignFields, { tier: 3 });
  assert.deepEqual(document.pools, { glory: 2, ruin: 1 });
  const ledger = buildRuleset({ builder: "ledger" });
  const world = buildWorld();
  assert.deepEqual(document.expects, {
    ruleset: { slug: "wrath-and-glory", version: ledger.version },
    packs: [
      CATALOGUE_PACKS.creation,
      CATALOGUE_PACKS.wargear,
      { slug: threatPack.id, version: threatPack.version },
      { slug: buildCustomThreatPack(exported).pack.id, version: "0.1.0" },
    ],
    world: { slug: world.id, version: world.version },
  });
  assert.equal(document.sessions.length, 1);
  assert.deepEqual(document.sessions[0], {
    title: "First bell",
    recap: `Met @[Deacon Rell](${ID.rell}) and @[npc:${ID.nowhere}].`,
    notes: "Slow.",
  });
  assert.deepEqual(
    document.images.map((p) => p.id),
    [ID.picture],
  );
});

test("characters: a build with the fields it does not write, a hand-made sheet, resources and Conditions", () => {
  const [ash, bel, cog] = document.actors;
  assert.equal(ash!.entityType, undefined);
  assert.deepEqual(JSON.parse(ash!.build!).archetypeId, sergeant.build.archetypeId);
  assert.deepEqual(ash!.fields, {
    name: "Ash Vey",
    xp: 12,
    "detail.appearance": "Tall.",
    "detail.personality": "Grim.",
    traumatic: 1,
  });
  assert.deepEqual(ash!.resources, { wrath: 1, wealth: 5, corruption: 0, wounds: 3, shock: 1, ammoBolt: 2 });
  assert.deepEqual(ash!.conditions, ["bleeding", "hindered"]);
  // The marksman's GM approval stays; one of a reworded requirement moves to the port's wording.
  const approved = (JSON.parse(bel!.build!) as { gm: { approved: string[] } }).gm.approved;
  assert.deepEqual(approved, [
    ...marksman.build.gm!.approved!,
    ...(reworded[0] ? [`archetype/requires/${reworded[0].port}`.slice(0, 200)] : []),
  ]);
  const stats = CharacterStats.parse(disruptor.stats);
  assert.equal(cog!.build, undefined);
  assert.equal(cog!.entityType, "agent");
  assert.equal(cog!.fields!["attr.wil"], stats.attributes.Wil);
  assert.equal(cog!.fields!.species, stats.species);
  assert.equal(cog!.fields!.annihilated, true);
});

test("objectives: one quest each, read by that character alone, its story as a mention in the GM notes", () => {
  const quests = document.codex.filter((e) => e.kind === "quest");
  assert.deepEqual(
    quests.map((q) => [q.title, q.status, q.visibility, q.audienceMode, q.audience]),
    [
      ["Find the vox key", "open", "party", "listed", [ID.ash]],
      ["Keep the oath", "done", "party", "listed", [ID.ash]],
      ["Mind the stair", "open", "party", "listed", [ID.ash]],
    ],
  );
  assert.equal(quests[0]!.gmNotes, `Story: @[The Bells](${ID.bells})`);
  assert.equal(quests[1]!.gmNotes, "Rolled for the session on the Faction's table");
  assert.equal(new Set(quests.map((q) => q.id)).size, 3);
  assert.equal(buildRoomDocument(exported, { reworded }).document.codex.at(-1)!.id, quests[2]!.id, "the same ids");
});

test("factions, NPCs, places, handouts and items", () => {
  assert.deepEqual(entry(ID.choir), {
    id: ID.choir,
    kind: "faction",
    title: "The Brass Choir",
    body: `Sings for @[Deacon Rell](${ID.rell}).`,
    gmNotes: `Owes @[Rust Hive](${ID.hive}).`,
    fields: { stance: "rival", keywords: "CHOIR · BRASS" },
  });
  const rell = entry(ID.rell);
  assert.deepEqual(rell.fields, { attitude: "hostile", role: "Cantor", stats: BOOK_THREAT, faction: ID.choir });
  assert.equal(rell.gmNotes, `Sworn to @[The Brass Choir](${ID.choir}).\n\nSecrets: He cracked the bell.`);
  assert.deepEqual([rell.visibility, rell.imageId, rell.imageRevealed], ["party", ID.picture, true]);
  const quill = entry(ID.quill);
  assert.equal(quill.fields, undefined, "neutral is left unset");
  assert.equal(quill.gmNotes, "Quick NPC stats (Core p.326): Tier 2, Awareness 6");
  assert.equal(quill.visibility, undefined);
  assert.deepEqual(entry(ID.herald).fields, { attitude: "friendly", stats: "custom-scrap-thrall" });

  const hive = entry(ID.hive);
  assert.deepEqual(hive.fields, { hazards: "Falling scrap" });
  assert.equal(hive.visibility, "party");
  assert.equal(
    hive.gmNotes,
    `Hazard: ${hazards.get(BOOK_HAZARD)!.name} (Moderate)\n\nHazard: Live wire. It bites.. attribute Test, Agility, DN 3, ONE. Step over it`,
  );
  const vault = entry(ID.vault);
  assert.equal(vault.parentId, ID.hive);
  assert.equal(vault.gmNotes, `See @[The Descent](${ID.descent}).`);

  const notice = entry(ID.notice);
  assert.deepEqual(
    [notice.layout, notice.header, notice.visibility, notice.audienceMode],
    ["proclamation", HANDOUT_DEFAULT_HEADER.decree, "party", undefined],
  );
  const intercept = entry(ID.intercept);
  assert.deepEqual(
    [intercept.layout, intercept.header, intercept.audienceMode, intercept.audience],
    ["transcript", "INTERCEPT 7", "listed", [ID.ash]],
  );
  // The reveal time travels with a shown handout (house decision #86); a handout shown with no time has none.
  assert.equal(intercept.revealedAt, "2026-01-02T00:00:00.000Z");
  assert.equal(notice.revealedAt, undefined);
  const scrap = entry(ID.scrap);
  assert.deepEqual(
    [scrap.layout, scrap.header, scrap.visibility, scrap.revealedAt],
    ["plain", undefined, undefined, undefined],
  );

  const key = entry(ID.key);
  assert.deepEqual(key.fields, { location: ID.vault });
  assert.equal(
    key.gmNotes,
    `Catalogue: ${wargear.get(WARGEAR)!.name} (${WARGEAR})\n\nRelic Power: {"kind":"damage","delta":1}`,
  );
  assert.deepEqual(entry(ID.bell).fields, { holder: ID.rell });
  const given = entry(id(26));
  assert.deepEqual([given.visibility, given.audienceMode, given.audience], ["party", "listed", [ID.bel]]);
});

test("the adventure and its scenes, in order, with their fields, links and status", () => {
  assert.deepEqual(entry(ID.adventure), {
    id: ID.adventure,
    kind: "adventure",
    title: "The Silent Choir",
    gmNotes: `Stop @[Deacon Rell](${ID.rell}).`,
    fields: { status: "running", brief: "Stop the song." },
    visibility: "party",
  });
  assert.deepEqual(
    [scene, descent].map((s) => [s.parentId, s.position, s.status, s.visibility]),
    [
      [ID.adventure, 0, "active", undefined],
      [ID.adventure, 1, "planned", undefined],
    ],
  );
  assert.deepEqual(scene.fields, { type: "combat", goal: "Outlast Deacon Rell" });
  assert.deepEqual(descent.fields, { type: "investigation", goal: "Find the key", outcome: "Found it" });
  assert.equal(scene.body, `Bells ring. @[Rusted Key](${ID.key}) glints.`);
  assert.deepEqual(scene.links, [ID.hive, ID.rell, ID.notice, ID.key]);
  assert.equal(
    scene.gmNotes,
    [
      "Keep it short.",
      "Hazard here: Live wire. It bites.. attribute Test, Agility, DN 3, ONE. Step over it (spotted)",
      "Test: opposed Test, Deception, ONE. Out-sing the deacon",
      "Exit: Run for it",
    ].join("\n\n"),
  );
});

test("a scene's prepared lines: roster, Tests, pools, exits and reveals", () => {
  const prep = scene.prep!;
  assert.deepEqual(prep.roster, [
    {
      id: "roster-0",
      label: "Choir Guards",
      note: "Marker: red; Scaling Threats",
      pack: threatPack.id,
      key: BOOK_THREAT,
      count: 3,
      visibility: "full",
    },
    {
      id: "roster-1",
      pack: buildCustomThreatPack(exported).pack.id,
      key: "custom-scrap-thrall",
      count: 1,
      mob: 6,
      visibility: "bar",
    },
  ]);
  const [skill, resolve, corruption] = prep.tests;
  assert.deepEqual(skill, {
    id: "test-0",
    label: "Spot the bells",
    note: "Shift 5: Five",
    testId: "skill",
    inputs: { skill: "awareness", dn: 3, bonus: 0, ignoreWounded: false },
    takers: "party",
    outcomes: [
      { label: "On success", text: "They see it." },
      { label: "On failure", text: "Ambushed." },
      { label: "Shift 1", text: "One" },
      { label: "Shift 2", text: "Two" },
      { label: "Shift 3", text: "Three" },
      { label: "Shift 4", text: "Four" },
    ],
  });
  assert.deepEqual(resolve, {
    id: "test-2",
    note: LONG_PURPOSE,
    testId: "trait",
    inputs: { trait: "resolve", dn: 2, bonus: 0, ignoreWounded: false },
    takers: "pick",
    outcomes: [],
  });
  assert.deepEqual(
    [corruption!.testId, corruption!.inputs, corruption!.takers],
    ["corruption", { dn: 3, bonus: 0, ignoreWounded: false }, "party"],
  );
  assert.deepEqual(
    descent.prep!.tests.map((t) => [t.testId, t.inputs, t.takers]),
    [["attribute", { attribute: "int", dn: 4, bonus: 0, ignoreWounded: false }, "pick"]],
  );
  assert.deepEqual(prep.pools, [
    { id: "pool-0", pool: "glory", amount: 2, text: "A bold stand" },
    { id: "pool-1", pool: "ruin", amount: 1, text: "A 6 on the Wrath Die" },
    { id: "pool-2", label: "Reinforcements", pool: "ruin", amount: -2, text: "Two more." },
  ]);
  assert.deepEqual(prep.exits, [{ id: "exit-0", label: "Down to the vault", sceneId: ID.descent }]);
  assert.deepEqual(descent.prep!.exits, [{ id: "exit-0", label: "The Bells", note: LONG_EXIT, sceneId: ID.bells }]);
  assert.deepEqual(prep.reveals, [
    { id: "reveal-0", entryId: ID.rell },
    { id: "reveal-1", entryId: ID.notice },
  ]);
});

// A called Test is refused without every input its Test declares, a switch included. The DN is the one a scene may
// leave open: the table asks for it when the line is sent.
test("every prepared Test line carries what its Test asks for, but a DN the scene left open", () => {
  const tests = buildRuleset().tests as Record<string, { inputs: Record<string, string> }>;
  const lines = document.codex.flatMap((e) => e.prep?.tests ?? []) as {
    id: string;
    testId: string;
    inputs: Record<string, unknown>;
  }[];
  assert.ok(lines.length >= 4);
  for (const line of lines) {
    const asked = Object.entries(tests[line.testId]!.inputs).filter(([id]) => id !== "dn");
    for (const [id] of asked) assert.ok(id in line.inputs, `${line.id} (${line.testId}) lacks "${id}"`);
  }
});

test("the report counts exactly what the file has that the document holds no structure for", () => {
  const stats = CharacterStats.parse(disruptor.stats);
  const handMade =
    stats.weapons.length +
    stats.talents.length +
    stats.abilities.length +
    (stats.powers?.length ?? 0) +
    stats.gear.length +
    (stats.weaponEffects?.length ?? 0) +
    stats.armour.traits.length +
    (stats.armour.name ? 1 : 0) +
    (stats.armour.invulnerable ? 1 : 0);
  const got = new Map<string, number>();
  for (const n of report) got.set(`${n.to}: ${n.reason}`, (got.get(`${n.to}: ${n.reason}`) ?? 0) + 1);
  const kinds = [...got.keys()].filter((k) => k.startsWith("left out: a hand-made sheet's"));
  assert.equal(
    kinds.reduce((n, k) => n + got.get(k)!, 0),
    handMade,
  );
  for (const k of kinds) got.delete(k);
  assert.deepEqual(Object.fromEntries([...got].sort()), {
    "as text: a mention outside a body or GM notes, written as its title": 1,
    "as written: a mention of an entry not in the file": 1,
    "gm notes: a Quick NPC stat block": 1,
    "gm notes: a Test's outcome past the platform's six": 1,
    "gm notes: a catalogue entry": 1,
    "gm notes: a place's hazard": 2,
    "gm notes: a relic's Power": 1,
    "gm notes: a roster line's marker": 1,
    "gm notes: a roster line's scale": 1,
    "gm notes: a scene's pick of its place's hazards": 1,
    "gm notes: an NPC's secrets": 1,
    "gm notes: an exit to no scene": 1,
    "gm notes: an exit's words over 80 characters, as its note": 1,
    "gm notes: an objective rolled for the session": 1,
    "gm notes: an objective's story link": 1,
    "gm notes: an opposed Test: the ruleset has none": 1,
    "left out: a Condition the ruleset does not have": 1,
    "left out: a Condition's stack count": 1,
    "left out: a GM override of a Trait: no field": 1,
    "left out: a hazard its place no longer lists": 1,
    "left out: a link to an entry not in the file": 2,
    "left out: a picture the file could not read": 1,
    "left out: a portrait bundled with this app": 1,
    "left out: a requisition this session": 1,
    "left out: an ammo type the ruleset has no resource for": 1,
    "left out: an on-entry pick the scene no longer links": 1,
    "left out: the XP a session awarded: the sheets hold it": 1,
    "left out: the campaign's setup: no place in a room": 2,
    "left out: the time a session ended": 1,
    "left out: the time a session started": 1,
    "left out: the time it was revealed": 1,
    "left out: the time the build was made": 1,
  });
});

// Every leaf of the file that says something (a non-empty text, a number other than 0, a true) is in the document or
// the custom Threat pack, or its path (or one above it) is in the report.
test("nothing of the file is lost without being in the document or the report", () => {
  const leaves: { path: string; value: string | number | true }[] = [];
  const walk = (x: unknown, path: string) => {
    if (typeof x === "string" ? x !== "" : typeof x === "number" ? x !== 0 : x === true)
      leaves.push({ path, value: x as string | number | true });
    else if (x && typeof x === "object") for (const [k, v] of Object.entries(x)) walk(v, path ? `${path}.${k}` : k);
  };
  walk(exported, "");
  const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const haystack = squash(JSON.stringify([document, buildCustomThreatPack(exported).pack]));
  // The words this app stores that the document says in the platform's.
  const SAID: Record<string, string> = {
    bars: "bar",
    stats: "full",
    each: "party",
    one: "pick",
    decree: "proclamation",
    vox: "transcript",
  };
  const built = new Set(exported.characters.flatMap((ch, i) => (ch.build ? [`characters.${i}.stats.`] : [])));
  const reported = (path: string) => report.some((n) => path === n.path || path.startsWith(`${n.path}.`));
  const TRUE: [RegExp, (path: string) => boolean][] = [
    [/\.(revealed|shown)$/, (p) => document.codex.some((e) => e.visibility === "party" && p.includes("codex."))],
    [/\.imageRevealed$/, () => document.codex.some((e) => e.imageRevealed)],
    [/\.asMob$/, () => scene.prep!.roster.some((l) => l.mob)],
    [/\.done$/, () => document.codex.some((e) => e.kind === "quest" && e.status === "done")],
    [/\.annihilated$/, () => document.actors.some((a) => a.fields?.annihilated === true)],
    [/^campaign\.homebrew$/, () => true], // the platform's builder always allows homebrew
    [/\.spotted$/, () => scene.gmNotes!.includes("(spotted)")],
  ];
  // What the document's shape says: the file's own format, which kind of stat source, Neutral as no attitude, and a
  // session's id (a room's sessions are in order and have none).
  const SHAPE = [/^(format|version)$/, /\.statSource\.kind$/, /^codex\.sessions\.\d+\.id$/];
  const carried = (path: string, value: string | number | true) => {
    if (SHAPE.some((re) => re.test(path)) || (path.endsWith(".attitude") && value === "neutral")) return true;
    // A built character's sheet is the build's: the build carries it, all but what changes in play.
    const live = /\.stats\.(ammo|wealth|corruption|mutations|requisitioned|armour\.fitted)/.test(path);
    if ([...built].some((b) => path.startsWith(b)) && !live) return true;
    if (value === true) return TRUE.some(([re, f]) => re.test(path) && f(path));
    if (typeof value === "number") return haystack.includes(String(value));
    if (/\.build\.gm\.approved\.\d+$/.test(path)) value = remapApproval(value, reworded, "auspex", "port");
    // A mention is said in the platform's form, so each part of the text around it is looked for.
    return value
      .split(/@\[[a-z]+:[0-9a-f-]{36}\]/)
      .map((part) => squash(SAID[part] ?? part))
      .every((part) => haystack.includes(part));
  };
  const lost = leaves.filter((l) => !reported(l.path) && !carried(l.path, l.value));
  assert.deepEqual(lost, []);
  assert.ok(leaves.length > 300, `${leaves.length} leaves`);
});

test("a text over the platform's cap refuses the document, with the export path", () => {
  const long = structuredClone(exported);
  long.codex.npcs[0]!.role = "x".repeat(10);
  long.codex.handouts[0]!.title = "t".repeat(CAPS.title + 1);
  assert.throws(
    () => buildRoomDocument(long, { reworded }),
    (e) => e instanceof Refusal && e.path === "codex.handouts.0.title",
  );
  const spend = structuredClone(exported);
  spend.codex.adventures[0]!.beats[1]!.spends[0]!.name = "n".repeat(CAPS.lineLabel + 1);
  assert.throws(
    () => buildRoomDocument(spend, { reworded }),
    (e) => e instanceof Refusal && e.path === "codex.adventures.0.beats.1.spends.0.name",
  );
});
