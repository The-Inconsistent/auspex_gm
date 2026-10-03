// Usage: bun scripts/seed.ts volkus --owner user_2abc…
// Creates a new campaign on the running api and loads a content pack (packages/data/packs/<name>) into it, through
// the same socket actions the GM app uses, so everything is validated and scoped exactly as in play. --owner is the
// Clerk user id (Clerk Dashboard → Users) seated as GM; without it nobody can open the campaign.
import { io } from "socket.io-client";
import type { ActionInput, ActionResult } from "@wg/shared";
import { loadPack } from "@wg/data";

const args = process.argv.slice(2);
const name = args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--owner");
const ownerUserId = args[args.indexOf("--owner") + 1];
if (!name || !args.includes("--owner") || !ownerUserId)
  throw new Error("Usage: bun scripts/seed.ts <pack name> --owner <clerk user id>");
const pack = loadPack(name);

const api = process.env.API_URL ?? `http://localhost:${process.env.PORT ?? 4000}`;
const res = await fetch(`${api}/api/campaigns`, {
  method: "POST",
  headers: { "content-type": "application/json", "x-admin-key": process.env.ADMIN_KEY ?? "" },
  body: JSON.stringify({ name: pack.campaign.name, tier: pack.campaign.tier, ownerUserId }),
});
if (!res.ok) throw new Error(`Create campaign: ${res.status} ${await res.text()}`);
const { campaignId } = (await res.json()) as { campaignId: string };

const socket = io(api, {
  auth: { adminKey: process.env.ADMIN_KEY, campaignId },
  transports: ["websocket"],
  reconnection: false,
});
await new Promise<void>((ok, fail) => (socket.once("connect", () => ok()), socket.once("connect_error", fail)));

async function send(a: ActionInput, what: string): Promise<string | undefined> {
  const r = (await socket.emitWithAck("action", a)) as ActionResult;
  if (!r.ok) throw new Error(`${what}: ${r.error}`);
  return r.id;
}
const ids = new Map<string, string>();
const ref = (k: string | undefined) => (k ? (ids.get(k) ?? null) : null);

await send(
  {
    type: "campaign.update",
    framework: pack.campaign.framework,
    frameworkBonus: pack.campaign.frameworkBonus,
    patron: pack.campaign.patron,
    kind: pack.campaign.kind,
    limits: pack.campaign.limits,
    homebrew: pack.campaign.homebrew,
  },
  "framework",
);
// A pack's own stat blocks go first: a beat or an NPC below may name one as custom-<slug> (issue #43).
for (const data of pack.threats) await send({ type: "threat.save", data }, `threat ${data.name}`);
for (const { key, ...data } of pack.factions)
  ids.set(key, (await send({ type: "codex.save", kind: "faction", data }, `faction ${key}`))!);
for (const { key, parent, ...data } of pack.locations)
  ids.set(
    key,
    (await send(
      { type: "codex.save", kind: "location", data: { ...data, parentId: ref(parent) } },
      `location ${key}`,
    ))!,
  );
for (const { key, faction, ...data } of pack.npcs)
  ids.set(
    key,
    (await send({ type: "codex.save", kind: "npc", data: { ...data, factionId: ref(faction) } }, `npc ${key}`))!,
  );
for (const { key, ...data } of pack.handouts)
  ids.set(key, (await send({ type: "codex.save", kind: "handout", data }, `handout ${key}`))!);
for (const { key, location, npc, ...data } of pack.items)
  ids.set(
    key,
    (await send(
      { type: "codex.save", kind: "item", data: { ...data, locationId: ref(location), npcId: ref(npc) } },
      `item ${key}`,
    ))!,
  );
for (const { key, beats, ...data } of pack.adventures) {
  const adventureId = (await send({ type: "codex.save", kind: "adventure", data }, `adventure ${key}`))!;
  for (const { location, npcs, handouts, items, ...b } of beats)
    await send(
      {
        type: "codex.save",
        kind: "beat",
        data: {
          ...b,
          adventureId,
          locationId: ref(location),
          npcIds: npcs.map((k) => ids.get(k)!),
          handoutIds: handouts.map((k) => ids.get(k)!),
          itemIds: items.map((k) => ids.get(k)!),
        },
      },
      `beat "${b.title}"`,
    );
}
for (const c of pack.characters) {
  const id = (await send(
    { type: "character.create", name: c.name, stats: c.stats, detail: c.detail, objectives: c.objectives },
    `character ${c.name}`,
  ))!;
  // The build, keeping the printed armour and gear lines (issue #18); its weapons are the build's, with their Talents
  // applied on read, plus the GM's own lines the build has none of (keepSheetWeapons, rules-flow.md §11.68).
  if (c.build) await send({ type: "character.build", id, build: c.build, keepSheet: true }, `build ${c.name}`);
}

socket.close();
console.log(
  `Seeded "${pack.campaign.name}": ${pack.factions.length} factions, ${pack.locations.length} locations, ${pack.npcs.length} NPCs, ` +
    `${pack.handouts.length} handouts, ${pack.items.length} items, ${pack.adventures.reduce((n, a) => n + a.beats.length, 0)} beats, ${pack.characters.length} characters.`,
);
const web = (process.env.WEB_ORIGIN ?? "http://localhost:3000").split(",")[0];
console.log(`Open it (signed in as ${ownerUserId}): ${web}/c/${campaignId}`);
