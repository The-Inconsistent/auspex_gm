import { portrait, threatPortrait } from "@/lib/portraits/portraits";
import type { Card } from "@/lib/print-cards/print-cards";

const MAX_PX = 400; // about 460 dpi on a 22 mm tall portrait: sharp, and the PDF stays small

// react-pdf embeds PNG and JPEG only, and the portraits are WebP: redraw each one onto a canvas as a PNG data URL.
async function png(src: string): Promise<string> {
  const img = new Image();
  img.src = src;
  await img.decode();
  const scale = Math.min(1, MAX_PX / img.naturalHeight);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

// A picture that fails to load is left off its card rather than failing the whole sheet.
async function pngOrNone(src: string): Promise<string | undefined> {
  try {
    const url = await png(src);
    return url;
  } catch {
    return undefined;
  }
}

// Each tent card's portrait, if it has one, as the PNG the sheet embeds, each picture converted once.
export async function picturesOf(cards: Card[]): Promise<Map<Card, string>> {
  const bySrc = new Map<string, string | undefined>();
  const out = new Map<Card, string>();
  for (const c of cards) {
    if (c.kind !== "tent") continue;
    const pic = c.portrait.characterSlug
      ? portrait(c.portrait.characterSlug)
      : threatPortrait(c.portrait.threatId ?? "");
    if (!pic) continue;
    if (!bySrc.has(pic.src)) bySrc.set(pic.src, await pngOrNone(pic.src));
    const url = bySrc.get(pic.src);
    if (url) out.set(c, url);
  }
  return out;
}
