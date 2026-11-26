import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { threatClassAt } from "@wg/shared";
import { threats } from "../index.ts";
import { loadEngine } from "./engine.ts";
import { buildPack, type Entry } from "./pack.ts";
import { buildRuleset, idOf, THREAT_CLASSES } from "./ruleset.ts";

// The Threat pack: skipped, like the ruleset's tests, when InconsisTable is not checked out beside this repo.
const engine = await loadEngine();
const skip = engine === null ? "InconsisTable is not checked out beside this repo" : false;
const { pack } = buildPack();
const byKey = new Map(pack.entries.map((e) => [e.key, e]));
const threatEntries = pack.entries.filter((e) => e.type === "threat");
const weaponEntries = pack.entries.filter((e) => e.type === "weapon");

test("the pack passes InconsisTable's validatePack against the compiled ruleset", { skip }, () => {
  const compiled = engine!.compileRuleset(buildRuleset());
  if (!compiled.ok) assert.fail(compiled.problems.map((p) => `${p.path}: ${p.message}`).join("\n"));
  const result = engine!.validatePack({ input: pack, ruleset: compiled.compiled.ruleset });
  if (!result.ok) assert.fail(result.problems.map((p) => `${p.path}: ${p.message}`).join("\n"));
  assert.deepEqual(result.warnings, []);
});

test("one threat entry per file, and one weapon entry per weapon of every ability and option, a Mob's too", () => {
  const files = readdirSync(new URL("../threats/", import.meta.url)).filter((f) => f.endsWith(".json"));
  assert.equal(threatEntries.length, files.length);
  assert.deepEqual(threatEntries.map((e) => e.key).sort(), files.map((f) => f.replace(/\.json$/, "")).sort());
  let want = 0;
  for (const t of threats.values()) {
    want += t.abilities.reduce((n, a) => n + a.weapons.length, 0);
    want += t.mobAbilities.reduce((n, a) => n + a.weapons.length, 0);
    for (const o of t.options) want += o.weapons.length + o.abilities.reduce((n, a) => n + a.weapons.length, 0);
  }
  assert.ok(want > 0);
  assert.equal(weaponEntries.length, want);
  assert.equal(byKey.size, pack.entries.length, "keys are unique");
});

test("a Mob's abilities and options come by name, as a single Threat's (#325)", () => {
  let mobs = 0;
  for (const t of threats.values()) {
    const body = byKey.get(t.id)!.body;
    assert.deepEqual(
      body.mobOptions,
      t.options.filter((o) => o.kind === "mob").map((o) => o.name),
      t.id,
    );
    assert.equal((body.mobAbilities as string[]).length, t.mobAbilities.length, t.id);
    if (t.mobAbilities.length + (body.mobOptions as string[]).length > 0) mobs++;
  }
  assert.ok(mobs > 0);
});

test("no entry body carries book prose", () => {
  for (const e of pack.entries) {
    for (const [field, value] of Object.entries(e.body)) {
      assert.ok(!["text", "note", "description"].includes(field), `${e.key}: ${field}`);
      // The armour note is a few words of the block's own; the two weapon lists hold entry keys (up to 80 characters).
      if (["stat.armourNote", "weapons", "variantWeapons", "mobWeapons"].includes(field)) continue;
      for (const v of typeof value === "string" ? [value] : Array.isArray(value) ? value : [])
        assert.ok(v.length <= 60, `${e.key}.${field}: ${v.length} characters`);
    }
  }
});

test("every key a threat lists is a weapon entry, and every weapon entry is listed once", () => {
  const listed: string[] = [];
  for (const e of threatEntries) {
    for (const field of ["weapons", "variantWeapons", "mobWeapons"]) {
      for (const key of e.body[field] as string[]) {
        assert.equal(byKey.get(key)?.type, "weapon", `${e.key}.${field}: ${key}`);
        assert.ok(key.startsWith(`${e.key}.`), `${key} belongs to ${e.key}`);
        listed.push(key);
      }
    }
  }
  assert.deepEqual(listed.sort(), weaponEntries.map((e) => e.key).sort());
});

// Read from the files themselves, not through the zod schema the pack is built from.
const raw = (id: string) =>
  JSON.parse(readFileSync(new URL(`../threats/${id}.json`, import.meta.url), "utf8")) as {
    id: string;
    name: string;
    page: number;
    threat: (string | null)[];
    attributes: Record<string, number | null>;
    defence: number;
    wounds: number;
    shock: number | null;
    speed: number;
    size: string;
    resilience: { value: number };
    abilities: { weapons?: { name: string; damage: number; ed: number | string; range: number[] }[] }[];
  };

for (const [id, cite] of [
  ["acolyte-hybrid", "Core p.368"],
  ["gruzbag", "GK p.15"],
  ["dh-chosen", "D&H p.36"],
] as const) {
  test(`${id}: the entry's numbers are the file's`, () => {
    const file = raw(id);
    const e = byKey.get(id) as Entry;
    assert.equal(e.name, file.name);
    assert.equal(e.cite, cite);
    assert.equal(e.visibility, "gm");
    assert.equal(e.body["stat.defence"], file.defence);
    assert.equal(e.body["stat.resilience"], file.resilience.value);
    assert.equal(e.body["stat.wounds"], file.wounds);
    assert.equal(e.body["stat.speed"], file.speed);
    assert.equal(e.body["stat.shock"], file.shock ?? undefined);
    assert.equal(e.body.size, idOf(file.size));
    for (const [a, v] of Object.entries(file.attributes)) assert.equal(e.body[`attr.${idOf(a)}`], v ?? undefined, a);
    // A printed column is carried as printed; an unprinted one is the one threatClassAt reads for that Tier.
    file.threat.forEach((c, i) => {
      if (c !== null) assert.equal(e.body[`class.t${i + 1}`], THREAT_CLASSES[c as keyof typeof THREAT_CLASSES]);
    });
    const weapons = file.abilities.flatMap((a) => a.weapons ?? []);
    const keys = e.body.weapons as string[];
    assert.equal(keys.length, weapons.length);
    weapons.forEach((w, i) => {
      const we = byKey.get(keys[i]!)!;
      assert.equal(we.name, w.name);
      assert.equal(we.body.damage, w.damage);
      assert.equal(we.body[typeof w.ed === "number" ? "ed" : "edDice"], w.ed);
      assert.equal(we.body["range.s"], w.range[0]);
      assert.equal(we.body["range.m"], w.range[1]);
      assert.equal(we.body["range.l"], w.range[2]);
      assert.equal(we.cite, cite);
    });
  });
}

test("every Threat carries its class at all five Tiers, as threatClassAt reads the printed row", { skip }, () => {
  const { pack } = buildPack();
  const byKey = new Map(pack.entries.filter((e) => e.type === "threat").map((e) => [e.key, e]));
  for (const t of threats.values()) {
    for (let tier = 1; tier <= 5; tier++) {
      assert.equal(
        byKey.get(t.id)?.body[`class.t${tier}`],
        THREAT_CLASSES[threatClassAt(t, tier)],
        `${t.id} Tier ${tier}`,
      );
    }
  }
});
