// Usage: bun scripts/seed.ts volkus
// Creates a new campaign on the running api and loads a content pack (packages/data/packs/<name>) into it, through
// the same socket actions the GM app uses, so everything is validated and scoped exactly as in play.
import { io } from "socket.io-client";
import type { ActionInput, ActionResult } from "@wg/shared";
import { loadPack } from "@wg/data";

const name = process.argv[2];
if (!name) throw new Error("Usage: bun scripts/seed.ts <pack name>");
const pack = loadPack(name);

const api = process.env.API_URL ?? `http://localhost:${process.env.PORT ?? 4000}`;
const res = await fetch(`${api}/api/campaigns`, {
  method: "POST",
  headers: { "content-type": "application/json", "x-admin-key": process.env.ADMIN_KEY ?? "" },
  body: JSON.stringify({ name: pack.campaign.name, tier: pack.campaign.tier }),
});
if (!res.ok) throw new Error(`Create campaign: ${res.status} ${await res.text()}`);
const { gmToken } = (await res.json()) as { gmToken: string };

const socket = io(api, { auth: { token: gmToken }, transports: ["websocket"], reconnection: false });
await new Promise<void>((ok, fail) => (socket.once("connect", () => ok()), socket.once("connect_error", fail)));

async function send(a: ActionInput, what: string): Promise<string | undefined> {
  const r = (await socket.emitWithAck("action", a)) as ActionResult;
  if (!r.ok) throw new Error(`${what}: ${r.error}`);
  return r.id;
}
const ids = new Map<string, string>();
const ref = (k: string | undefined) => (k ? ids.get(k) ?? null : null);

await send({ type: "campaign.update", framework: pack.campaign.framework, patron: pack.campaign.patron }, "framework");
for (const { key, ...data } of pack.factions) ids.set(key, (await send({ type: "codex.save", kind: "faction", data }, `faction ${key}`))!);
for (const { key, parent, ...data } of pack.locations)
  ids.set(key, (await send({ type: "codex.save", kind: "location", data: { ...data, parentId: ref(parent) } }, `location ${key}`))!);
for (const { key, faction, ...data } of pack.npcs)
  ids.set(key, (await send({ type: "codex.save", kind: "npc", data: { ...data, factionId: ref(faction) } }, `npc ${key}`))!);
for (const { key, ...data } of pack.handouts) ids.set(key, (await send({ type: "codex.save", kind: "handout", data }, `handout ${key}`))!);
for (const { key, beats, ...data } of pack.adventures) {
  const adventureId = (await send({ type: "codex.save", kind: "adventure", data }, `adventure ${key}`))!;
  for (const { location, npcs, handouts, ...b } of beats)
    await send({
      type: "codex.save", kind: "beat",
      data: { ...b, adventureId, locationId: ref(location), npcIds: npcs.map((k) => ids.get(k)!), handoutIds: handouts.map((k) => ids.get(k)!) },
    }, `beat "${b.title}"`);
}
for (const c of pack.characters) await send({ type: "character.create", name: c.name, stats: c.stats }, `character ${c.name}`);

socket.close();
console.log(`Seeded "${pack.campaign.name}": ${pack.factions.length} factions, ${pack.locations.length} locations, ${pack.npcs.length} NPCs, ` +
  `${pack.handouts.length} handouts, ${pack.adventures.reduce((n, a) => n + a.beats.length, 0)} beats, ${pack.characters.length} characters.`);
console.log(`GM link: ${process.env.WEB_ORIGIN ?? "http://localhost:3000"}/join/${gmToken}`);
