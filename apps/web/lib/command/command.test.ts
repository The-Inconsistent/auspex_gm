import assert from "node:assert/strict";
import { test } from "node:test";

import { CharacterDetail, CharacterStats, type LiveState, type ThreatCombatant } from "@wg/shared";

import { parseCommand } from "./command.ts";

const threat = ({ id, label }: { id: string; label: string }): ThreatCombatant => ({
  id,
  kind: "threat",
  acted: false,
  manifested: false,
  ambushed: false,
  held: false,
  threatId: "x",
  threatClass: "T",
  label,
  marker: null,
  mobCount: null,
  mobStart: null,
  wounds: 0,
  shock: 0,
  personalRuin: 0,
  maxWounds: 5,
  maxShock: 4,
  conditions: ["Prone"],
  visibility: "bars",
  stats: null,
});
const s: LiveState = {
  campaign: {
    id: "c",
    name: "C",
    tier: 4,
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
  spendRequests: [],
  testCall: null,
  whispers: [],
  access: { members: [], invites: [], guests: [] },
  characters: [
    {
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
    },
  ],
  encounter: {
    id: "e",
    round: 1,
    currentId: null,
    lastSide: null,
    seizedSide: null,
    back: null,
    combatants: [
      { id: "pc1", kind: "pc", characterId: "ch1", acted: false, ambushed: false, held: false, manifested: false },
      threat({ id: "t1", label: "Preacher Hollan" }),
      threat({ id: "t2", label: "Kommando ×6" }),
      threat({ id: "t3", label: "Kommando Nob" }),
      threat({ id: "t4", label: "Kommando" }),
    ],
  },
};
const ok = (input: string, { selected = null }: { selected?: string | null } = {}) => {
  const r = parseCommand({ input, state: s, selected });
  if ("error" in r) throw new Error(r.error);
  return r.actions;
};

test("damage, heal and shock resolve names to the right ids", () => {
  assert.deepEqual(ok("hollan dmg 3"), [{ type: "combatant.adjust", id: "t1", wounds: 3 }]);
  assert.deepEqual(
    ok("iskra shock 2"),
    [{ type: "character.adjust", id: "ch1", shock: 2 }],
    "PCs route to their character",
  );
  assert.deepEqual(
    ok("+2", { selected: "t1" }),
    [{ type: "combatant.adjust", id: "t1", wounds: 2 }],
    "selected row, +n = Wounds",
  );
  assert.deepEqual(ok("-1 hollan"), [{ type: "combatant.adjust", id: "t1", wounds: -1 }]);
  assert.deepEqual(ok("hollan heal 2"), [{ type: "combatant.adjust", id: "t1", wounds: -2 }]);
  assert.deepEqual(
    ok("hollan dmg +3"),
    [{ type: "combatant.adjust", id: "t1", wounds: 3 }],
    "signed amount after a verb",
  );
  assert.deepEqual(
    ok("hollan heal -2"),
    [{ type: "combatant.adjust", id: "t1", wounds: -2 }],
    "the verb sets the direction",
  );
  assert.deepEqual(ok("iskra wrath -1"), [{ type: "character.adjust", id: "ch1", wrath: -1 }], "Wrath can be lowered");
});

test("globals, turns, conditions", () => {
  assert.deepEqual(ok("end"), [{ type: "turn.end" }]);
  assert.deepEqual(ok("ruin +1"), [{ type: "pool.adjust", pool: "ruin", delta: 1 }]);
  assert.deepEqual(ok("hold"), [{ type: "turn.hold" }]);
  assert.deepEqual(ok("back"), [{ type: "turn.back" }]);
  assert.deepEqual(ok("begin"), [{ type: "encounter.begin" }]);
  assert.deepEqual(ok("next"), [{ type: "encounter.newRound" }]);
  assert.deepEqual(ok("go hollan"), [{ type: "turn.start", id: "t1", force: true }], "JUST GO");
  assert.deepEqual(ok("start hollan"), [{ type: "turn.start", id: "t1" }]);
  assert.deepEqual(ok("seize hollan"), [{ type: "turn.seize", id: "t1" }]);
  assert.deepEqual(ok("+pinned iskra"), [{ type: "character.update", id: "ch1", conditions: ["Pinned"] }]);
  assert.deepEqual(ok("hollan -prone"), [{ type: "combatant.update", id: "t1", conditions: [] }]);
  assert.deepEqual(ok("+onfire hollan"), [{ type: "combatant.update", id: "t1", conditions: ["Prone", "On Fire"] }]);
});

test("errors are specific", () => {
  assert.match(
    (parseCommand({ input: "komm dmg 1", state: s, selected: null }) as { error: string }).error,
    /Ambiguous: Kommando ×6, Kommando Nob, Kommando/,
  );
  assert.deepEqual(
    ok("kommando dmg 1"),
    [{ type: "combatant.adjust", id: "t4", wounds: 1 }],
    "an exact name wins over prefixes",
  );
  assert.match((parseCommand({ input: "dmg 2", state: s, selected: null }) as { error: string }).error, /No target/);
  assert.match(
    (parseCommand({ input: "zog dmg 2", state: s, selected: null }) as { error: string }).error,
    /No combatant matches "zog"/,
  );
  assert.match(
    (parseCommand({ input: "hollan wrath 1", state: s, selected: null }) as { error: string }).error,
    /Threats don't have Wrath/,
  );
});

test("hide, show and reveal set what the phones see", () => {
  assert.deepEqual(ok("hollan hide"), [{ type: "combatant.update", id: "t1", visibility: "hidden" }]);
  assert.deepEqual(ok("hollan show"), [{ type: "combatant.update", id: "t1", visibility: "bars" }]);
  assert.deepEqual(ok("hollan reveal"), [{ type: "combatant.update", id: "t1", visibility: "stats" }]);
});
