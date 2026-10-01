// Usage: bun scripts/derive-weapons.ts <campaign id> [--dry-run]
// One-off for characters built before issue #27, through the normal socket actions (admin key). Every built character
// gets the standing weapon effects its build gives (`stats.weaponEffects`, rules-flow.md §11.68), which a sheet saved
// before #27 lacks, so the table applies them on read. A volkus agent first takes the pack's GM gear into its build,
// then swaps its printed weapon lines, which worked
// the Talents in by hand, for its build's catalogue lines; a line the build has no weapon of that name for stays (a
// GM's own profile, a weapon gained in play). A volkus agent is rewritten even when it has effects: a rebuild before
// this ran may have tagged a printed line with its catalogue id, which would count its Talent twice. The result is the
// same each time, so it's safe to run twice. --dry-run prints each line as the table would show it, before and after,
// and sends nothing.
// ponytail: one-off; delete once the live campaigns are fixed.
import { io } from "socket.io-client";
import {
  CharacterBuild,
  buildReady,
  keepSheetWeapons,
  rankOf,
  resolveBuild,
  withUpgrades,
  withWeaponEffects,
  type ActionInput,
  type ActionResult,
  type CharacterStats,
  type LiveState,
  type Weapon,
} from "@wg/shared";
import { creationCatalogue, loadPack, wargear } from "@wg/data";

const campaignId = process.argv[2];
const dryRun = process.argv.includes("--dry-run");
if (!campaignId || campaignId.startsWith("--"))
  throw new Error("Usage: bun scripts/derive-weapons.ts <campaign id> [--dry-run]");
const pack = loadPack("volkus");

const api = process.env.API_URL ?? `http://localhost:${process.env.PORT ?? 4000}`;
const socket = io(api, {
  auth: { adminKey: process.env.ADMIN_KEY, campaignId },
  transports: ["websocket"],
  reconnection: false,
});
const state = await new Promise<LiveState>(
  (ok, fail) => (socket.once("state", ok), socket.once("connect_error", fail)),
);

async function send(a: ActionInput, what: string) {
  const r = (await socket.emitWithAck("action", a)) as ActionResult;
  if (!r.ok) throw new Error(`${what}: ${r.error}`);
  console.log(`  sent ${what}`);
}

// Key order differs between the pack's JSON and what Postgres hands back, so compare with sorted keys.
const stable = (v: unknown): string =>
  JSON.stringify(v, (_, x) =>
    x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort()) : x,
  );
const line = (w: Weapon) =>
  `${w.name} ${w.damage}/${w.ed}/${w.ap ?? 0}/S${w.salvo ?? "–"} [${w.traits.join(", ")}]${w.upgradeNames?.length ? ` + ${w.upgradeNames.join(", ")}` : ""}`;
// The state is the sheet as the table shows it already; a sheet about to be stored is shown the way the table will.
const shown = (stats: CharacterStats, xp: number) =>
  withWeaponEffects(withUpgrades(stats, wargear), { rank: rankOf(xp), catalogue: wargear }).weapons.map(line);

// The volkus builds take Apocrypha records (pregens.md GM choice 14), which the pack switches on.
const homebrew = state.campaign.homebrew || pack.campaign.homebrew;
console.log(`${state.campaign.name}${dryRun ? " (dry run)" : ""}`);
if (!dryRun && homebrew && !state.campaign.homebrew)
  await send({ type: "campaign.update", homebrew: true }, "homebrew on (pregens.md GM choice 14)");
for (const c of state.characters) {
  if (!c.build) {
    console.log(`${c.name}: skipped (a hand-made sheet, no build)`);
    continue;
  }
  const p = pack.characters.find((x) => x.name === c.name);
  const printed = !!p;
  if (c.stats.weaponEffects && !printed) {
    console.log(`${c.name}: skipped (has its weapon effects)`);
    continue;
  }
  // A volkus agent's build takes the pack's GM gear (user ruling 2026-10-01): a build attached before #34 lacks the
  // fitted Duelling Grips and the Disruptor's stand-ins (pregens.md GM choice 25), which its weapon lines need.
  const stored = CharacterBuild.parse(c.build);
  const build = p?.build ? { ...stored, gm: { ...stored.gm, gear: p.build.gm.gear } } : stored;
  const regear = stable(build.gm.gear) !== stable(stored.gm.gear);
  // As `character.build` resolves it, so the effects are the ones the next save would write.
  const r = resolveBuild({
    catalogue: { creation: creationCatalogue(), wargear, homebrew },
    build,
    play: {
      tier: state.campaign.tier,
      xpEarned: c.xp,
      xpAtAscension: c.xpAtAscension,
      packageWaived: c.ascensionPackageWaived,
    },
  });
  if (!buildReady(r)) {
    const why = [...r.pending.map((x) => x.what), ...r.problems.map((x) => x.what)].join("; ");
    console.log(`${c.name}: skipped, its build doesn't resolve now (${why})`);
    continue;
  }
  // As `keepSheet` keeps them: the build's lines, play's fitted upgrades and second copies, the GM's own lines.
  const weapons = printed ? keepSheetWeapons(c.stats.weapons, r.sheet.weapons) : c.stats.weapons;
  const next = { ...c.stats, weapons, weaponEffects: r.sheet.weaponEffects };
  console.log(`${c.name}: ${r.sheet.weaponEffects?.map((e) => e.source).join(", ") || "no weapon effects"}`);
  if (regear) console.log("    GM gear: replaced with the pack's");
  if (printed) {
    const before = c.stats.weapons.map(line);
    const after = shown(next, c.xp);
    for (const l of before.filter((l) => !after.includes(l))) console.log(`    - ${l}`);
    for (const l of after.filter((l) => !before.includes(l))) console.log(`    + ${l}`);
  }
  if (dryRun) continue;
  // The build first, then the lines it derives. The build alone is safe: a rebuild marks the printed lines
  // `asPrinted`, so nothing counts twice if the second step fails, and a rerun finishes it.
  if (regear) await send({ type: "character.build", id: c.id, build }, `GM gear ${c.name}`);
  await send({ type: "character.update", id: c.id, stats: next }, `weapons ${c.name}`);
}

socket.close();
