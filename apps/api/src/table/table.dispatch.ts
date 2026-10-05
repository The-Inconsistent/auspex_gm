import { PLAYER_ACTIONS, type Action, type ActionResult } from "@wg/shared";
import { applyAccessAction } from "../auth/access.actions.ts";
import type { Ctx } from "../auth/auth.service.ts";
import { applyCampaignAction } from "../campaign/campaign.actions.ts";
import { applyCharacterAction } from "../character/character.actions.ts";
import { applyCodexAction } from "../codex/codex.actions.ts";
import type { Tx } from "../core/db.ts";
import { fail } from "../core/errors.ts";
import { applyEncounterAction } from "../encounter/encounter.actions.ts";
import { applyThreatAction } from "../threat/threat.actions.ts";

// Which snapshot an action changes, so the gateway only rebroadcasts what moved.
export function touches(a: Action): { state: boolean; codex: boolean } {
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
export type Kick = { userId: string } | { characterId: string; guestsOnly: boolean } | { screens: true };
export function kicks(a: Action): Kick | null {
  if (a.type === "token.revoke") return { characterId: a.characterId, guestsOnly: true }; // members keep their seat
  if (a.type === "screen.revoke") return { screens: true };
  if (a.type === "character.delete") return { characterId: a.id, guestsOnly: false };
  if (a.type === "member.remove") return { userId: a.userId };
  return null;
}

function authorize(ctx: Ctx, a: Action) {
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

export async function applyAction(tx: Tx, { ctx, action }: { ctx: Ctx; action: Action }): Promise<ActionResult> {
  authorize(ctx, action);
  switch (action.type) {
    case "campaign.update":
    case "campaign.ascend":
    case "pool.adjust":
    case "session.start":
    case "session.end":
      return applyCampaignAction(tx, { ctx, action });

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
    case "seat.leave":
    case "screen.issue":
    case "screen.revoke":
      return applyAccessAction(tx, { ctx, action });
  }
}
