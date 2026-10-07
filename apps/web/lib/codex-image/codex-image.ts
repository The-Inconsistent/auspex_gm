import { ImageUploadReply } from "@wg/shared";

import { TOKENS } from "@/lib/tokens/tokens";

// Codex pictures (issue #199): the GM's browser shrinks a picture before it uploads, since the api does no resizing.

const LONG_SIDE = 1024;
const QUALITY = 0.85;

// Where a picture is served from: through Next's /api rewrite, with the caller's session or guest cookie riding along.
export const imageSrc = (campaignId: string, imageId: string) => `/api/campaigns/${campaignId}/images/${imageId}`;

// The size a picture is drawn at: at most LONG_SIDE px on the long side, never enlarged, never 0.
export function fit(width: number, height: number) {
  const scale = Math.min(1, LONG_SIDE / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

// The picture at `fit` size, as WebP. Safari can't encode WebP (`toBlob` quietly hands back a PNG), so there it falls
// back to JPEG, on vellum: JPEG has no transparency and would turn a cut-out black.
export async function shrink(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  Object.assign(canvas, fit(bitmap.width, bitmap.height));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const encode = (type: string) => new Promise<Blob | null>((done) => canvas.toBlob(done, type, QUALITY));
  const webp = await encode("image/webp");
  if (webp?.type === "image/webp") return webp;
  ctx.globalCompositeOperation = "destination-over";
  ctx.fillStyle = TOKENS.vellum;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const jpeg = await encode("image/jpeg");
  if (!jpeg) throw new Error("no encoder");
  return jpeg;
}

// Shrinks and uploads a picture the GM picked; the id then goes on the entry through `codex.save`.
export async function uploadImage(campaignId: string, file: File): Promise<{ id: string } | { error: string }> {
  let blob: Blob;
  try {
    blob = await shrink(file);
  } catch {
    return { error: "This browser can't read that file as a picture" };
  }
  try {
    const res = await fetch(`/api/campaigns/${campaignId}/images`, {
      method: "POST",
      headers: { "content-type": blob.type },
      body: blob,
    });
    const reply = ImageUploadReply.safeParse(await res.json());
    if (!reply.success) return { error: "No signal" };
    return "id" in reply.data ? { id: reply.data.id } : { error: reply.data.message };
  } catch {
    return { error: "No signal" }; // offline, or an answer that isn't JSON
  }
}
