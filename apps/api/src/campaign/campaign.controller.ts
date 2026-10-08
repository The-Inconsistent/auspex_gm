import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { z } from "zod";
import { places } from "@wg/data";
import { CampaignExport, CreateGame, freshStart, placeSummary, toPlayerCodex, type Codex } from "@wg/shared";
import { COOKIE, readCookie, resolveCtx, resolveGuest, signedInUser } from "../auth/auth.service.ts";
import { acceptInvite, previewInvite } from "../auth/invite.service.ts";
import { db } from "../core/db.ts";
import { ActionError } from "../core/errors.ts";
import { sendCached } from "../core/http.ts";
import {
  creationPayload,
  factionPresets,
  flavourTables,
  frameworkCatalogue,
  npcPresets,
} from "../character/creation.service.ts";
import { getImage, putImage } from "../codex/image.store.ts";
import { TableGateway } from "../table/table.gateway.ts";
import { loadCodex } from "../table/table.state.ts";
import {
  campaignHomebrew,
  createCampaign,
  exportCampaign,
  importCampaign,
  isAdmin,
  listRules,
  listScenePresets,
  listThreats,
  listWargear,
  lobby,
} from "./campaign.service.ts";

const Join = z.object({ token: z.string().min(1).max(200) });
// Scripts (admin key) name the Clerk user who will GM the new campaign.
const AdminCreate = CreateGame.extend({ ownerUserId: z.string().min(1).max(100).optional() });
const CampaignId = z.uuid();
const InviteCode = z.string().min(1).max(200);
const Import = z.object({ file: CampaignExport, fresh: z.boolean().default(false) });

const parse = <T>(schema: z.ZodType<T>, body: unknown): T => {
  const r = schema.safeParse(body);
  if (!r.success) throw new BadRequestException(z.prettifyError(r.error));
  return r.data;
};

// Client-facing refusals from the services become 400s with their message.
async function refusing<T>(fn: () => Promise<T>): Promise<T> {
  try {
    const result = await fn();
    return result;
  } catch (e) {
    if (e instanceof ActionError) throw new BadRequestException(e.message);
    throw e;
  }
}

const headersOf = (req: Request) => ({ authorization: req.headers.authorization, cookie: req.headers.cookie });

// A year-long httpOnly cookie holding a guest's player token.
function setGuestCookie(res: Response, token: string) {
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "true",
    maxAge: 365 * 24 * 3600 * 1000,
    path: "/",
  });
}

const PLACES = [...places.values()].map(placeSummary); // in file order, parents first

@Controller()
export class CampaignController {
  constructor(@Inject(TableGateway) private readonly table: TableGateway) {}

  // Creators (Clerk `publicMetadata.role = "creator"`) start games in the lobby; scripts use the admin key.
  @Post("campaigns")
  async create(@Headers("x-admin-key") key: string | undefined, @Req() req: Request, @Body() body: unknown) {
    if (isAdmin(key)) {
      const { ownerUserId, ...game } = parse(AdminCreate, body);
      return createCampaign({ ...game, owner: ownerUserId ? { userId: ownerUserId, name: "GM" } : null });
    }
    const user = await signedInUser(headersOf(req));
    if (!user) throw new UnauthorizedException();
    if (!user.creator) throw new ForbiddenException("Only creators can start a game");
    return createCampaign({ ...parse(CreateGame, body), owner: user });
  }

  // NEW CAMPAIGN's PREMISE step: the printed Frameworks before there's a campaign to ask, so a creator's only. The
  // official books, as SETUP's picker gives a campaign without homebrew.
  @Get("frameworks")
  async newFrameworks(@Req() req: Request) {
    const user = await signedInUser(headersOf(req));
    if (!user) throw new UnauthorizedException();
    if (!user.creator) throw new ForbiddenException("Only creators can start a game");
    return frameworkCatalogue(false);
  }

  // IMPORT GAME: a campaign file as a new campaign, the importer as GM. `fresh` resets play for a new group.
  @Post("campaigns/import")
  async import(@Req() req: Request, @Body() body: unknown) {
    const user = await signedInUser(headersOf(req));
    if (!user) throw new UnauthorizedException();
    if (!user.creator) throw new ForbiddenException("Only creators can start a game");
    const { file, fresh } = parse(Import, body);
    return refusing(() => importCampaign({ file: fresh ? freshStart(file) : file, owner: user }));
  }

  // EXPORT: the whole campaign as a file (GM notes, secrets and book text in the sheets, so GM only).
  @Get("campaigns/:id/export")
  async export(@Param("id") id: string, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const ctx = await resolveCtx({ campaignId: parse(CampaignId, id), headers: headersOf(req) });
    if (!ctx) throw new UnauthorizedException();
    if (ctx.role !== "gm") throw new ForbiddenException();
    // EXPORT WITHOUT PICTURES (?pictures=0): a small file, for a campaign whose pictures outgrow IMPORT GAME (issue #199).
    const file = await exportCampaign(ctx.campaignId, { pictures: req.query.pictures !== "0" });
    const slug =
      file.campaign.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "campaign";
    res.setHeader("content-disposition", `attachment; filename="${slug}.auspex.json"`);
    return file;
  }

  // A picture for an NPC, place or handout (issue #199): raw WebP or JPEG bytes the GM's browser already shrank
  // (main.ts mounts the 1 MB raw parser). Only the id comes back; `codex.save` then puts it on the entry.
  @Post("campaigns/:id/images")
  @HttpCode(200)
  async uploadImage(@Param("id") id: string, @Req() req: Request) {
    const ctx = await resolveCtx({ campaignId: parse(CampaignId, id), headers: headersOf(req) });
    if (!ctx) throw new UnauthorizedException();
    if (ctx.role !== "gm") throw new ForbiddenException();
    if (!Buffer.isBuffer(req.body)) throw new BadRequestException("Send a WebP or JPEG picture");
    const bytes = req.body;
    const mime = (req.headers["content-type"] ?? "").split(";", 1)[0]?.trim().toLowerCase() ?? ""; // no parameters
    return refusing(async () => ({
      id: await db.transaction((tx) => putImage(tx, { campaignId: ctx.campaignId, mime, bytes })),
    }));
  }

  // A picture reaches a seat that may see an entry showing it: the GM any of the campaign's, a player only one their
  // phone's codex carries (`toPlayerCodex` drops hidden entries and held-back pictures). Anything else is a 404, so an
  // id gives nothing away. The TV shows no codex.
  @Get("campaigns/:id/images/:imageId")
  async image(@Param("id") id: string, @Param("imageId") imageId: string, @Req() req: Request, @Res() res: Response) {
    const ctx = await resolveCtx({ campaignId: parse(CampaignId, id), headers: headersOf(req) });
    if (!ctx) throw new UnauthorizedException();
    const want = parse(CampaignId, imageId);
    const shown = (c: Codex) => [...c.npcs, ...c.locations, ...c.handouts].some((e) => e.imageId === want);
    const may =
      ctx.role === "gm" ||
      (ctx.role === "player" && shown(toPlayerCodex(await loadCodex(ctx.campaignId), ctx.characterId)));
    const row = may ? await getImage(db, ctx.campaignId, want) : null;
    if (!row) throw new NotFoundException();
    // Ids are never reused, so a phone keeps the picture; `private` keeps it out of shared caches.
    res.setHeader("content-type", row.mime);
    res.setHeader("cache-control", "private, max-age=31536000, immutable");
    res.setHeader("x-content-type-options", "nosniff"); // a tapped thumbnail opens it as a page of its own
    res.send(row.bytes);
  }

  @Get("lobby")
  async lobby(@Req() req: Request) {
    const user = await signedInUser(headersOf(req));
    if (!user) throw new UnauthorizedException();
    return lobby(user);
  }

  // Who the caller is at this table: a member (Clerk) or a guest (QR cookie).
  @Get("campaigns/:id/me")
  async me(@Param("id") id: string, @Req() req: Request) {
    const ctx = await resolveCtx({ campaignId: parse(CampaignId, id), headers: headersOf(req) });
    if (!ctx) throw new UnauthorizedException();
    return ctx;
  }

  // Bestiary for the GM's "add threat" picker. Players only ever see stats the GM reveals.
  @Get("campaigns/:id/threats")
  async threats(@Param("id") id: string, @Req() req: Request) {
    const ctx = await resolveCtx({ campaignId: parse(CampaignId, id), headers: headersOf(req) });
    if (!ctx) throw new UnauthorizedException();
    if (ctx.role !== "gm") throw new ForbiddenException();
    return listThreats();
  }

  // Wargear catalogue for the GM's requisition form (book text, so GM only like the bestiary).
  @Get("campaigns/:id/wargear")
  async wargear(@Param("id") id: string, @Req() req: Request) {
    const ctx = await resolveCtx({ campaignId: parse(CampaignId, id), headers: headersOf(req) });
    if (!ctx) throw new UnauthorizedException();
    if (ctx.role !== "gm") throw new ForbiddenException();
    return listWargear();
  }

  // Book data for building scenes (issue #39): the sample DNs per Skill. Book text, so GM only like the bestiary.
  @Get("campaigns/:id/scene-presets")
  async scenePresets(@Param("id") id: string, @Req() req: Request) {
    const ctx = await resolveCtx({ campaignId: parse(CampaignId, id), headers: headersOf(req) });
    if (!ctx) throw new UnauthorizedException();
    if (ctx.role !== "gm") throw new ForbiddenException();
    return listScenePresets();
  }

  // The printed patrons and Frameworks for SETUP's picker (issue #45). Book text, so GM only like the bestiary; the
  // picker fills in names only, so the MISSION players see carries no printed prose (rules-flow §11.80).
  @Get("campaigns/:id/frameworks")
  async frameworks(@Param("id") id: string, @Req() req: Request) {
    const campaignId = parse(CampaignId, id);
    const ctx = await resolveCtx({ campaignId, headers: headersOf(req) });
    if (!ctx) throw new UnauthorizedException();
    if (ctx.role !== "gm") throw new ForbiddenException();
    return frameworkCatalogue(await campaignHomebrew(campaignId));
  }

  // Book data for CODEX › FACTIONS (issue #46): the Keywords the picker suggests, with their glossary text. Book text,
  // so GM only like the bestiary; factions never reach a phone.
  @Get("campaigns/:id/faction-presets")
  async factionPresets(@Param("id") id: string, @Req() req: Request) {
    const campaignId = parse(CampaignId, id);
    const ctx = await resolveCtx({ campaignId, headers: headersOf(req) });
    if (!ctx) throw new UnauthorizedException();
    if (ctx.role !== "gm") throw new ForbiddenException();
    return factionPresets(await campaignHomebrew(campaignId));
  }

  // Book data for CODEX › NPCS (issue #47): printed NPCs to start one from. Book text, so GM only like the bestiary;
  // ADD FROM BOOK fills only a name and a role label into what players see.
  @Get("campaigns/:id/npc-presets")
  async npcPresets(@Param("id") id: string, @Req() req: Request) {
    const campaignId = parse(CampaignId, id);
    const ctx = await resolveCtx({ campaignId, headers: headersOf(req) });
    if (!ctx) throw new UnauthorizedException();
    if (ctx.role !== "gm") throw new ForbiddenException();
    return npcPresets(await campaignHomebrew(campaignId));
  }

  // The books' places for CODEX › LOCATIONS' ADD FROM BOOK (issue #50): names, pages and nesting only. GM only, like
  // every preset; the printed text stays here until codex.addPlaces copies a place into the campaign.
  @Get("campaigns/:id/places")
  async places(@Param("id") id: string, @Req() req: Request) {
    const campaignId = parse(CampaignId, id);
    const ctx = await resolveCtx({ campaignId, headers: headersOf(req) });
    if (!ctx) throw new UnauthorizedException();
    if (ctx.role !== "gm") throw new ForbiddenException();
    return PLACES;
  }

  // Book tables for CODEX › NPCS' ROLL NAME and ROLL LOOK (issue #48). Book text, so GM only like the bestiary; only
  // the words the GM keeps in NAME and DESCRIPTION reach a phone.
  @Get("campaigns/:id/flavour")
  async flavour(@Param("id") id: string, @Req() req: Request) {
    const campaignId = parse(CampaignId, id);
    const ctx = await resolveCtx({ campaignId, headers: headersOf(req) });
    if (!ctx) throw new UnauthorizedException();
    if (ctx.role !== "gm") throw new ForbiddenException();
    return flavourTables(await campaignHomebrew(campaignId));
  }

  // Rules reference (book text) for any seat at this table, GM or player (not the table screen).
  @Get("campaigns/:id/rules")
  async rules(@Param("id") id: string, @Req() req: Request) {
    const ctx = await resolveCtx({ campaignId: parse(CampaignId, id), headers: headersOf(req) });
    if (!ctx) throw new UnauthorizedException();
    if (ctx.role === "screen") throw new ForbiddenException(); // the TV shows no book text
    return listRules({ gm: ctx.role === "gm" });
  }

  // The character-creation catalogue (book text) for any seat, filtered to the books the campaign allows (issue #9).
  // Gzipped once at first use; the ETag lets a phone revalidate instead of downloading about 2 MB again.
  @Get("campaigns/:id/creation")
  async creation(@Param("id") id: string, @Req() req: Request, @Res() res: Response) {
    const campaignId = parse(CampaignId, id);
    const ctx = await resolveCtx({ campaignId, headers: headersOf(req) });
    if (!ctx) throw new UnauthorizedException();
    if (ctx.role === "screen") throw new ForbiddenException(); // the TV shows no book text
    sendCached({ req, res, payload: creationPayload(await campaignHomebrew(campaignId)) });
  }

  // Guest QR (/join/<token>): the token moves into an httpOnly cookie. Returns the table to open.
  @Post("join")
  @HttpCode(200)
  async join(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const { token } = parse(Join, body);
    const ctx = await resolveGuest(token);
    if (!ctx) throw new UnauthorizedException("Invalid or revoked link");
    setGuestCookie(res, token);
    return ctx;
  }

  // The guest cookie's table, so a returning guest lands back at it.
  @Get("guest")
  async guest(@Req() req: Request) {
    const ctx = await resolveGuest(readCookie(req.headers.cookie));
    if (!ctx) throw new UnauthorizedException();
    return ctx;
  }

  @Get("invites/:code")
  async invite(@Param("code") code: string, @Req() req: Request) {
    const user = await signedInUser(headersOf(req));
    return refusing(() => previewInvite({ code: parse(InviteCode, code), user }));
  }

  // Accepting changes who's at the table, so it runs in that table's action queue and rebroadcasts like an action.
  @Post("invites/:code/accept")
  @HttpCode(200)
  async accept(
    @Param("code") code: string,
    @Req() req: Request,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = await signedInUser(headersOf(req));
    const c = parse(InviteCode, code);
    const preview = await refusing(() => previewInvite({ code: c, user }));
    const result = await refusing(() =>
      this.table.mutate({
        campaignId: preview.campaignId,
        fn: () => db.transaction((tx) => acceptInvite(tx, { code: c, user, body })),
      }),
    );
    if (result.guestToken) setGuestCookie(res, result.guestToken);
    return { campaignId: result.campaignId };
  }
}
