import { BadRequestException, Body, Controller, ForbiddenException, Get, Headers, HttpCode, Post, Req, Res, UnauthorizedException } from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import { z } from "zod";
import { Tier } from "@wg/shared";
import { threats } from "@wg/data";
import { COOKIE, issueToken, readCookie, resolveToken } from "./auth.ts";
import { db } from "./db.ts";
import { campaign } from "./schema.ts";

const CreateCampaign = z.object({ name: z.string().min(1).max(100), tier: Tier });
const Join = z.object({ token: z.string().min(1).max(200) });

const parse = <T>(schema: z.ZodType<T>, body: unknown): T => {
  const r = schema.safeParse(body);
  if (!r.success) throw new BadRequestException(z.prettifyError(r.error));
  return r.data;
};

const isAdmin = (key: string | undefined) => {
  const expected = process.env.ADMIN_KEY;
  if (!expected || !key) return false;
  const a = Buffer.from(key), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};

@Controller()
export class CampaignController {
  // Only the server owner can create campaigns; everything after that is token-scoped.
  @Post("campaigns")
  async create(@Headers("x-admin-key") key: string | undefined, @Body() body: unknown) {
    if (!isAdmin(key)) throw new UnauthorizedException();
    const { name, tier } = parse(CreateCampaign, body);
    return db.transaction(async (tx) => {
      const [c] = await tx.insert(campaign).values({ name, tier }).returning({ id: campaign.id });
      return { campaignId: c!.id, gmToken: await issueToken(tx, c!.id, "gm") };
    });
  }

  // The /join/<token> page (GM link or player QR) posts here; the token moves into an httpOnly cookie.
  @Post("join")
  @HttpCode(200)
  async join(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const { token } = parse(Join, body);
    const ctx = await resolveToken(token);
    if (!ctx) throw new UnauthorizedException("Invalid or revoked link");
    res.cookie(COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.COOKIE_SECURE === "true",
      maxAge: 365 * 24 * 3600 * 1000,
      path: "/",
    });
    return ctx;
  }

  @Get("me")
  async me(@Req() req: Request) {
    const ctx = await resolveToken(readCookie(req.headers.cookie));
    if (!ctx) throw new UnauthorizedException();
    return ctx;
  }

  // Bestiary for the GM's "add threat" picker. Players only ever see stats the GM reveals.
  @Get("threats")
  async threats(@Req() req: Request) {
    const ctx = await resolveToken(readCookie(req.headers.cookie));
    if (!ctx) throw new UnauthorizedException();
    if (ctx.role !== "gm") throw new ForbiddenException();
    return [...threats.values()];
  }
}
