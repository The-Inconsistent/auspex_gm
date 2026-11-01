import { test } from "node:test";
import assert from "node:assert/strict";
import { keepPlay } from "./build.ts";
import { CharacterStats } from "./state.ts";

const gun = (name: string) => ({ name, damage: 10, ed: 1, range: [18, 36, 54] });
const sheet = (weapons: string[], gear: string[]) => CharacterStats.parse({ weapons: weapons.map(gun), gear });

test("a rebuild drops what the stored build gave and the new one doesn't, and keeps what play added", () => {
  const before = sheet(["Bolt Sniper Rifle", "Bolt Pistol"], ["Cameleoline Cloak (Core p.237)"]);
  // The GM's TAKE OUT of the rifle and the cloak.
  const next = sheet(["Bolt Pistol"], []);
  // In play: a requisitioned second rifle, loot, and the cloak's line as a pregen printed it.
  const previous = sheet(
    ["Bolt Sniper Rifle", "Bolt Pistol", "Bolt Sniper Rifle"],
    ["Cameleoline Cloak (Core p.237)", "Camo Cloak (printed)", "Auspex"],
  );
  const r = keepPlay({ previous, next, before });
  assert.deepEqual(
    r.weapons.map((w) => w.name),
    ["Bolt Pistol", "Bolt Sniper Rifle"],
  );
  assert.deepEqual(r.gear, ["Camo Cloak (printed)", "Auspex"]);
});

test("a rebuild with no changes changes nothing", () => {
  const built = sheet(["Bolt Pistol"], ["Auspex"]);
  const previous = sheet(["Bolt Pistol", "Laspistol"], ["Auspex", "Loot"]);
  const r = keepPlay({ previous, next: built, before: built });
  assert.deepEqual(
    r.weapons.map((w) => w.name),
    ["Bolt Pistol", "Laspistol"],
  );
  assert.deepEqual(r.gear, ["Auspex", "Loot"]);
});
