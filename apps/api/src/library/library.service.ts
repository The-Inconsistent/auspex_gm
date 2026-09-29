import { and, count, desc, eq, sql } from "drizzle-orm";
import {
  CharacterBuild,
  CharacterDetail,
  LIBRARY_CAP,
  Tier,
  resolveBuild,
  type LibraryCharacter,
  type LibraryEntry,
  type LibrarySave,
  type NewLibraryCharacter,
} from "@wg/shared";
import { appUser } from "../auth/auth.schema.ts";
import { buildCatalogue, buildRefusal } from "../character/creation.service.ts";
import { db } from "../core/db.ts";
import { fail } from "../core/errors.ts";
import { libraryCharacter } from "./library.schema.ts";

// A signed-in user's personal character library (issue #14). Plain REST, not the socket action path: there's no
// campaign room to broadcast to, and nothing here is live state (docs/backend.md).

type Row = typeof libraryCharacter.$inferSelect;

// The Tier a character is being built at: the finished build's, else the draft's, else none yet. The draft is stored as
// the builder writes it, so its Tier is parsed rather than trusted: a bad one would make the whole lobby fail to load.
function tierOf(row: Row): number | null {
  const built = CharacterBuild.safeParse(row.build);
  if (built.success) return built.data.tier;
  return Tier.safeParse(row.draft?.tier).data ?? null;
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
async function own({ userId, id }: { userId: string; id: string }): Promise<Row | null> {
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
  const row = await own({ userId, id });
  return row && entry(row);
}

export async function createLibraryCharacter({
  userId,
  body,
}: {
  userId: string;
  body: NewLibraryCharacter;
}): Promise<LibraryCharacter> {
  // Counting and inserting is a check-then-act, and this is REST, so the gateway's per-campaign queue doesn't serialise
  // it: concurrent posts (two tabs, a retried link) would all read the same count and every one of them would insert.
  // Locking the owner's `app_user` row for the transaction serialises one user's creations, which makes the cap exact.
  const row = await db.transaction(async (tx) => {
    await tx.execute(sql`select 1 from ${appUser} where ${appUser.id} = ${userId} for update`);
    const [n] = await tx.select({ n: count() }).from(libraryCharacter).where(eq(libraryCharacter.ownerUserId, userId));
    if ((n?.n ?? 0) >= LIBRARY_CAP) fail(`You keep at most ${LIBRARY_CAP} characters. Delete one first.`);
    const [inserted] = await tx
      .insert(libraryCharacter)
      .values({ ownerUserId: userId, name: body.name ?? "", homebrew: body.homebrew })
      .returning();
    return inserted!; // the row was just inserted
  });
  return card(row);
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
  const row = await own({ userId, id });
  if (!row) return null;
  const homebrew = body.homebrew ?? row.homebrew;
  // The server decides, as `character.build` does: a build is re-resolved here and refused unless it's ready, bar what
  // only a GM judges, which waits for the campaign's GM (§11.58). No `play`: a library character has earned no XP, and
  // advancement belongs to the campaign copy.
  let build: Record<string, unknown> | null | undefined;
  if (body.build !== undefined) {
    if (body.build === null) build = null;
    else {
      // The GM's part is the GM's, made at their table: a library character never carries one.
      const parsed = CharacterBuild.parse({ ...body.build, gm: undefined });
      const r = resolveBuild({ catalogue: buildCatalogue(homebrew), build: parsed });
      const refusal = buildRefusal(r, { gmLater: true });
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
    .where(and(eq(libraryCharacter.id, row.id), eq(libraryCharacter.ownerUserId, userId)))
    .returning();
  return saved ? card(saved) : null; // null: deleted since the read, a 404 like any row that isn't there
}

export async function deleteLibraryCharacter({ userId, id }: { userId: string; id: string }) {
  const r = await db
    .delete(libraryCharacter)
    .where(and(eq(libraryCharacter.id, id), eq(libraryCharacter.ownerUserId, userId)))
    .returning({ id: libraryCharacter.id });
  return r.length ? { ok: true as const } : null;
}
