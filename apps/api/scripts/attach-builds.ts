// Usage: bun scripts/attach-builds.ts <campaign id> [--dry-run]
// One-off for campaigns seeded before the volkus pack carried builds (issue #18): gives each hand-made agent whose name
// matches a pack character that character's build, in one `character.build` with `keepSheet` each (admin key), keeping
// the live weapon, armour and gear lines, Wealth, Ammo and requisitions. Each agent's swap is one transaction and those
// that already have a build are skipped, so it's safe to run twice. --dry-run prints what each sheet would change and
// sends nothing.
// Ratings the GM raised on a live sheet by hand (the old PARTY EDIT) are XP the GM allowed: the build buys them, and a GM
// custom budget (Core p.20) covers what they cost beyond the starting XP. A rating lower than the build gives is listed,
// since a build can't take back what its archetype grants.
// ponytail: one-off; delete once the live campaigns are fixed.
import { io } from "socket.io-client";
import {
  buildReady,
  keepPlay,
  resolveBuild,
  type ActionInput,
  type ActionResult,
  type CharacterBuild,
  type CharacterStats,
  type LiveState,
} from "@wg/shared";
import { creationCatalogue, loadPack, wargear } from "@wg/data";

const campaignId = process.argv[2];
const dryRun = process.argv.includes("--dry-run");
if (!campaignId || campaignId.startsWith("--"))
  throw new Error("Usage: bun scripts/attach-builds.ts <campaign id> [--dry-run]");
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
  return r.id;
}

const sorted = (v: unknown): unknown =>
  v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort()) : v;
// The sheet each part of a build changes, as the server will derive it (the catalogue here is this checkout's).
const homebrew = state.campaign.homebrew || pack.campaign.homebrew;
const resolve = (build: CharacterBuild) =>
  resolveBuild({ catalogue: { creation: creationCatalogue(), wargear, homebrew }, build });

// The pack build, buying the live sheet's ratings (a rating at or below what the build grants buys nothing), with the
// budget raised to what that costs if it has to be. What still doesn't match is below a grant: listed, not taken back.
function adopt(build: CharacterBuild, live: CharacterStats) {
  const skills = Object.fromEntries(
    [...new Set([...Object.keys(build.skills), ...Object.keys(live.skills)])].map((k) => [
      k,
      live.skills[k as keyof typeof live.skills] ?? 0,
    ]),
  );
  const bought = { ...build, attributes: { ...live.attributes }, skills };
  const r = resolve(bought);
  const lower = [
    ...Object.entries(live.attributes).filter(([k, v]) => r.sheet.attributes[k as keyof typeof live.attributes] !== v),
    ...Object.entries(skills).filter(([k, v]) => (r.sheet.skills[k as keyof typeof live.skills] ?? 0) !== v),
  ].map(([k]) => k);
  const budget = r.spent > r.budget ? r.spent : undefined;
  return { build: budget ? { ...bought, budget } : bought, from: r.budget, spent: r.spent, lower };
}
const changes = (live: CharacterStats, derived: CharacterStats) => {
  const next = keepPlay({ previous: live, next: derived, before: derived });
  return (Object.keys(next) as (keyof CharacterStats)[])
    .filter((k) => JSON.stringify(sorted(live[k])) !== JSON.stringify(sorted(next[k])))
    .map((k) => `    ${k}: ${JSON.stringify(live[k])}\n      → ${JSON.stringify(next[k])}`);
};

console.log(`${state.campaign.name}${dryRun ? " (dry run)" : ""}`);
if (!dryRun && pack.campaign.homebrew && !state.campaign.homebrew)
  await send({ type: "campaign.update", homebrew: true }, "homebrew on (pregens.md GM choice 14)");
for (const c of state.characters) {
  const p = pack.characters.find((x) => x.name === c.name);
  if (c.build || !p?.build) {
    console.log(`${c.name}: skipped (${c.build ? "has a build" : "not in the pack"})`);
    continue;
  }
  const a = adopt(p.build, c.stats);
  const r = resolve(a.build);
  console.log(`${c.name}:\n${changes(c.stats, r.sheet).join("\n") || "    no sheet change"}`);
  console.log(`    XP: ${a.spent} of ${a.from}${a.build.budget ? ` → GM budget ${a.build.budget} (Core p.20)` : ""}`);
  if (a.lower.length) console.log(`    ! lower on the live sheet than the build gives: ${a.lower.join(", ")}`);
  if (!buildReady(r))
    console.log(`    ! refused: ${[...r.pending.map((x) => x.what), ...r.problems.map((x) => x.what)].join("; ")}`);
  if (!dryRun) await send({ type: "character.build", id: c.id, build: a.build, keepSheet: true }, `build ${c.name}`);
}

socket.close();
