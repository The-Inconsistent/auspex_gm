import assert from "node:assert/strict";
import { test } from "node:test";
import {
  encounterBudget,
  prepareThreat,
  tallyByClass,
  threatClassAt,
  THREAT_PROFILES,
  type ProfileId,
  type Threat,
} from "@wg/shared";
import { threats } from "../index.ts";
import { loadEngine } from "./engine.ts";
import { buildPack } from "./pack.ts";
import { buildRuleset, idOf } from "./ruleset.ts";

// What a Threat takes when it joins a fight and the encounter budget (InconsisTable's house decision #92), against
// this repo's prepareThreat (VoA p.126, Core p.326) and encounterBudget with tallyByClass (Threat Assessment p.8), over
// every stat block. Skipped when InconsisTable is not checked out beside this repo.
const engine = await loadEngine();
const skip = engine === null ? "InconsisTable is not checked out beside this repo" : false;
type FieldValue = number | string | boolean | string[];
type Room = { campaign: Record<string, number>; characters: number; seated: number };
const S = engine as unknown as {
  planSpawn(a: {
    ruleset: unknown;
    entity: string;
    values: Record<string, FieldValue>;
    options: string[];
    room: Room;
    mob: boolean;
  }): { options: string[]; fields: Record<string, FieldValue> } | { code: string };
  applyBaseEffects(a: { compiled: unknown; entity: string; values: object }): Record<string, FieldValue>;
  budgetOf(a: {
    ruleset: unknown;
    picks: { values: Record<string, FieldValue>; count: number; mob: boolean }[];
    room: Room;
    switches: string[];
  }): { id: string; used: number; budget: number | null }[];
};
const ruleset = buildRuleset();
const bodies = new Map(
  buildPack()
    .pack.entries.filter((e) => e.type === "threat")
    .map((e) => [e.key, e.body]),
);
const PROFILE_SETS: ProfileId[][] = [[], ...THREAT_PROFILES.map((p) => [p.id]), THREAT_PROFILES.map((p) => p.id)];

// What a prepared stat block says of the numbers a profile or scaling moves, as the pack would write them.
function printed(t: Threat) {
  const dice = (re: RegExp) => t.skills.list.find((s) => re.test(s.name))?.dice;
  const out: Record<string, number | undefined> = {
    "skill.weaponSkill": dice(/^weapons? skill$/i),
    "skill.ballisticSkill": dice(/^ballistics? skill$/i),
    "stat.resilience": t.resilience.value,
    "stat.resolve": t.resolve ?? undefined,
    "stat.wounds": t.wounds,
    "stat.shock": t.shock ?? undefined,
  };
  for (const [a, v] of Object.entries(t.attributes)) out[`attr.${idOf(a)}`] = v ?? undefined;
  return out;
}

test("the ruleset passes InconsisTable's validator with its spawn block", { skip }, () => {
  for (const r of [ruleset, buildRuleset({ builder: "ledger" })]) {
    const c = engine!.compileRuleset(r);
    if (!c.ok) assert.fail(c.problems.map((p) => `${p.path}: ${p.message}`).join("\n"));
  }
});

test("a Threat spawned with Profiles and Scaling has the numbers prepareThreat gives", { skip }, () => {
  const c = engine!.compileRuleset(ruleset);
  assert.ok(c.ok);
  let checked = 0;
  for (const t of threats.values()) {
    const body = bodies.get(t.id);
    if (!body) continue;
    for (const tier of [1, 3, 5])
      for (const profiles of PROFILE_SETS)
        for (const scale of [false, true]) {
          const agents = 4;
          const options = [...profiles.map(idOf), ...(scale ? ["scaled"] : [])];
          const room = { campaign: { tier }, characters: agents, seated: agents };
          const plan = S.planSpawn({ ruleset, entity: "threat", values: body, options, room, mob: false });
          assert.ok("fields" in plan, `${t.id}: ${JSON.stringify(plan)}`);
          const fields = S.applyBaseEffects({
            compiled: c.compiled,
            entity: "threat",
            values: { fields: plan.fields, options: plan.options },
          });
          const want = printed(prepareThreat(t, { tier, agents, profiles, scale }));
          for (const [k, v] of Object.entries(want))
            if (k.startsWith("skill.") ? v !== undefined || fields[k] !== undefined : true)
              assert.equal(fields[k], v, `${t.id} at Tier ${tier}, ${options.join("+")}: ${k}`);
          checked++;
        }
  }
  assert.ok(checked > 10_000, `${checked} cases`);
});

test("a Mob takes no Scaling, and a Champion starts with its personal Ruin", { skip }, () => {
  const c = engine!.compileRuleset(ruleset);
  assert.ok(c.ok);
  for (const t of threats.values()) {
    const body = bodies.get(t.id);
    if (!body) continue;
    const room = { campaign: { tier: 3 }, characters: 4, seated: 4 };
    const plan = S.planSpawn({ ruleset, entity: "threat", values: body, options: ["scaled"], room, mob: true });
    assert.ok("fields" in plan);
    assert.equal(plan.fields["stat.wounds"], t.wounds, t.id);
    const scope = engine!.actorScope({ fields: body });
    assert.equal(
      engine!.startValue({ compiled: c.compiled, resource: "personalRuin", scope }),
      t.personalRuin ?? 0,
      t.id,
    );
  }
});

test("the encounter budget reads what encounterBudget and tallyByClass read", { skip }, () => {
  const list = [...threats.values()].filter((t) => bodies.has(t.id));
  let seed = 7;
  const next = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  for (let n = 0; n < 300; n++) {
    const tier = 1 + Math.floor(next() * 5);
    const agents = 1 + Math.floor(next() * 6);
    const fortified = next() < 0.3;
    const picks = Array.from({ length: 1 + Math.floor(next() * 5) }, () => ({
      t: list[Math.floor(next() * list.length)]!,
      count: 1 + Math.floor(next() * 8),
      mob: next() < 0.4,
    }));
    const lines = S.budgetOf({
      ruleset,
      picks: picks.map((p) => ({ values: bodies.get(p.t.id)!, count: p.count, mob: p.mob })),
      room: { campaign: { tier }, characters: agents, seated: agents },
      switches: fortified ? ["fortified"] : [],
    });
    const tally = tallyByClass(picks.map((p) => ({ cls: threatClassAt(p.t, tier), count: p.count, asMob: p.mob })));
    const want = encounterBudget({ agents, fortified });
    const line = (id: string) => lines.find((l) => l.id === id)!;
    assert.deepEqual(
      ["troops", "inMobs", "elites", "enemies"].map((id) => [line(id).used, line(id).budget]),
      [
        [tally.troops, want.troops],
        [tally.inMobs, want.inMobs],
        [tally.elites, want.elites],
        [tally.tracked, want.enemies],
      ],
      `case ${n}`,
    );
  }
});
