import { test } from "node:test";
import assert from "node:assert/strict";
import { BeatExit, CampaignExport, freshStart } from "./index.ts";

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const file = CampaignExport.parse({
  format: "auspex-campaign",
  version: 1,
  exportedAt: "2026-10-01T00:00:00.000Z",
  campaign: {
    name: "Volkus",
    tier: 4,
    glory: 3,
    ruin: 5,
    framework: "",
    frameworkBonus: "",
    patron: "",
    homebrew: false,
  },
  characters: [
    {
      id: ID(1),
      name: "Brother Kael",
      stats: {},
      overrides: {},
      build: null,
      builtAt: null,
      wounds: 4,
      shock: 2,
      wrath: 0,
      traumatic: 1,
      annihilated: false,
      xp: 30,
      conditions: ["Bleeding"],
      detail: {},
      objectives: [{ text: "Recover the relic", done: true }],
    },
  ],
  codex: {
    factions: [],
    adventures: [
      {
        id: ID(2),
        title: "The Dig",
        status: "running",
        beats: [
          {
            id: ID(3),
            adventureId: ID(2),
            title: "Arrival",
            status: "done",
            outcome: "Went well",
            order: 0,
            locationId: ID(4),
            hazards: [{ id: ID(8), spotted: true }],
            itemIds: [ID(9)],
          },
        ],
      },
    ],
    locations: [
      {
        id: ID(4),
        name: "Site 7",
        revealed: true,
        hazardList: [{ id: ID(8), kind: "book", hazardId: "core-falling" }],
      },
    ],
    npcs: [{ id: ID(5), name: "Magos Tull", revealed: true }],
    handouts: [
      { id: ID(6), title: "Orders", revealed: true, revealedAt: "2026-09-01T00:00:00.000Z", audience: [ID(1)] },
    ],
    items: [
      { id: ID(9), name: "Bolt Pistol", wargearId: "bolt-pistol", locationId: ID(4), givenTo: null },
      { id: ID(10), name: "Magnocular Scope", givenTo: ID(1) },
    ],
    sessions: [{ id: ID(7), number: 1, startedAt: "2026-09-01T00:00:00.000Z", endedAt: null, recap: "", xp: 0 }],
  },
});

test("an export round-trips through its schema", () => {
  assert.deepEqual(CampaignExport.parse(JSON.parse(JSON.stringify(file))), file);
});

test("a file from before scene goals, exits and Tests still loads (issues #38, #39)", () => {
  const [b] = file.codex.adventures[0]!.beats;
  assert.deepEqual([b!.goal, b!.exits, b!.tests], ["", [], []]);
});

test("a file from before place hazards still loads (issue #49)", () => {
  const old = structuredClone(file) as unknown as {
    codex: { adventures: { beats: { hazards?: unknown }[] }[]; locations: { hazardList?: unknown }[] };
  };
  delete old.codex.adventures[0]!.beats[0]!.hazards;
  delete old.codex.locations[0]!.hazardList;
  const parsed = CampaignExport.parse(old).codex;
  assert.deepEqual([parsed.adventures[0]!.beats[0]!.hazards, parsed.locations[0]!.hazardList], [[], []]);
});

test("a file from before items still loads (issue #51)", () => {
  const old = structuredClone(file) as unknown as {
    codex: { adventures: { beats: { itemIds?: unknown }[] }[]; items?: unknown };
  };
  delete old.codex.adventures[0]!.beats[0]!.itemIds;
  delete old.codex.items;
  const parsed = CampaignExport.parse(old).codex;
  assert.deepEqual([parsed.adventures[0]!.beats[0]!.itemIds, parsed.items], [[], []]);
});

test("an exit is a bounded label, with no target unless the GM picks one", () => {
  assert.deepEqual(BeatExit.parse({ label: "If they run" }), { label: "If they run", beatId: null });
  assert.equal(BeatExit.safeParse({ label: "x".repeat(201) }).success, false);
});

test("a file that isn't an export is refused", () => {
  assert.equal(CampaignExport.safeParse({ ...file, format: "pack" }).success, false);
  assert.equal(CampaignExport.safeParse({ ...file, characters: [{ ...file.characters[0], id: "x" }] }).success, false);
});

test("freshStart resets play, keeps the sheet and the XP", () => {
  const f = freshStart(file);
  const [c] = f.characters;
  assert.deepEqual([f.campaign.glory, f.campaign.ruin], [0, 0]);
  assert.deepEqual([c!.wounds, c!.shock, c!.wrath, c!.traumatic, c!.conditions], [0, 0, 2, 0, []]);
  assert.equal(c!.xp, 30);
  assert.equal(c!.objectives[0]!.done, false);
  assert.equal(f.codex.adventures[0]!.status, "planned");
  assert.deepEqual(
    [f.codex.adventures[0]!.beats[0]!.status, f.codex.adventures[0]!.beats[0]!.outcome],
    ["planned", ""],
  );
  assert.equal(f.codex.locations[0]!.revealed, false);
  assert.deepEqual(
    f.codex.adventures[0]!.beats[0]!.hazards,
    [{ id: ID(8), spotted: false }],
    "spotted resets (§11.92)",
  );
  assert.equal(f.codex.locations[0]!.hazardList.length, 1, "the place keeps its list");
  assert.equal(f.codex.npcs[0]!.revealed, false);
  assert.deepEqual([f.codex.handouts[0]!.revealed, f.codex.handouts[0]!.revealedAt], [false, null]);
  assert.deepEqual(f.codex.handouts[0]!.audience, [ID(1)]);
  assert.equal(f.codex.sessions.length, 0);
  assert.deepEqual(
    f.codex.items.map((i) => i.givenTo),
    [null, ID(1)],
    "a given item stays given: the sheet keeps its line",
  );
});
