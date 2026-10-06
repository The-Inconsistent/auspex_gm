import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { ADMIN_ACTIONS, Action } from "@wg/shared";
import { signedInUser } from "../auth/auth.service.ts";
import { campaign } from "../campaign/campaign.schema.ts";
import { db } from "../core/db.ts";
import { TableGateway } from "../table/table.gateway.ts";
import { listCampaigns, listEvents, listUsers, seatsOf } from "./admin.service.ts";

const Id = z.uuid();
const UserId = z.string().min(1).max(100);

// The admin page's reads and housekeeping (docs/backend.md, "Admin"). Every route is for a Clerk admin only; the
// rate limit is main.ts's, shared with the library.
@Controller("admin")
export class AdminController {
  constructor(@Inject(TableGateway) private readonly table: TableGateway) {}

  private async admin(req: Request) {
    const user = await signedInUser({ authorization: req.headers.authorization, cookie: req.headers.cookie });
    if (!user) throw new UnauthorizedException();
    if (!user.admin) throw new ForbiddenException("Admins only");
    return user;
  }

  @Get("users")
  async users(@Req() req: Request) {
    await this.admin(req);
    return listUsers();
  }

  // Takes the user out of every game, one member.remove each, so their sockets are kicked, the tables rebroadcast and the
  // admin log written, as if an admin had pressed it at each table.
  @Delete("users/:id/seats")
  @HttpCode(200)
  async removeSeats(@Param("id") id: string, @Req() req: Request) {
    const admin = await this.admin(req);
    const userId = UserId.safeParse(id);
    if (!userId.success) throw new BadRequestException("Not a user id");
    if (userId.data === admin.userId) throw new BadRequestException("You can't remove yourself");
    const seats = await seatsOf(userId.data);
    for (const { campaignId } of seats) {
      const ctx = { campaignId, role: "gm", characterId: null, userId: admin.userId, admin: true } as const;
      const result = await this.table.run({ ctx, action: { type: "member.remove", userId: userId.data } });
      if (!result.ok) throw new BadRequestException(result.error);
    }
    return { removed: seats.length };
  }

  @Get("campaigns")
  async campaigns(@Req() req: Request) {
    await this.admin(req);
    return listCampaigns();
  }

  // One housekeeping action at one game, acting as its GM. Refusals come back as the ActionResult, like a socket ack.
  @Post("campaigns/:id/action")
  @HttpCode(200)
  async action(@Param("id") id: string, @Req() req: Request, @Body() body: unknown) {
    const admin = await this.admin(req);
    const campaignId = Id.safeParse(id);
    if (!campaignId.success) throw new BadRequestException("Not a campaign id");
    const parsed = Action.safeParse(body);
    if (!parsed.success) throw new BadRequestException(z.prettifyError(parsed.error));
    if (!ADMIN_ACTIONS.has(parsed.data.type)) throw new BadRequestException("Not an admin action");
    const [c] = await db.select({ id: campaign.id }).from(campaign).where(eq(campaign.id, campaignId.data));
    if (!c) throw new NotFoundException("Game not found");
    const ctx = { campaignId: c.id, role: "gm", characterId: null, userId: admin.userId, admin: true } as const;
    return this.table.run({ ctx, action: parsed.data });
  }

  @Get("events")
  async events(@Req() req: Request) {
    await this.admin(req);
    return listEvents();
  }
}
