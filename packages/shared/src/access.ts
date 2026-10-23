import { z } from "zod";
import { LibraryCharacter } from "./library.ts";
import { CampaignName, CampaignSetup, Character, InviteMode, Role, Tier } from "./state.ts";

// REST shapes for signed-in (Clerk) users outside a table: the lobby, creating a game, and invite links.

export const LobbyGame = z.object({
  id: z.string(),
  name: z.string(),
  tier: Tier,
  gm: z.string(),
  players: z.number().int(),
  session: z.number().int().nullable(), // number of the session in progress; null when none is running
  role: Role.nullable(), // the caller's role there; null when they aren't a member
  nextSessionAt: z.string().nullable(), // ISO; members' cards only (issue #197 decision 4), null for anyone else
});
export type LobbyGame = z.infer<typeof LobbyGame>;

// Anyone signed in sees every running game as a card; only members can open one. `characters` is their own library
// (issue #14), which belongs to no game. `archived` is the caller's own archived games, kept out of `mine` and `running`.
export const Lobby = z.object({
  canCreate: z.boolean(),
  admin: z.boolean(), // shows the ADMIN link
  mine: z.array(LobbyGame),
  running: z.array(LobbyGame),
  archived: z.array(LobbyGame),
  characters: z.array(LibraryCharacter),
});
export type Lobby = z.infer<typeof Lobby>;

// NEW CAMPAIGN sends what its first four steps asked in one go, so leaving half-way stores nothing. Name and Tier only
// are required: every other step may be skipped.
export const CreateGame = z.object({ name: CampaignName, tier: Tier, ...CampaignSetup.partial().shape });

// What /invite/<code> shows before accepting.
export const InvitePreview = z.object({
  campaignId: z.string(),
  campaignName: z.string(),
  tier: Tier,
  mode: InviteMode,
  // Read-only sheets, so a player can choose before taking a seat: objectives blanked; Ability and Talent text kept for
  // a signed-in visitor (who can read it in /api/creation already) and stripped for a guest (book prose needs an
  // account, CLAUDE.md; the page cites stay).
  character: Character.nullable(), // the invited character (mode "character")
  openCharacters: z.array(Character), // unclaimed characters to pick from (mode "room")
  allowGuests: z.boolean(),
  signedIn: z.boolean(),
  member: z.boolean(),
});
export type InvitePreview = z.infer<typeof InvitePreview>;

// Accept: claim an open character, or start a new one by name (room invites); asGuest joins without an account.
export const AcceptInvite = z.object({
  characterId: z.uuid().optional(),
  newCharacterName: z.string().trim().min(1).max(100).optional(),
  asGuest: z.boolean().default(false),
});
export type AcceptInvite = z.input<typeof AcceptInvite>;
