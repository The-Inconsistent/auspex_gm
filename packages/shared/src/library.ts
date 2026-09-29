import { z } from "zod";
import { MAX_DRAFT_CHARS } from "./actions.ts";
import { CharacterBuild } from "./build.ts";
import { CharacterDetail, Tier } from "./state.ts";

// REST shapes for a signed-in user's personal character library (issue #14): characters built outside any campaign,
// then copied into a campaign from its builder.

// How many characters one account keeps, so a single user can't fill the database.
export const LIBRARY_CAP = 20;

// A library character as the lobby and the library page list them.
export const LibraryCharacter = z.object({
  id: z.string(),
  name: z.string(),
  tier: Tier.nullable(), // the draft's or build's Tier; null before the builder has one
  archetype: z.string().nullable(), // the archetype's name off the resolved sheet, for the card
  homebrew: z.boolean(), // whether this character's catalogue includes the homebrew books
  done: z.boolean(), // a finished build, ready to bring into a campaign
  updatedAt: z.string(),
});
export type LibraryCharacter = z.infer<typeof LibraryCharacter>;

// The library page reads the draft back to carry on building on another device.
export const LibraryEntry = LibraryCharacter.extend({
  build: CharacterBuild.nullable(),
  draft: z.record(z.string(), z.unknown()).nullable(),
  detail: CharacterDetail.partial(),
});
export type LibraryEntry = z.infer<typeof LibraryEntry>;

// PUT /api/library/:id. Every field is optional: the builder autosaves a draft, and saves a build at the end.
// `build: null` drops a finished build back to a draft.
export const LibrarySave = z.object({
  name: z.string().trim().max(100).optional(),
  homebrew: z.boolean().optional(),
  detail: CharacterDetail.partial().optional(),
  build: CharacterBuild.nullable().optional(),
  draft: z
    .record(z.string(), z.unknown())
    .refine((d) => JSON.stringify(d).length <= MAX_DRAFT_CHARS, "The draft is too large")
    .nullable()
    .optional(),
});
export type LibrarySave = z.infer<typeof LibrarySave>;
export type LibrarySaveInput = z.input<typeof LibrarySave>;

// POST /api/library starts an empty character, so the builder has a row to autosave its draft to.
export const NewLibraryCharacter = z.object({
  name: z.string().trim().max(100).optional(),
  homebrew: z.boolean().default(false),
});
export type NewLibraryCharacter = z.infer<typeof NewLibraryCharacter>; // parsed: `homebrew` has its default
export type NewLibraryCharacterInput = z.input<typeof NewLibraryCharacter>;

// A builder draft read back from storage or from the server. Neither side validates the whole shape on the way in
// (`LibrarySave.draft` and `character.draft` take whatever the builder writes, so an older builder's draft still
// loads), so this checks the few fields the builder reads before it resolves anything; the rest of the choices ride
// along and `resolveBuild` parses them.
export const StoredDraft = z.looseObject({ name: z.string(), tier: Tier, savedAt: z.number().optional() });
export type StoredDraft = z.infer<typeof StoredDraft>;
