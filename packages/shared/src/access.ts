import { z } from "zod";
import { InviteMode, Role, Tier } from "./state.ts";

// REST shapes for signed-in (Clerk) users outside a table: the lobby, creating a game, and invite links.

export const LobbyGame = z.object({
  id: z.string(),
  name: z.string(),
  tier: Tier,
  gm: z.string(),
  players: z.number().int(),
  session: z.number().int().nullable(), // number of the session in progress; null when none is running
  role: Role.nullable(), // the caller's role there; null when they aren't a member
});
export type LobbyGame = z.infer<typeof LobbyGame>;

// Anyone signed in sees every running game as a card; only members can open one.
export const Lobby = z.object({ canCreate: z.boolean(), mine: z.array(LobbyGame), running: z.array(LobbyGame) });
export type Lobby = z.infer<typeof Lobby>;

export const CreateGame = z.object({ name: z.string().min(1).max(100), tier: Tier });

const CharacterRef = z.object({ id: z.string(), name: z.string() });

// What /invite/<code> shows before accepting.
export const InvitePreview = z.object({
  campaignId: z.string(),
  campaignName: z.string(),
  mode: InviteMode,
  character: CharacterRef.nullable(), // the invited character (mode "character")
  openCharacters: z.array(CharacterRef.extend({ portrait: z.string() })), // unclaimed characters to pick from (mode "room")
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
