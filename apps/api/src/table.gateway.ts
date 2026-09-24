import { Logger } from "@nestjs/common";
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  type OnGatewayConnection,
} from "@nestjs/websockets";
import { z } from "zod";
import type { Server, Socket } from "socket.io";
import { Action, toPlayerCodex, toPlayerView, type ActionResult } from "@wg/shared";
import { ActionError, applyAction, touches } from "./actions.ts";
import { readCookie, resolveToken, type Ctx } from "./auth.ts";
import { db } from "./db.ts";
import { loadCodex, loadState } from "./state.ts";

const rooms = (campaignId: string) => ({ gm: `c:${campaignId}:gm`, players: `c:${campaignId}:players` });

@WebSocketGateway({ cors: { origin: process.env.WEB_ORIGIN ?? false, credentials: true } })
export class TableGateway implements OnGatewayConnection {
  @WebSocketServer() server!: Server;
  private readonly log = new Logger(TableGateway.name);
  // ponytail: in-process per-campaign queue, assumes one api instance; pg advisory locks if we ever scale out
  private readonly tails = new Map<string, Promise<unknown>>();

  async handleConnection(socket: Socket) {
    // Browsers send the httpOnly cookie; scripts and tests may pass { auth: { token } }.
    const token = readCookie(socket.handshake.headers.cookie) ?? (socket.handshake.auth as { token?: string }).token;
    const ctx = await resolveToken(token);
    if (!ctx) return socket.disconnect(true);
    socket.data = ctx;
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
    const a = parsed.data;

    return this.serial(ctx.campaignId, async () => {
      try {
        const result = await db.transaction((tx) => applyAction(tx, ctx, a));
        if (a.type === "token.revoke" || a.type === "character.delete") await this.kick(ctx.campaignId, a.type === "token.revoke" ? a.characterId : a.id);
        await this.broadcast(ctx.campaignId, touches(a));
        return result;
      } catch (e) {
        if (e instanceof ActionError) return { ok: false, error: e.message };
        this.log.error(e);
        return { ok: false, error: "Server error" };
      }
    });
  }

  private serial<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const run = (this.tails.get(key) ?? Promise.resolve()).then(fn);
    this.tails.set(key, run.catch(() => {}));
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

  private async kick(campaignId: string, characterId: string) {
    for (const s of await this.server.in(rooms(campaignId).players).fetchSockets())
      if ((s.data as Ctx).characterId === characterId) s.disconnect(true);
  }
}
