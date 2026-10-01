// Usage: bun scripts/attach-builds.ts <campaign id> [--dry-run]
// One-off for campaigns seeded before the volkus pack carried builds (issue #18): gives each hand-made agent whose name
// matches a pack character that character's build, through the normal socket actions (admin key), keeping the live
// weapon, armour and gear lines, Wealth, Ammo and requisitions. Characters that already have a build are skipped, so
// it's safe to run twice. --dry-run prints what each sheet would change and sends nothing.
// ponytail: one-off; delete once the live campaigns are fixed.
import { io } from "socket.io-client";
import {
  keepPlay,
  resolveBuild,
  type ActionInput,
  type ActionResult,
  type CharacterStats,
  type LiveState,
} from "@wg/shared";
import { creationCatalogue, loadPack, wargear } from "@wg/data";
import { attachBuild } from "./attach-build.ts";

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
const changes = (live: CharacterStats, derived: CharacterStats) => {
  const next = keepPlay({ previous: live, next: derived, before: derived });
  return (Object.keys(next) as (keyof CharacterStats)[])
    .filter((k) => JSON.stringify(sorted(live[k])) !== JSON.stringify(sorted(next[k])))
    .map((k) => `    ${k}: ${JSON.stringify(live[k])}\n      → ${JSON.stringify(next[k])}`);
};

console.log(`${state.campaign.name}${dryRun ? " (dry run)" : ""}`);
if (!dryRun && pack.campaign.homebrew && !state.campaign.homebrew)
  await send({ type: "campaign.update", homebrew: true }, "homebrew on (kill-team.md decision 14)");
for (const c of state.characters) {
  const p = pack.characters.find((x) => x.name === c.name);
  if (c.build || !p?.build) {
    console.log(`${c.name}: skipped (${c.build ? "has a build" : "not in the pack"})`);
    continue;
  }
  const derived = resolveBuild({ catalogue: { creation: creationCatalogue(), wargear, homebrew }, build: p.build });
  console.log(`${c.name}:\n${changes(c.stats, derived.sheet).join("\n") || "    no sheet change"}`);
  if (!dryRun) await attachBuild({ socket, send }, { id: c.id, name: c.name, build: p.build, printed: c.stats });
}

socket.close();
