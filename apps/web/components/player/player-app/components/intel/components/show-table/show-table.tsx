"use client";
import { useEffect, type RefObject } from "react";

import { X } from "lucide-react";

import { usePictureCampaign } from "@/components/ui/codex-picture/codex-picture";
import { HandoutDoc } from "@/components/ui/handout-doc/handout-doc";
import { imageSrc } from "@/lib/codex-image/codex-image";

import { entryName, type IntelEntry } from "../../utils";

type ShowTableProps = { ref: RefObject<HTMLDivElement | null>; entry: IntelEntry; onClose: () => void };

// A handout or picture to hold up at the table. The shell asks the browser for fullscreen on this element from the tap
// itself; where that isn't offered (an iPhone) the same element is a fixed overlay over the whole viewport. The screen
// already stays awake (useTable's wake lock).
export function ShowTable({ ref, entry, onClose }: ShowTableProps) {
  const campaignId = usePictureCampaign();

  // External system: the document's fullscreen state and keyboard. The browser's own way out (a swipe, Escape) ends the
  // view; Escape also ends the overlay fallback, where the browser sends no fullscreenchange.
  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const name = entryName(entry);
  return (
    <div ref={ref} className="pl-table" role="region" aria-label={`Showing the table: ${name}`}>
      <div className="pl-table-bar">
        <span className="mono">SHOWING THE TABLE · SCREEN STAYS AWAKE</span>
        <button type="button" className="pl-entry-close" aria-label={`Stop showing ${name}`} onClick={onClose}>
          <X size={20} aria-hidden="true" />
        </button>
      </div>
      <div className="pl-table-stage">
        {entry.kind === "handout" ? (
          <HandoutDoc handout={entry.entry} />
        ) : (
          entry.entry.imageId && (
            // eslint-disable-next-line @next/next/no-img-element -- seat-gated bytes, see components/ui/codex-picture
            <img className="pl-table-img" src={imageSrc(campaignId, entry.entry.imageId)} alt={name} />
          )
        )}
      </div>
      <p className="pl-table-hint">Turn the phone round and hold it up.</p>
    </div>
  );
}
