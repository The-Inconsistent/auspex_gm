"use client";
import { useRef, useState, type ChangeEvent } from "react";

import { CodexPicture, usePictureCampaign } from "@/components/ui/codex-picture/codex-picture";
import { uploadImage } from "@/lib/codex-image/codex-image";

type ImageFieldProps = {
  id: string;
  value: string | null;
  alt: string;
  onChange: (imageId: string | null) => void;
  onError: (error: string | null) => void;
};

// An entry's PICTURE (issue #199): picking a file shrinks and uploads it at once, and the entry's SAVE keeps the id.
// REMOVE only clears the id; the api sweeps a picture nothing points at.
export function ImageField({ id, value, alt, onChange, onError }: ImageFieldProps) {
  const campaignId = usePictureCampaign();
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null); // the file picker, opened by the button

  // File picked: upload it, then point the draft at it. The input is cleared so the same file again is a new pick.
  const handlePick = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    onError(null);
    const r = await uploadImage(campaignId, file);
    setBusy(false);
    if ("error" in r) onError(r.error);
    else onChange(r.id);
  };

  return (
    <div className="stack" style={{ gap: 8 }}>
      {value && <CodexPicture imageId={value} alt={alt} />}
      <div className="keys" role="group" aria-labelledby={id} style={{ paddingTop: 0 }}>
        <button className="btn sm" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? "UPLOADING…" : value ? "REPLACE" : "ADD PICTURE"}
        </button>
        <input ref={input} type="file" accept="image/*" hidden tabIndex={-1} onChange={handlePick} />
        {value && (
          <button className="btn sm" onClick={() => onChange(null)}>
            REMOVE
          </button>
        )}
      </div>
    </div>
  );
}
