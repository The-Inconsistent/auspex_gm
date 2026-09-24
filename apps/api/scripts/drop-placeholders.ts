// Usage: bun scripts/drop-placeholders.ts <campaign id>
// One-off for campaigns seeded before the volkus pack dropped its "(placeholder name)" tags: strips the tag from the
// patron and from NPC names and roles, through the normal socket actions (admin key). Safe to run twice.
// ponytail: one-off; delete once the live campaigns are fixed.
import { io } from "socket.io-client";
import type { ActionInput, ActionResult, Codex, LiveState } from "@wg/shared";

const campaignId = process.argv[2];
if (!campaignId) throw new Error("Usage: bun scripts/drop-placeholders.ts <campaign id>");
const TAG = " (placeholder name)";

const api = process.env.API_URL ?? `http://localhost:${process.env.PORT ?? 4000}`;
const socket = io(api, { auth: { adminKey: process.env.ADMIN_KEY, campaignId }, transports: ["websocket"], reconnection: false });
const [state, codex] = await Promise.all([
  new Promise<LiveState>((ok, fail) => (socket.once("state", ok), socket.once("connect_error", fail))),
  new Promise<Codex>((ok) => socket.once("codex", ok)),
]);

async function send(a: ActionInput, what: string) {
  const r = (await socket.emitWithAck("action", a)) as ActionResult;
  if (!r.ok) throw new Error(`${what}: ${r.error}`);
  console.log(`fixed ${what}`);
}

if (state.campaign.patron.includes(TAG))
  await send({ type: "campaign.update", patron: state.campaign.patron.replaceAll(TAG, "") }, "patron");
for (const { id, ...npc } of codex.npcs)
  if (npc.name.includes(TAG) || npc.role.includes(TAG))
    await send({ type: "codex.save", kind: "npc", id, data: { ...npc, name: npc.name.replaceAll(TAG, ""), role: npc.role.replaceAll(TAG, "") } }, `npc ${npc.name}`);

socket.close();
console.log(`Done: ${state.campaign.name}`);
