import assert from "node:assert/strict";
import { test } from "node:test";

import {
  applyProfile,
  CharacterDetail,
  CharacterStats,
  CodexInput,
  deriveStats,
  mentionToken,
  Threat,
  type Character,
  type ThreatClass,
} from "@wg/shared";

import { layoutCards, printCards, printHandouts, type Card, type PrintSource } from "./print-cards.ts";

// Placeholder stat blocks, not printed profiles: the numbers are filler so the checks read plainly.
const threatOf = (id: string, cls: ThreatClass): Threat =>
  Threat.parse({
    id,
    name: id.toUpperCase(),
    page: 1,
    faction: "ork",
    threat: [cls, cls, cls, cls],
    keywords: ["Ork"],
    attributes: { S: 3, T: 4, A: 3, I: 3, Wil: 2, Int: 2, Fel: 1 },
    resilience: { value: 5 },
    defence: 2,
    wounds: 6,
    shock: null,
    skills: { default: 2, list: [{ name: "Weapon Skill", dice: 5 }] },
    conviction: 3,
    resolve: 2,
    speed: 6,
    size: "Avg",
  });

const agent: Character = {
  id: "ch1",
  name: "Iskra Vell",
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
};

const item = {
  id: "i1",
  name: "Strange Idol",
  wargearId: null,
  description: "Warm to the touch.",
  gmNotes: "",
  locationId: null,
  npcId: null,
  mods: [],
  givenTo: null,
};

const src: PrintSource = {
  state: {
    campaign: {
      id: "c",
      name: "C",
      tier: 5,
      glory: 0,
      ruin: 0,
      framework: "",
      frameworkBonus: "",
      patron: "",
      kind: [],
      limits: [],
      homebrew: false,
      archived: false,
      nextSessionAt: null,
      nextSessionPlace: "",
    },
    access: { members: [], invites: [], guests: [] },
    characters: [agent],
  },
  codex: { items: [item], npcs: [], locations: [], handouts: [] },
  threats: [threatOf("boy", "T"), threatOf("nob", "E"), threatOf("boss", "A"), threatOf("squig", "M")],
  wargear: [],
};

const entry = (threatId: string, over: Record<string, unknown> = {}) => ({
  threatId,
  count: 1,
  asMob: false,
  profiles: [],
  scale: false,
  ...over,
});
const names = (cards: Card[]) =>
  cards.map((c) => (c.kind === "tent" ? c.name : c.kind === "threat" ? c.title : c.item.name));

test("an Agent's tent carries the stats deriveStats gives the sheet", () => {
  const [tent] = printCards({ agents: ["ch1"] }, src);
  const d = deriveStats({ stats: agent.stats, overrides: agent.overrides, tier: 5 });
  assert.ok(tent?.kind === "tent");
  assert.deepEqual(tent.stats, {
    defence: d.defence,
    resilience: d.resilience,
    wounds: d.maxWounds,
    shock: d.maxShock,
    conviction: d.conviction,
    speed: d.speed,
  });
});

test("a prepared row prints as beat.startEncounter fields it: a Mob is one tent, a count is one tent each", () => {
  const cards = printCards(
    {
      encounter: [
        entry("boy", { count: 6, asMob: true }),
        entry("boy", { count: 2, label: "Grot" }),
        entry("boy", { count: 4, asMob: true, label: "Ladz" }),
      ],
    },
    src,
  );
  // The tracker names a labelled Mob by its label alone (encounter.actions.ts `addThreat`).
  assert.deepEqual(names(cards), ["BOY ×6", "Grot 1", "Grot 2", "Ladz", "BOY ×6 (mob)", "Grot ×2", "Ladz ×4 (mob)"]);
});

test("a row's Profiles are applied and named in the card's note (VoA p.126)", () => {
  const cards = printCards({ encounter: [entry("nob", { profiles: ["heretical-strength"] })] }, src);
  const block = cards.find((c) => c.kind === "threat");
  assert.ok(block?.kind === "threat");
  assert.equal(block.t.resilience.value, applyProfile(threatOf("nob", "E"), "heretical-strength").resilience.value);
  assert.equal(block.note, "Heretical Strength");
  const tent = cards.find((c) => c.kind === "tent");
  assert.ok(tent?.kind === "tent");
  assert.equal(tent.stats.resilience, block.t.resilience.value); // the tent shows the prepared number too
});

test("card span follows the threat class, and unknown ids are skipped", () => {
  const cards = printCards({ threats: ["boy", "nob", "boss", "squig", "gone"], items: ["i1", "gone"] }, src);
  assert.deepEqual(
    cards.map((c) => (c.kind === "threat" ? `${c.span.cols}x${c.span.rows}` : c.kind)),
    ["1x1", "2x1", "2x2", "2x2", "item"],
  );
  const last = cards.at(-1);
  assert.ok(last?.kind === "item" && last.entry === undefined); // a custom item has no catalogue entry
});

test("an item card spells mentions out as every phone would see them (issue #200)", () => {
  const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const npc = { ...CodexInput.npc.parse({ name: "Magos Verrin", revealed: true }), id: id(1) };
  // Not revealed, so no phone knows it.
  const vault = { ...CodexInput.location.parse({ name: "The Vault" }), id: id(2) };
  const handout = (n: number, audience: string[]) => ({
    ...CodexInput.handout.parse({ title: `Note ${n}`, revealed: true, audience }),
    id: id(n),
    revealedAt: null,
  });
  // Revealed to every player, and revealed to one Agent only: the card goes on the table, so only the first is named.
  const open = handout(3, []);
  const secret = handout(4, [id(9)]);
  const description = [
    mentionToken({ kind: "npc", id: npc.id }),
    mentionToken({ kind: "location", id: vault.id }),
    mentionToken({ kind: "handout", id: open.id }),
    mentionToken({ kind: "handout", id: secret.id }),
  ].join(", ");
  const codex = { items: [{ ...item, description }], npcs: [npc], locations: [vault], handouts: [open, secret] };
  const [card] = printCards({ items: ["i1"] }, { ...src, codex });
  assert.ok(card?.kind === "item");
  assert.equal(card.item.description, "Magos Verrin, (unknown), Note 3, (unknown)");
});

test("printHandouts keeps the job's order, skips a lost id, and spells mentions out for the table (issue #204)", () => {
  const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const npc = { ...CodexInput.npc.parse({ name: "Magos Verrin", revealed: true }), id: id(1) };
  const handout = (n: number, data: Record<string, unknown>) => ({
    ...CodexInput.handout.parse({ title: `Note ${n}`, ...data }),
    id: id(n),
    revealedAt: null,
  });
  const vox = handout(2, {
    style: "vox",
    header: "CH 7",
    body: `[03:12] ${mentionToken({ kind: "npc", id: npc.id })}`,
  });
  const plain = handout(3, { body: "Kill the Orks." });
  const codex = { items: [], npcs: [npc], locations: [], handouts: [vox, plain] };
  assert.deepEqual(printHandouts({ handouts: [plain.id, id(99), vox.id] }, codex), [
    { id: plain.id, title: "Note 3", body: "Kill the Orks.", style: "plain", header: "" },
    { id: vox.id, title: "Note 2", body: "[03:12] Magos Verrin", style: "vox", header: "CH 7" },
  ]);
});

test("layoutCards packs first fit on 3 × 3 pages without overlap", () => {
  const cards = printCards({ threats: ["boss", "boy", "boy", "boy", "boy", "boy", "boy", "nob"] }, src);
  const pages = layoutCards(cards);
  // The 2×2 takes the top left, five singles fill the other five cells, and the sixth single and the 2×1 go over.
  assert.equal(pages.length, 2);
  assert.deepEqual(
    pages[0]!.map((p) => [p.col, p.row]),
    [
      [0, 0],
      [2, 0],
      [2, 1],
      [0, 2],
      [1, 2],
      [2, 2],
    ],
  );
  for (const page of pages) {
    const cells = page.flatMap((p) =>
      Array.from(
        { length: p.span.cols * p.span.rows },
        (_, i) => `${p.col + (i % p.span.cols)},${p.row + Math.floor(i / p.span.cols)}`,
      ),
    );
    assert.equal(new Set(cells).size, cells.length);
  }
  assert.deepEqual(
    pages[1]!.map((p) => [p.col, p.row, p.span.cols]),
    [
      [0, 0, 1],
      [1, 0, 2],
    ],
  );
});
