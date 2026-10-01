import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { z } from "zod";
import { LibrarySave, NewLibraryCharacter } from "@wg/shared";
import { signedInUser } from "../auth/auth.service.ts";
import { listRules } from "../campaign/campaign.service.ts";
import { creationPayload } from "../character/creation.service.ts";
import { ActionError } from "../core/errors.ts";
import { sendCached } from "../core/http.ts";
import {
  createLibraryCharacter,
  deleteLibraryCharacter,
  listLibrary,
  readLibrary,
  saveLibraryCharacter,
} from "./library.service.ts";

const CharacterId = z.uuid();

const parse = <T>(schema: z.ZodType<T>, body: unknown): T => {
  const r = schema.safeParse(body);
  if (!r.success) throw new BadRequestException(z.prettifyError(r.error));
  return r.data;
};

// Refusals from the service become 400s with their message, as the builder shows them.
async function refusing<T>(fn: () => Promise<T>): Promise<T> {
  try {
    const result = await fn();
    return result;
  } catch (e) {
    if (e instanceof ActionError) throw new BadRequestException(e.message);
    throw e;
  }
}

// A character library for signed-in users, and the book content the builder needs outside a campaign (issue #14).
//
// Book text without a seat: an account is the gate, and sign-up is invite only (CLAUDE.md, Copyright).
// ponytail: invite-only Clerk is the gate, add a role check if sign-up opens
//
// This is the documented exception to "one mutation path" (docs/backend.md): a library character is nobody's live state,
// so there is no campaign room to broadcast to and no action to queue.
@Controller()
export class LibraryController {
  private async caller(req: Request) {
    const user = await signedInUser({ authorization: req.headers.authorization, cookie: req.headers.cookie });
    if (!user) throw new UnauthorizedException();
    return user;
  }

  // The creation catalogue outside a campaign: the caller picks the books, because no campaign decides for them.
  @Get("creation")
  async creation(@Query("homebrew") homebrew: string | undefined, @Req() req: Request, @Res() res: Response) {
    await this.caller(req);
    sendCached({ req, res, payload: creationPayload(homebrew === "1" || homebrew === "true") });
  }

  // Rules reference, for the builder's rule links outside a campaign.
  @Get("rules")
  async rules(@Req() req: Request) {
    await this.caller(req);
    return listRules({ gm: false });
  }

  @Get("library")
  async list(@Req() req: Request) {
    const user = await this.caller(req);
    return listLibrary(user.userId);
  }

  @Post("library")
  async create(@Req() req: Request, @Body() body: unknown) {
    const user = await this.caller(req);
    return refusing(() =>
      createLibraryCharacter({ userId: user.userId, body: parse(NewLibraryCharacter, body ?? {}) }),
    );
  }

  @Get("library/:id")
  async read(@Param("id") id: string, @Req() req: Request) {
    const user = await this.caller(req);
    const entry = await readLibrary({ userId: user.userId, id: parse(CharacterId, id) });
    if (!entry) throw new NotFoundException("Character not found");
    return entry;
  }

  @Put("library/:id")
  async save(@Param("id") id: string, @Req() req: Request, @Body() body: unknown) {
    const user = await this.caller(req);
    const saved = await refusing(() =>
      saveLibraryCharacter({ userId: user.userId, id: parse(CharacterId, id), body: parse(LibrarySave, body) }),
    );
    if (!saved) throw new NotFoundException("Character not found");
    return saved;
  }

  @Delete("library/:id")
  @HttpCode(200)
  async remove(@Param("id") id: string, @Req() req: Request) {
    const user = await this.caller(req);
    const gone = await deleteLibraryCharacter({ userId: user.userId, id: parse(CharacterId, id) });
    if (!gone) throw new NotFoundException("Character not found");
    return gone;
  }
}
