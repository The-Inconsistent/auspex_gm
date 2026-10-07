import { and, count, eq, notExists, sql, sum } from "drizzle-orm";
import { IMAGE_CAMPAIGN_BYTES, IMAGE_CAP, IMAGE_MAX_BYTES, type ImageMime } from "@wg/shared";
import type { Db, Tx } from "../core/db.ts";
import { fail } from "../core/errors.ts";
import { handout, location, npc } from "./codex.schema.ts";
import { codexImage } from "./image.schema.ts";

// Where a codex picture's bytes live (issue #199). Postgres for now, so a pg_dump backs them up. Nothing outside this file
// reads or writes `codex_image.bytes`: callers only hold ids, so an S3 store can replace these functions as they are.

// What the bytes are, from their first bytes rather than what the client says: JPEG opens FF D8 FF, WebP is a RIFF file
// with WEBP at offset 8.
export function sniffMime(b: Buffer): ImageMime | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length > 12 && b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP")
    return "image/webp";
  return null;
}

// ponytail: per-campaign count and size caps, checked outside the action queue (two uploads at once may pass one over);
// a per-user quota and a lock if the app opens up.
export async function putImage(
  tx: Tx,
  { campaignId, mime, bytes, id }: { campaignId: string; mime: string; bytes: Buffer; id?: string },
): Promise<string> {
  if (sniffMime(bytes) !== mime) fail("That isn't a WebP or JPEG picture");
  if (bytes.length > IMAGE_MAX_BYTES) fail("That picture is over 1 MB");
  const [held] = await tx
    .select({ n: count(), size: sum(sql<number>`octet_length(${codexImage.bytes})`) })
    .from(codexImage)
    .where(eq(codexImage.campaignId, campaignId));
  if ((held?.n ?? 0) >= IMAGE_CAP) fail(`This campaign already holds ${IMAGE_CAP} pictures`);
  if (Number(held?.size ?? 0) + bytes.length > IMAGE_CAMPAIGN_BYTES) fail("This campaign's pictures are at 100 MB");
  const [row] = await tx
    .insert(codexImage)
    .values({ ...(id ? { id } : {}), campaignId, mime: mime as ImageMime, bytes })
    .returning({ id: codexImage.id });
  return row!.id; // the row was just inserted
}

export async function getImage(db: Db, campaignId: string, id: string) {
  const [row] = await db
    .select({ mime: codexImage.mime, bytes: codexImage.bytes })
    .from(codexImage)
    .where(and(eq(codexImage.id, id), eq(codexImage.campaignId, campaignId)));
  return row ?? null;
}

// Drops the pictures no NPC, place or handout points at. A day's grace keeps an upload whose SAVE hasn't come yet, even
// from an editor left open through a long prep: the editor's SAVE refuses a picture that's gone ("Image not found").
export async function sweepImages(tx: Tx, campaignId: string) {
  const uses = (t: typeof npc | typeof location | typeof handout) =>
    notExists(
      tx
        .select({ x: sql`1` })
        .from(t as typeof npc)
        .where(eq(t.imageId, codexImage.id)),
    );
  await tx
    .delete(codexImage)
    .where(
      and(
        eq(codexImage.campaignId, campaignId),
        sql`${codexImage.createdAt} < now() - interval '1 day'`,
        uses(npc),
        uses(location),
        uses(handout),
      ),
    );
}
