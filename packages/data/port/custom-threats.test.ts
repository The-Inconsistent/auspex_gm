import assert from "node:assert/strict";
import { test } from "node:test";
import { CampaignExport } from "@wg/shared";
import { threats } from "../index.ts";
import { loadEngine } from "./engine.ts";
import { buildCustomThreatPack, buildPack } from "./pack.ts";
import { buildRuleset } from "./ruleset.ts";

// The pack of a campaign's own Threats, from an export invented here: no name, number or text is from a real table.
const engine = await loadEngine();
const skip = engine === null ? "InconsisTable is not checked out beside this repo" : false;

const block = {
  source: "custom",
  page: 1,
  faction: "heretic",
  keywords: ["HERETIC", "SCRAPWORKS"],
  attributes: { S: 3, T: 3, A: 3, I: 3, Wil: 2, Int: 1, Fel: 1 },
  resilience: { value: 4 },
  defence: 2,
  wounds: 1,
  shock: 2,
  skills: { default: 3, list: [{ name: "Awareness", dice: 4, passive: 2 }] },
  conviction: 2,
  resolve: 1,
  speed: 6,
  size: "Avg",
};
const exportOf = (customThreats: object[]) =>
  CampaignExport.parse({
    format: "auspex-campaign",
    version: 1,
    exportedAt: "2026-01-01T00:00:00.000Z",
    campaign: {
      name: "The Rusted Choir!",
      tier: 2,
      glory: 0,
      ruin: 0,
      framework: "",
      patron: "",
      homebrew: false,
      nextSessionAt: null,
    },
    characters: [],
    codex: { factions: [], adventures: [], locations: [], npcs: [], handouts: [], sessions: [], customThreats },
    images: [],
  });
const exported = exportOf([
  {
    ...block,
    id: "custom-scrap-thrall",
    name: "Scrap Thrall",
    threat: ["T", "T", "T", "T"],
    options: [{ kind: "mob", name: "Thrall Gang", text: "Invented.", weapons: [], abilities: [] }],
  },
  {
    ...block,
    id: "custom-choir-warden",
    name: "Choir Warden",
    threat: ["E", "E", "T", "T"],
    determination: "Spend 1 Ruin to roll 2d6.",
    abilities: [
      {
        type: "ACTION",
        name: "Rust Hook",
        text: "Invented.",
        weapons: [{ name: "Rust Hook", damage: 6, ed: 1, ap: -1, range: [1], traits: ["Brutal"] }],
      },
    ],
  },
  { ...block, id: "custom-hollow-cantor", name: "Hollow Cantor", threat: ["A", "A", "E", "E"], shock: null },
]);
const { pack, leftOut } = buildCustomThreatPack(exported);
const keys = pack.entries.map((e) => e.key);

test("the pack of a campaign's own Threats passes InconsisTable's validatePack", { skip }, () => {
  const compiled = engine!.compileRuleset(buildRuleset());
  if (!compiled.ok) assert.fail(compiled.problems.map((p) => `${p.path}: ${p.message}`).join("\n"));
  for (const input of [pack, buildCustomThreatPack(exportOf([])).pack]) {
    const result = engine!.validatePack({ input, ruleset: compiled.compiled.ruleset });
    if (!result.ok) assert.fail(result.problems.map((p) => `${p.path}: ${p.message}`).join("\n"));
    assert.deepEqual(result.warnings, []);
  }
});

test("it is the GM's own: original, uncited, named after the campaign, for the Threat pack's rulesets", () => {
  assert.equal(pack.id, "the-rusted-choir-custom-threats");
  assert.equal(pack.version, "0.1.0");
  assert.equal(pack.license, "original");
  assert.deepEqual(pack.ruleset, buildPack().pack.ruleset);
  for (const e of pack.entries) assert.equal(e.cite, undefined, e.key);
  assert.equal(
    buildCustomThreatPack({ ...exported, campaign: { ...exported.campaign, name: "x".repeat(100) } }).pack.id.length,
    64,
  );
});

test("every custom id is an entry key, its weapon keyed under it, and nothing else comes in", () => {
  assert.deepEqual(keys, [
    "custom-scrap-thrall",
    "custom-choir-warden",
    "custom-choir-warden.rust-hook",
    "custom-hollow-cantor",
  ]);
  for (const k of keys) assert.ok(!threats.has(k.split(".")[0]!), `${k} is not a book Threat`);
  const warden = pack.entries.find((e) => e.key === "custom-choir-warden")!;
  assert.deepEqual(warden.body.weapons, ["custom-choir-warden.rust-hook"]);
  assert.equal(warden.body["determination.pool"], 2);
  assert.deepEqual(warden.body.abilities, ["ACTION: Rust Hook"]);
  const thrall = pack.entries.find((e) => e.key === "custom-scrap-thrall")!;
  assert.deepEqual(
    [1, 2, 3, 4, 5].map((n) => thrall.body[`class.t${n}`]),
    ["troop", "troop", "troop", "troop", "troop"],
  );
  assert.ok(!("stat.shock" in pack.entries.find((e) => e.key === "custom-hollow-cantor")!.body));
  assert.deepEqual(
    leftOut.map((l) => `${l.id}: ${l.reason}`),
    ["custom-scrap-thrall: Mob option", "custom-hollow-cantor: null value: stat.shock"],
  );
});
