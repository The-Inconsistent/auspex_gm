import assert from "node:assert/strict";
import { test } from "node:test";

import { setupSteps } from "./setup.ts";

const empty = {
  campaign: { tier: 1, framework: "", patron: "", kind: [] },
  codex: { locations: [], factions: [], npcs: [], sessions: [], adventures: [] },
  characters: [],
};
const ticked = (steps: ReturnType<typeof setupSteps>) => steps.filter((s) => s.done).map((s) => s.key);

test("an empty campaign ticks only the Tier", () => {
  const steps = setupSteps(empty);
  assert.equal(steps.length, 11);
  assert.deepEqual(ticked(steps), ["tier"]);
  assert.equal(steps[0]?.now, "NOT AGREED YET");
  assert.equal(steps[2]?.now, "TIER 1 · 100 XP TO START");
});

test("a Framework ticks its step and nothing else", () => {
  const steps = setupSteps({ ...empty, campaign: { ...empty.campaign, framework: "Varonius Vanguard" } });
  assert.deepEqual(ticked(steps), ["framework", "tier"]);
});

// Shaped like a seeded content pack, inline: the web image's `turbo prune @wg/web` leaves packages/data out, so a test here
// can't read packages/data/packs (the Next build type-checks tests too).
const pack = {
  campaign: {
    tier: 4,
    framework: "A Kill Team of the Ordo Xenos.",
    patron: "An Inquisitor of the Ordo Xenos",
    kind: [], // the pack sets no kind of game (rules-flow §11.79)
  },
  codex: {
    locations: [{}],
    factions: [{}],
    npcs: [{}],
    sessions: [{ number: 1 }],
    adventures: [{ beats: [{ encounter: [{}] }, { encounter: [] }] }],
  },
  characters: [{}],
};

test("the kind of game ticks its step; the limits may stay empty", () => {
  const steps = setupSteps({ ...empty, campaign: { ...empty.campaign, kind: ["investigative", "political"] } });
  assert.deepEqual(ticked(steps), ["kind", "tier"]);
  assert.equal(steps[0]?.now, "INVESTIGATIVE · POLITICAL");
});

test("a pack with one session started ticks every step but the kind of game", () => {
  const steps = setupSteps(pack);
  assert.deepEqual(
    steps.filter((s) => s.done === false).map((s) => s.key),
    ["kind"],
  );
  assert.equal(steps.find((s) => s.key === "tier")?.now, "TIER 4 · 400 XP TO START");
});
