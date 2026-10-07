import { eq } from "drizzle-orm";
import { ADMIN_ACTIONS, PLAYER_ACTIONS, type Action, type ActionResult } from "@wg/shared";
import { adminEvent } from "../admin/admin.schema.ts";
import { applyAccessAction } from "../auth/access.actions.ts";
import type { Ctx } from "../auth/auth.service.ts";
import { applyCampaignAction } from "../campaign/campaign.actions.ts";
import { campaign } from "../campaign/campaign.schema.ts";
import { applyCharacterAction } from "../character/character.actions.ts";
import { applyCodexAction } from "../codex/codex.actions.ts";
import type { Tx } from "../core/db.ts";
import { fail } from "../core/errors.ts";
import { applyEncounterAction } from "../encounter/encounter.actions.ts";
import { applySpendAction } from "../spend/spend.actions.ts";
import { applyThreatAction } from "../threat/threat.actions.ts";

// Which snapshot an action changes, so the gateway only rebroadcasts what moved.
export function touches(a: Action): { state: boolean; codex: boolean } {
  // A deleted game has nothing left to broadcast; the gateway kicks the room instead (kicks).
  if (a.type === "campaign.delete") return { state: false, codex: false };
  // Archiving ends a running session, so the session list changes too.
  if (a.type === "campaign.archive") return { state: true, codex: true };
  // A table screen token is no part of either snapshot (players never see access).
  if (a.type === "screen.issue" || a.type === "screen.revoke") return { state: false, codex: false };
  // A custom threat rides the codex snapshot (issue #43), so saving or deleting one only changes that.
  if (
    a.type === "codex.save" ||
    a.type === "codex.delete" ||
    a.type === "beat.reorder" ||
    a.type === "codex.addPlaces" ||
    a.type === "codex.addHulk" ||
    a.type === "threat.save" ||
    a.type === "threat.delete" ||
    a.type === "codex.addLoot" ||
    a.type === "codex.addRelic"
  )
    return { state: false, codex: true };
  // character.delete drops the Agent from handout audiences (character.actions) and leaves their items loose; giving and
  // taking an item change the sheet and the item.
  if (
    a.type === "beat.startEncounter" ||
    a.type === "character.delete" ||
    a.type === "character.giveItem" ||
    a.type === "character.takeItem" ||
    a.type.startsWith("session.")
  )
    return { state: true, codex: true };
  return { state: true, codex: false };
}

// Sockets to disconnect after this action: a removed member, or whoever plays a revoked/deleted character.
export type Kick =
  { userId: string } | { characterId: string; guestsOnly: boolean } | { screens: true } | { all: true };
export function kicks(a: Action): Kick | null {
  if (a.type === "token.revoke") return { characterId: a.characterId, guestsOnly: true }; // members keep their seat
  if (a.type === "screen.revoke") return { screens: true };
  if (a.type === "character.delete") return { characterId: a.id, guestsOnly: false };
  if (a.type === "member.remove") return { userId: a.userId };
  if (a.type === "campaign.delete") return { all: true };
  return null;
}

function authorize(ctx: Ctx, a: Action) {
  if (a.type === "member.seat" && !ctx.admin) fail("Admin only");
  if (ctx.role === "gm") return;
  if (ctx.role === "screen") fail("The table screen is read-only");
  if (!PLAYER_ACTIONS.has(a.type)) fail("GM only");
  if (
    (a.type === "character.update" ||
      a.type === "character.build" ||
      a.type === "character.draft" ||
      a.type === "character.supply" ||
      a.type === "character.fitUpgrade" ||
      a.type === "character.removeUpgrade") &&
    a.id !== ctx.characterId
  )
    fail("Not your character");
  if (a.type === "spend.request" && a.characterId !== ctx.characterId) fail("Not your character");
  if (a.type === "character.update" && a.overrides) fail("Overrides are GM only");
  if (a.type === "character.build" && a.keepSheet) fail("GM only");
  if (a.type === "character.update" && a.annihilated !== undefined) fail("GM only");
  // A player's sheet changes through the builder; raw stats would also carry Wealth and Ammo past the check below.
  if (a.type === "character.update" && a.stats) fail("Stats are GM only");
  if (a.type === "character.update" && a.conditions) fail("Conditions are the GM's");
  // Players spend their own Wealth and Ammo; only the GM grants them (p.206; Ammo, rules-flow §11.57).
  if (a.type === "character.supply" && ((a.wealth ?? 0) > 0 || (a.ammo?.delta ?? 0) > 0))
    fail("Only the GM grants Wealth and Ammo");
}

// What still works at an archived game: the way out of it, and taking access away (a player leaving, a guest token,
// invite or table screen revoked). An admin may also remove a seat (REMOVE FROM ALL GAMES reaches archived games too).
const ARCHIVED_OPEN: ReadonlySet<Action["type"]> = new Set([
  "campaign.unarchive",
  "campaign.delete",
  "seat.leave",
  "token.revoke",
  "invite.revoke",
  "screen.revoke",
]);

export async function applyAction(tx: Tx, { ctx, action }: { ctx: Ctx; action: Action }): Promise<ActionResult> {
  authorize(ctx, action);
  // The game's name goes to the admin log below (copied, since campaign.delete removes the row), and an archived game
  // is read-only except for the way out of it.
  const [c] = await tx
    .select({ name: campaign.name, archivedAt: campaign.archivedAt })
    .from(campaign)
    .where(eq(campaign.id, ctx.campaignId));
  if (c?.archivedAt && !ARCHIVED_OPEN.has(action.type) && !(ctx.admin && action.type === "member.remove"))
    fail("This game is archived");
  const result = await dispatch(tx, { ctx, action });
  // Only the housekeeping is logged: an admin running a table would otherwise bury it under every Wounds tap.
  if (ctx.admin && ctx.userId && result.ok && ADMIN_ACTIONS.has(action.type))
    await tx.insert(adminEvent).values({
      actorUserId: ctx.userId,
      action: action.type,
      campaignId: ctx.campaignId,
      campaignName: c?.name ?? null,
      targetUserId: "userId" in action ? action.userId : null,
    });
  return result;
}

function dispatch(tx: Tx, { ctx, action }: { ctx: Ctx; action: Action }): Promise<ActionResult> {
  switch (action.type) {
    case "campaign.update":
    case "campaign.ascend":
    case "pool.adjust":
    case "session.start":
    case "session.end":
    case "session.abandon":
    case "session.delete":
    case "campaign.archive":
    case "campaign.unarchive":
    case "campaign.delete":
      return applyCampaignAction(tx, { ctx, action });

    case "spend.request":
    case "spend.cancel":
    case "spend.resolve":
      return applySpendAction(tx, { ctx, action });

    case "character.create":
    case "character.update":
    case "character.build":
    case "character.draft":
    case "character.adjust":
    case "character.supply":
    case "character.requisition":
    case "character.fitUpgrade":
    case "character.removeUpgrade":
    case "character.giveItem":
    case "character.takeItem":
    case "character.objectives":
    case "character.respite":
    case "character.delete":
    case "token.issue":
    case "token.revoke":
      return applyCharacterAction(tx, { ctx, action });

    case "encounter.start":
    case "encounter.end":
    case "encounter.newRound":
    case "turn.start":
    case "turn.seize":
    case "turn.end":
    case "combatant.addThreat":
    case "combatant.addCharacter":
    case "combatant.update":
    case "combatant.adjust":
    case "combatant.aware":
    case "combatant.remove":
    case "beat.startEncounter":
      return applyEncounterAction(tx, { ctx, action });

    case "codex.save":
    case "codex.delete":
    case "beat.reorder":
    case "codex.addPlaces":
    case "codex.addHulk":
    case "codex.addLoot":
    case "codex.addRelic":
      return applyCodexAction(tx, { ctx, action });

    case "threat.save":
    case "threat.delete":
      return applyThreatAction(tx, { ctx, action });

    case "invite.create":
    case "invite.revoke":
    case "member.remove":
    case "member.seat":
    case "seat.leave":
    case "screen.issue":
    case "screen.revoke":
      return applyAccessAction(tx, { ctx, action });
  }
}
