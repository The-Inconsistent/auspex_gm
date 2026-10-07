"use client";
import { createContext, use, type ReactNode } from "react";

import { imageSrc } from "@/lib/codex-image/codex-image";

// The campaign whose pictures this screen shows (issue #199): the GM app and the player app each hold one.
const PictureContext = createContext<string | null>(null);

export function PictureProvider({ campaignId, children }: { campaignId: string; children: ReactNode }) {
  return <PictureContext value={campaignId}>{children}</PictureContext>;
}

export function usePictureCampaign(): string {
  const campaignId = use(PictureContext);
  if (!campaignId) throw new Error("usePictureCampaign outside PictureProvider");
  return campaignId;
}

type CodexPictureProps = { imageId: string; alt: string; held?: boolean; large?: boolean };

// A codex entry's picture: a nice addition, not the entry, so a small thumbnail that opens full size in a new tab. A
// handout's (`large`) is part of the prop, so it's drawn bigger. A plain <img>: the api serves the bytes per seat, and
// next/image's optimiser fetches without the viewer's cookies. `held` dims it on the GM's screen while players can't
// see it yet; the toggle beside it says so.
export function CodexPicture({ imageId, alt, held, large }: CodexPictureProps) {
  const src = imageSrc(usePictureCampaign(), imageId);
  return (
    <a
      className="codex-picture"
      data-large={large || undefined}
      data-held={held || undefined}
      href={src}
      target="_blank"
      rel="noopener"
      aria-label={`Open the picture of ${alt} full size`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- seat-gated bytes, see above */}
      <img src={src} alt={alt} loading="lazy" />
    </a>
  );
}
