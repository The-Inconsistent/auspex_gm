import { PLAYER_ACTIONS, type Action, type ActionResult } from "@wg/shared";
import { applyAccessAction } from "../auth/access.actions.ts";
import type { Ctx } from "../auth/auth.service.ts";
import { applyCampaignAction } from "../campaign/campaign.actions.ts";
import { applyCharacterAction } from "../character/character.actions.ts";
import { applyCodexAction } from "../codex/codex.actions.ts";
import type { Tx } from "../core/db.ts";
import { fail } from "../core/errors.ts";
import { applyEncounterAction } from "../encounter/encounter.actions.ts";

// Which snapshot an action changes, so the gateway only rebroadcasts what moved.
export function touches(a: Action): { state: boolean; codex: boolean } {
  if (a.type === "codex.save" || a.type === "codex.delete" || a.type === "beat.reorder") return { state: false, codex: true };
  if (a.type === "beat.startEncounter" || a.type.startsWith("session.")) return { state: true, codex: true };
  return { state: true, codex: false };
}

// Sockets to disconnect after this action: a removed member, or whoever plays a revoked/deleted character.
export type Kick = { userId: string } | { characterId: string; guestsOnly: boolean };
export function kicks(a: Action): Kick | null {
  if (a.type === "token.revoke") return { characterId: a.characterId, guestsOnly: true }; // members keep their seat
  if (a.type === "character.delete") return { characterId: a.id, guestsOnly: false };
  if (a.type === "member.remove") return { userId: a.userId };
  return null;
}

function authorize(ctx: Ctx, a: Action) {
  if (ctx.role === "gm") return;
  if (!PLAYER_ACTIONS.has(a.type)) fail("GM only");
  if ((a.type === "character.update" || a.type === "character.adjust" || a.type === "character.supply" || a.type === "character.respite")
    && a.id !== ctx.characterId)
    fail("Not your character");
  if (a.type === "character.update" && a.overrides) fail("Overrides are GM only");
  if (a.type === "character.update" && a.annihilated !== undefined) fail("GM only");
  if (a.type === "character.adjust" && (a.traumatic !== undefined || a.raw)) fail("GM only");
  if (a.type === "pool.adjust" && a.pool !== "glory") fail("GM only");
}

export async function applyAction(tx: Tx, { ctx, action }: { ctx: Ctx; action: Action }): Promise<ActionResult> {
  authorize(ctx, action);
  switch (action.type) {
    case "campaign.update":
    case "pool.adjust":
    case "session.start":
    case "session.end":
      return applyCampaignAction(tx, { ctx, action });

    case "character.create":
    case "character.update":
    case "character.adjust":
    case "character.supply":
    case "character.requisition":
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
      return applyCodexAction(tx, { ctx, action });

    case "invite.create":
    case "invite.revoke":
    case "member.remove":
      return applyAccessAction(tx, { ctx, action });
  }
}
