import assert from "node:assert/strict";
import { test } from "node:test";

import type { RuleEntry, Weapon } from "@wg/shared";

import { catalogueOptions } from "./combat-options.ts";

const rule = (id: string): RuleEntry => ({ id, kind: "action", name: id, source: "core", page: 1, gist: id, text: id });
const actions = ["aim", "brace", "full-auto", "pinning-attack", "reloading", "called-shot", "something-new"].map(rule);
const knife: Weapon = { name: "Knife", damage: 3, ed: 1, range: [1], traits: [], melee: true };
const pistol: Weapon = { name: "Pistol", damage: 7, ed: 1, range: [6, 12, 18], salvo: null, traits: [] };
const bolter: Weapon = { name: "Bolter", damage: 10, ed: 1, range: [12, 24, 36], salvo: 2, traits: ["Heavy (4)"] };

const needs = (weapons: Weapon[]) =>
  Object.fromEntries(catalogueOptions(actions, weapons).flatMap((g) => g.entries.map((e) => [e.rule.id, e.needs])));

test("a melee-only Agent can't use the shooting options, and is told why", () => {
  const n = needs([knife]);
  assert.equal(n.aim, "a ranged weapon");
  assert.equal(n["full-auto"], "a weapon with a Salvo");
  assert.equal(n["called-shot"], null);
});

test("a Salvo '–' gun can Aim and Reload but not use Salvo Options or Pin (p.185, p.189)", () => {
  const n = needs([pistol]);
  assert.equal(n.aim, null);
  assert.equal(n.reloading, null);
  assert.equal(n["full-auto"], "a weapon with a Salvo");
  assert.equal(n["pinning-attack"], "a ranged weapon with Salvo 1+");
  assert.equal(n.brace, "a Heavy weapon");
});

test("a Heavy Salvo 2 gun opens everything; usable entries come first; unknown ids land in OTHER", () => {
  const groups = catalogueOptions(actions, [bolter]);
  assert.ok(groups.every((g) => g.entries.every((e) => e.needs === null)));
  assert.deepEqual(
    groups.map((g) => g.title),
    ["ATTACK, ANY WEAPON", "SHOOTING", "OTHER"],
  );
  const shooting = catalogueOptions(actions, [pistol]).find((g) => g.title === "SHOOTING")!;
  assert.deepEqual(
    shooting.entries.map((e) => e.rule.id),
    ["aim", "reloading", "brace", "full-auto", "pinning-attack"],
  );
  assert.equal(shooting.usable, 2);
});
