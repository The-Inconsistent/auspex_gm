import { Logger } from "@nestjs/common";
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  type OnGatewayInit,
} from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";
import { z } from "zod";
import {
  Action,
  BookAck,
  BookPage,
  BookServing,
  MAX_PAGE_BYTES,
  toPlayerCodex,
  toPlayerView,
  type ActionResult,
  type BookAvailable,
  type ThreatSource,
} from "@wg/shared";
import { eq } from "drizzle-orm";
import { resolveCtx, resolveGuest, type Ctx } from "../auth/auth.service.ts";
import { campaign } from "../campaign/campaign.schema.ts";
import { isAdmin } from "../campaign/campaign.service.ts";
import { db } from "../core/db.ts";
import { ActionError } from "../core/errors.ts";
import { clientIp, limiter } from "../core/rate-limit.ts";
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

// Per IP for connects (a whole table shares one NAT, and all of it reconnects after an api restart), per socket for
// actions: a GM tapping fast stays far below 2/s over a minute.
const allowConnect = limiter({ max: 60, windowMs: 60_000 });
const allowAction = limiter({ max: 120, windowMs: 60_000 });
// A player flipping through cited pages; each one costs the GM's tablet a render.
const allowPage = limiter({ max: 30, windowMs: 60_000 });
const PAGE_TIMEOUT_MS = 15_000;

// A GM socket that serves book pages from its own PDFs (book:serving). Presence only, so it dies with the socket.
type Seat = Ctx & { books?: ThreatSource[] };

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
  maxHttpBufferSize: MAX_PAGE_BYTES + 100_000, // a relayed book page (book:request), plus the ack envelope
})
export class TableGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Server;
  private readonly log = new Logger(TableGateway.name);
  // ponytail: in-process per-campaign queue, assumes one api instance; pg advisory locks if we ever scale out
  private readonly tails = new Map<string, Promise<void>>();

  // Authenticate in middleware, before the connection is accepted, so no event can arrive without a ctx.
  afterInit(server: Server) {
    server.use(async (socket, next) => {
      // Anything but "unauthorized" makes the client retry later (use-table), so a limited socket backs off.
      if (!allowConnect(clientIp(socket.handshake.headers, socket.handshake.address))) {
        return next(new Error("rate limited"));
      }
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
    if (state) socket.emit("state", gm ? state : toPlayerView(state, ctx.characterId));
    socket.emit("codex", gm ? codex : toPlayerCodex(codex, ctx.characterId));
    this.announceBooks(ctx.campaignId, socket);
  }

  // A serving GM left (closed the tab, lost signal): the players' page links go back to plain text.
  handleDisconnect(socket: Socket) {
    const seat = socket.data as Seat | undefined;
    if (seat?.books?.length) this.announceBooks(seat.campaignId);
  }

  // The GM's tablet serves these books from PDFs picked on that device; an empty list stops serving.
  @SubscribeMessage("book:serving")
  onBookServing(@ConnectedSocket() socket: Socket, @MessageBody() body: unknown) {
    const seat = socket.data as Seat;
    const parsed = BookServing.safeParse(body);
    if (seat.role !== "gm" || !parsed.success) return;
    seat.books = parsed.data.sources;
    this.announceBooks(seat.campaignId);
  }

  // Any seat asks for one page; a GM socket serving that book renders it and the image comes back in this ack only.
  // Nothing is stored. ponytail: any page of a served book, allow-list the cited pages if the table ever needs it
  @SubscribeMessage("book:request")
  async onBookRequest(@ConnectedSocket() socket: Socket, @MessageBody() body: unknown): Promise<BookAck> {
    const seat = socket.data as Seat;
    if (seat.role === "screen") return { ok: false, error: "The table screen shows no book pages." }; // nobody reads there
    if (!allowPage(socket.id)) return { ok: false, error: "Too many pages. Slow down." };
    const parsed = BookPage.safeParse(body);
    if (!parsed.success) return { ok: false, error: z.prettifyError(parsed.error) };
    const server = this.bookServers(seat.campaignId).find((s) => (s.data as Seat).books?.includes(parsed.data.source));
    if (!server) return { ok: false, error: "The GM isn't serving that book." };
    let reply: unknown;
    try {
      reply = await server.timeout(PAGE_TIMEOUT_MS).emitWithAck("book:request", parsed.data);
    } catch {
      return { ok: false, error: "No reply from the GM's tablet." };
    }
    // Only a GM socket answers, but its reply is still parsed before it's passed on. The player's client receives the
    // image as an ArrayBuffer (BookReply).
    const ack = BookAck.safeParse(reply);
    return ack.success ? ack.data : { ok: false, error: "The GM's tablet couldn't render it." };
  }

  @SubscribeMessage("action")
  async onAction(@ConnectedSocket() socket: Socket, @MessageBody() body: unknown): Promise<ActionResult> {
    const ctx = socket.data as Ctx;
    // The admin key (seed.ts loads a whole pack through one socket) is exempt.
    const admin = ctx.role === "gm" && ctx.userId === null;
    if (!admin && !allowAction(socket.id)) return { ok: false, error: "Too many actions. Slow down." };
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

  // This campaign's GM sockets that serve at least one book. Local sockets: one api instance, as the queue assumes.
  private bookServers(campaignId: string): Socket[] {
    const ids = this.server.sockets.adapter.rooms.get(rooms(campaignId).gm) ?? new Set<string>();
    return [...ids]
      .map((id) => this.server.sockets.sockets.get(id))
      .filter((s): s is Socket => !!(s?.data as Seat | undefined)?.books?.length);
  }

  // Which books any GM is serving right now, to everyone at the table (or to one socket that just joined).
  private announceBooks(campaignId: string, to?: Socket) {
    const sources = [...new Set(this.bookServers(campaignId).flatMap((s) => (s.data as Seat).books ?? []))];
    const r = rooms(campaignId);
    (to ?? this.server.to([r.gm, r.players])).emit("book:available", { sources } satisfies BookAvailable);
  }

  private async broadcast(campaignId: string, what: { state: boolean; codex: boolean }) {
    const r = rooms(campaignId);
    // ponytail: per-socket fan-out, fine at table scale; per-character rooms if it grows
    const players = await this.server.in(r.players).fetchSockets();
    // Each player sees their own view (private handouts, their objectives), computed once per character.
    const toPlayers = (event: string, view: (characterId: string | null) => unknown) => {
      const views = new Map<string | null, unknown>();
      for (const s of players) {
        const id = (s.data as Ctx).characterId;
        if (!views.has(id)) views.set(id, view(id));
        s.emit(event, views.get(id));
      }
    };
    if (what.state) {
      const state = await loadState(campaignId);
      if (state) {
        this.server.to(r.gm).emit("state", state);
        toPlayers("state", (id) => toPlayerView(state, id));
      }
    }
    if (what.codex) {
      const codex = await loadCodex(campaignId);
      this.server.to(r.gm).emit("codex", codex);
      toPlayers("codex", (id) => toPlayerCodex(codex, id));
    }
  }

  // Disconnects the sockets that just lost access: a removed member, the players of a revoked/deleted character, or every table screen.
  private async kick({ campaignId, kick }: { campaignId: string; kick: Kick }) {
    const r = rooms(campaignId);
    for (const s of await this.server.in([r.gm, r.players]).fetchSockets()) {
      const c = s.data as Ctx;
      const hit =
        "screens" in kick
          ? c.role === "screen"
          : "userId" in kick
            ? c.userId === kick.userId
            : c.characterId === kick.characterId && (!kick.guestsOnly || c.userId === null);
      if (hit) s.disconnect(true);
    }
  }
}
