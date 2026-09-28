import { and, count, desc, eq } from "drizzle-orm";
import {
  CharacterBuild,
  CharacterDetail,
  LIBRARY_CAP,
  resolveBuild,
  type LibraryCharacter,
  type LibraryEntry,
  type LibrarySave,
  type NewLibraryCharacter,
} from "@wg/shared";
import { buildCatalogue, buildRefusal } from "../character/creation.service.ts";
import { db } from "../core/db.ts";
import { fail } from "../core/errors.ts";
import { libraryCharacter } from "./library.schema.ts";

// A signed-in user's personal character library (issue #14). Plain REST, not the socket action path: there's no
// campaign room to broadcast to, and nothing here is live state (docs/backend.md).

type Row = typeof libraryCharacter.$inferSelect;

// The Tier a character is being built at: the finished build's, else the draft's, else none yet.
function tierOf(row: Row): number | null {
  const built = CharacterBuild.safeParse(row.build);
  if (built.success) return built.data.tier;
  const tier = row.draft?.tier;
  return typeof tier === "number" ? tier : null;
}

// The archetype's name for the card, resolved from a finished build only: a draft may not have one yet, and resolving
// every draft on every list would parse the catalogue for nothing.
function archetypeOf(row: Row): string | null {
  const built = CharacterBuild.safeParse(row.build);
  if (!built.success) return null;
  try {
    return resolveBuild({ catalogue: buildCatalogue(row.homebrew), build: built.data }).sheet.archetype ?? null;
  } catch {
    return null; // a build saved against a catalogue that has since changed: the card just loses its archetype
  }
}

const card = (row: Row): LibraryCharacter => ({
  id: row.id,
  name: row.name,
  tier: tierOf(row),
  archetype: archetypeOf(row),
  homebrew: row.homebrew,
  done: !!row.build,
  updatedAt: row.updatedAt.toISOString(),
});

const entry = (row: Row): LibraryEntry => ({
  ...card(row),
  build: CharacterBuild.safeParse(row.build).data ?? null,
  draft: row.draft ?? null,
  detail: CharacterDetail.partial().parse(row.detail),
});

// Every read and write is scoped to the caller: another user's character is simply not found (null here, a 404 at the
// controller, never a 403, which would tell them the id exists).
async function own(userId: string, id: string): Promise<Row | null> {
  const [row] = await db
    .select()
    .from(libraryCharacter)
    .where(and(eq(libraryCharacter.id, id), eq(libraryCharacter.ownerUserId, userId)));
  return row ?? null;
}

export async function listLibrary(userId: string): Promise<LibraryCharacter[]> {
  const rows = await db
    .select()
    .from(libraryCharacter)
    .where(eq(libraryCharacter.ownerUserId, userId))
    .orderBy(desc(libraryCharacter.updatedAt));
  return rows.map(card);
}

export async function readLibrary({ userId, id }: { userId: string; id: string }): Promise<LibraryEntry | null> {
  const row = await own(userId, id);
  return row && entry(row);
}

export async function createLibraryCharacter({
  userId,
  body,
}: {
  userId: string;
  body: NewLibraryCharacter & { homebrew: boolean };
}): Promise<LibraryCharacter> {
  // The cap is a check-then-act outside the action queue, so it holds only for one request at a time; a user racing
  // themselves may end up one over. Harmless here: the cap exists to bound one account, not to be exact.
  // ponytail: exact cap, an insert … where (select count(*) …) < cap
  const [n] = await db.select({ n: count() }).from(libraryCharacter).where(eq(libraryCharacter.ownerUserId, userId));
  if ((n?.n ?? 0) >= LIBRARY_CAP) fail(`You keep at most ${LIBRARY_CAP} characters. Delete one first.`);
  const [row] = await db
    .insert(libraryCharacter)
    .values({ ownerUserId: userId, name: body.name ?? "", homebrew: body.homebrew })
    .returning();
  return card(row!); // the row was just inserted
}

export async function saveLibraryCharacter({
  userId,
  id,
  body,
}: {
  userId: string;
  id: string;
  body: LibrarySave;
}): Promise<LibraryCharacter | null> {
  const row = await own(userId, id);
  if (!row) return null;
  const homebrew = body.homebrew ?? row.homebrew;
  // The server decides, as `character.build` does: a build is re-resolved here and refused unless it's ready. No
  // `play`: a library character has earned no XP, and advancement belongs to the campaign copy.
  let build: Record<string, unknown> | null | undefined;
  if (body.build !== undefined) {
    if (body.build === null) build = null;
    else {
      // The GM's part is the GM's, made at their table: a library character never carries one.
      const parsed = CharacterBuild.parse({ ...body.build, gm: undefined });
      const refusal = buildRefusal(resolveBuild({ catalogue: buildCatalogue(homebrew), build: parsed }));
      if (refusal) fail(refusal);
      build = parsed;
    }
  }
  const [saved] = await db
    .update(libraryCharacter)
    .set({
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.homebrew !== undefined ? { homebrew } : {}),
      ...(body.detail !== undefined ? { detail: body.detail } : {}),
      ...(body.draft !== undefined ? { draft: body.draft } : {}),
      ...(build !== undefined ? { build } : {}),
      updatedAt: new Date(),
    })
    .where(eq(libraryCharacter.id, row.id))
    .returning();
  return card(saved!); // the row was just updated
}

export async function deleteLibraryCharacter({ userId, id }: { userId: string; id: string }) {
  const r = await db
    .delete(libraryCharacter)
    .where(and(eq(libraryCharacter.id, id), eq(libraryCharacter.ownerUserId, userId)))
    .returning({ id: libraryCharacter.id });
  return r.length ? { ok: true as const } : null;
}
