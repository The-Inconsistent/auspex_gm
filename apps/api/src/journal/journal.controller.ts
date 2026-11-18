import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";
import { resolveCtx } from "../auth/auth.service.ts";
import { db } from "../core/db.ts";
import { ActionError } from "../core/errors.ts";
import { sessionRecapDraft } from "./journal.service.ts";

const Id = z.uuid();

const parse = <T>(schema: z.ZodType<T>, body: unknown): T => {
  const r = schema.safeParse(body);
  if (!r.success) throw new BadRequestException(z.prettifyError(r.error));
  return r.data;
};

const headersOf = (req: Request) => ({ authorization: req.headers.authorization, cookie: req.headers.cookie });

// The GM's action journal: the recap draft is the only read left over REST (a button press that fills a form). The
// history list is pushed over the socket (`journal`, table.gateway.ts) and undo is the `journal.undo` action. GM only:
// it lists every change at the table, hidden ones included. Players never see it.
@Controller()
export class JournalController {
  private async gm(id: string, req: Request) {
    const ctx = await resolveCtx({ campaignId: parse(Id, id), headers: headersOf(req) });
    if (!ctx) throw new UnauthorizedException();
    if (ctx.role !== "gm") throw new ForbiddenException();
    return ctx;
  }

  // A draft of the session's recap from what the journal saw, for the SESSION END form to edit.
  @Get("campaigns/:id/sessions/:sessionId/recap-draft")
  async recapDraft(@Param("id") id: string, @Param("sessionId") sessionId: string, @Req() req: Request) {
    const ctx = await this.gm(id, req);
    try {
      return await sessionRecapDraft(db, { campaignId: ctx.campaignId, sessionId: parse(Id, sessionId) });
    } catch (e) {
      if (e instanceof ActionError) throw new NotFoundException(e.message);
      throw e;
    }
  }
}
