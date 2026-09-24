import { Logger } from "@nestjs/common";
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  type OnGatewayConnection,
  type OnGatewayInit,
} from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";
import { z } from "zod";
import { Action, toPlayerCodex, toPlayerView, type ActionResult } from "@wg/shared";
import { eq } from "drizzle-orm";
import { resolveCtx, resolveGuest, type Ctx } from "../auth/auth.service.ts";
import { campaign } from "../campaign/campaign.schema.ts";
import { isAdmin } from "../campaign/campaign.service.ts";
import { db } from "../core/db.ts";
import { ActionError } from "../core/errors.ts";
import { applyAction, kicks, touches, type Kick } from "./table.dispatch.ts";
import { loadCodex, loadState } from "./table.state.ts";

const rooms = (campaignId: string) => ({ gm: `c:${campaignId}:gm`, players: `c:${campaignId}:players` });

// What a client puts in `io({ auth })`. Browsers send only campaignId; the Clerk `__session` or guest cookie proves who
// they are. Scripts and tests pass a token instead: a guest `token`, a Clerk `clerkToken`, or the server's `adminKey`.
const Handshake = z.object({
  campaignId: z.uuid().optional(),
  token: z.string().max(200).optional(),
  clerkToken: z.string().max(5000).optional(),
  adminKey: z.string().max(500).optional(),
});

async function handshakeCtx({ auth, headers }: { auth: unknown; headers: { cookie?: string } }): Promise<Ctx | null> {
  const h = Handshake.safeParse(auth ?? {});
  if (!h.success) return null;
  const { campaignId, token, clerkToken, adminKey } = h.data;
  if (adminKey && campaignId) {
    if (!isAdmin(adminKey)) return null;
    const [c] = await db.select({ id: campaign.id }).from(campaign).where(eq(campaign.id, campaignId));
    return c ? { campaignId, role: "gm", characterId: null, userId: null } : null;
  }
  if (token) {
    const guest = await resolveGuest(token);
    return guest && (!campaignId || guest.campaignId === campaignId) ? guest : null;
  }
  if (!campaignId) return null;
  return resolveCtx({
    campaignId,
    headers: { cookie: headers.cookie, authorization: clerkToken ? `Bearer ${clerkToken}` : undefined },
  });
}

// WEB_ORIGIN may list several origins (localhost and the LAN address), comma separated.
@WebSocketGateway({
  cors: { origin: process.env.WEB_ORIGIN?.split(",").map((o) => o.trim()) ?? false, credentials: true },
})
export class TableGateway implements OnGatewayInit, OnGatewayConnection {
  @WebSocketServer() server!: Server;
  private readonly log = new Logger(TableGateway.name);
  // ponytail: in-process per-campaign queue, assumes one api instance; pg advisory locks if we ever scale out
  private readonly tails = new Map<string, Promise<void>>();

  // Authenticate in middleware, before the connection is accepted, so no event can arrive without a ctx.
  afterInit(server: Server) {
    server.use(async (socket, next) => {
      let ctx: Ctx | null;
      try {
        ctx = await handshakeCtx({ auth: socket.handshake.auth, headers: socket.handshake.headers });
      } catch {
        // DB down: the client retries (use-table), unlike "unauthorized" which it treats as a dead token.
        return next(new Error("unavailable"));
      }
      if (!ctx) return next(new Error("unauthorized"));
      socket.data = ctx;
      next();
    });
  }

  async handleConnection(socket: Socket) {
    const ctx = socket.data as Ctx;
    const r = rooms(ctx.campaignId);
    await socket.join(ctx.role === "gm" ? r.gm : r.players);
    const gm = ctx.role === "gm";
    const [state, codex] = await Promise.all([loadState(ctx.campaignId), loadCodex(ctx.campaignId)]);
    if (state) socket.emit("state", gm ? state : toPlayerView(state));
    socket.emit("codex", gm ? codex : toPlayerCodex(codex));
  }

  @SubscribeMessage("action")
  async onAction(@ConnectedSocket() socket: Socket, @MessageBody() body: unknown): Promise<ActionResult> {
    const ctx = socket.data as Ctx;
    const parsed = Action.safeParse(body);
    if (!parsed.success) return { ok: false, error: z.prettifyError(parsed.error) };
    const action = parsed.data;

    return this.serial(ctx.campaignId, async () => {
      let result: ActionResult;
      try {
        result = await db.transaction((tx) => applyAction(tx, { ctx, action }));
      } catch (e) {
        if (e instanceof ActionError) return { ok: false, error: e.message };
        this.log.error(e);
        return { ok: false, error: "Server error" };
      }
      // Committed: report success even if fan-out fails, or a retap would apply the delta twice. The next broadcast resyncs.
      try {
        const kick = kicks(action);
        if (kick) await this.kick({ campaignId: ctx.campaignId, kick });
        await this.broadcast(ctx.campaignId, touches(action));
      } catch (e) {
        this.log.error(e);
      }
      return result;
    });
  }

  // For REST changes to a table (accepting an invite): same queue as socket actions, then the same broadcast.
  async mutate<T>({ campaignId, fn }: { campaignId: string; fn: () => Promise<T> }): Promise<T> {
    const result = await this.serial(campaignId, fn);
    try {
      await this.broadcast(campaignId, { state: true, codex: false });
    } catch (e) {
      this.log.error(e);
    }
    return result;
  }

  // Runs fn after every earlier call for the same key has settled; a failure doesn't break the chain.
  private serial<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.tails.get(key);
    const run = (async () => {
      await prev;
      const result = await fn();
      return result;
    })();
    this.tails.set(
      key,
      (async () => {
        try {
          await run;
        } catch {
          // The caller of `run` sees the error; the next call just waits for it to settle.
        }
      })(),
    );
    return run;
  }

  private async broadcast(campaignId: string, what: { state: boolean; codex: boolean }) {
    const r = rooms(campaignId);
    if (what.state) {
      const state = await loadState(campaignId);
      if (state) {
        this.server.to(r.gm).emit("state", state);
        this.server.to(r.players).emit("state", toPlayerView(state));
      }
    }
    if (what.codex) {
      const codex = await loadCodex(campaignId);
      this.server.to(r.gm).emit("codex", codex);
      this.server.to(r.players).emit("codex", toPlayerCodex(codex));
    }
  }

  // Disconnects the sockets that just lost access: a removed member, or the players of a revoked/deleted character.
  private async kick({ campaignId, kick }: { campaignId: string; kick: Kick }) {
    const r = rooms(campaignId);
    for (const s of await this.server.in([r.gm, r.players]).fetchSockets()) {
      const c = s.data as Ctx;
      const hit =
        "userId" in kick
          ? c.userId === kick.userId
          : c.characterId === kick.characterId && (!kick.guestsOnly || c.userId === null);
      if (hit) s.disconnect(true);
    }
  }
}
