import assert from "node:assert/strict";
import { test } from "node:test";

import { Pack } from "@wg/shared";

import volkus from "../../../../packages/data/packs/volkus/pack.json";
import { setupSteps } from "./setup.ts";

const empty = {
  campaign: { tier: 1, framework: "", patron: "" },
  codex: { locations: [], factions: [], npcs: [], sessions: [], adventures: [] },
  characters: [],
};
const ticked = (steps: ReturnType<typeof setupSteps>) => steps.filter((s) => s.done).map((s) => s.key);

test("an empty campaign ticks only the Tier, and the content-limits prompt never ticks", () => {
  const steps = setupSteps(empty);
  assert.equal(steps.length, 11);
  assert.deepEqual(ticked(steps), ["tier"]);
  assert.equal(steps[0]?.done, null);
  assert.equal(steps[2]?.now, "TIER 1 · 100 XP TO START");
});

test("a Framework ticks its step and nothing else", () => {
  const steps = setupSteps({ ...empty, campaign: { ...empty.campaign, framework: "Varonius Vanguard" } });
  assert.deepEqual(ticked(steps), ["framework", "tier"]);
});

test("the volkus pack with one session started ticks every tickable step", () => {
  const pack = Pack.parse(volkus);
  const steps = setupSteps({
    campaign: pack.campaign,
    codex: { ...pack, sessions: [{ number: 1 }] },
    characters: [{}],
  });
  assert.deepEqual(
    steps.filter((s) => s.done === false).map((s) => s.key),
    [],
  );
  assert.equal(steps.find((s) => s.key === "tier")?.now, "TIER 4 · 400 XP TO START");
});
