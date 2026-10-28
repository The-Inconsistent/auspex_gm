"use client";
import { useState } from "react";

import { CampaignExport, IMPORT_MAX_BYTES, sliceAdventures, type ActionResult } from "@wg/shared";

type ImportAdventureProps = {
  campaignId: string;
  onReport: (r: ActionResult, ok: string) => void;
};

type Reply = {
  adventures?: number;
  scenes?: number;
  reused?: Record<string, number>;
  droppedPictures?: number;
  message?: string;
};

// IMPORT ADVENTURE: adventures from a campaign file (a GM's EXPORT) into this campaign, as prep. Only the picked ones
// and what their scenes link to are sent, so a big backup sends only the pictures it needs. An entry named like one
// this campaign has is that entry; the codex arrives with the rebroadcast.
export function ImportAdventure({ campaignId, onReport }: ImportAdventureProps) {
  const [file, setFile] = useState<CampaignExport | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const close = () => {
    setFile(null);
    setPicked(new Set());
    setError(null);
  };

  const read = async (f: File | undefined) => {
    setError(null);
    if (!f) return;
    if (f.size > IMPORT_MAX_BYTES) return setError("That file is over 100 MB. Export it again WITHOUT PICTURES.");
    let parsed: ReturnType<typeof CampaignExport.safeParse> | null = null;
    try {
      parsed = CampaignExport.safeParse(JSON.parse(await f.text()));
    } catch {}
    if (!parsed?.success) return setError("That file isn't a campaign export.");
    if (!parsed.data.codex.adventures.length) return setError("That file has no adventures.");
    setFile(parsed.data);
    setPicked(new Set());
  };

  const toggle = (id: string) => {
    const next = new Set(picked);
    if (!next.delete(id)) next.add(id);
    setPicked(next);
  };

  const send = async () => {
    if (!file || !picked.size || busy) return;
    setBusy(true);
    const res = await fetch(`/api/campaigns/${campaignId}/import-adventures`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ file: sliceAdventures(file, [...picked]) }),
    }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as Reply | null;
    setBusy(false);
    if (!res?.ok || !body?.adventures) return setError(body?.message ?? "No signal");
    const reused = Object.values(body.reused ?? {}).reduce((n, x) => n + x, 0);
    const dropped = body.droppedPictures ?? 0;
    onReport(
      { ok: true },
      [
        `IMPORTED ${body.adventures} ${body.adventures === 1 ? "ADVENTURE" : "ADVENTURES"} · ${body.scenes} SCENES`,
        reused && `${reused} ALREADY HERE, KEPT`,
        dropped && `${dropped} ${dropped === 1 ? "PICTURE" : "PICTURES"} LEFT OUT`,
      ]
        .filter(Boolean)
        .join(" · "),
    );
    close();
  };

  return (
    <div className="stack" style={{ gap: 8 }}>
      <label className="btn sm" style={{ alignSelf: "flex-start" }}>
        IMPORT ADVENTURE
        <input
          type="file"
          accept=".json,application/json"
          hidden
          aria-invalid={!!error}
          aria-describedby={error ? "import-adventure-error" : undefined}
          onChange={(e) => {
            void read(e.target.files?.[0]);
            e.target.value = ""; // the same file again opens it again
          }}
        />
      </label>
      {file && (
        <div className="panel pad stack" style={{ gap: 8 }}>
          <div className="rule">FROM {file.campaign.name.toUpperCase()}</div>
          {file.codex.adventures.map((a) => (
            <label key={a.id} style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input type="checkbox" checked={picked.has(a.id)} onChange={() => toggle(a.id)} />
              {a.title || "Untitled"}{" "}
              <span className="dim">
                · {a.beats.length} {a.beats.length === 1 ? "scene" : "scenes"}
              </span>
            </label>
          ))}
          <p className="dim">
            Comes in as prep: planned and hidden. Its NPCs, places, handouts and items come too, unless this campaign
            has one by the same name, which the scenes then use.
          </p>
          <div className="keys">
            <button className="btn sm primary" disabled={!picked.size} aria-busy={busy} onClick={send}>
              IMPORT {picked.size || ""}
            </button>
            <button className="btn sm" onClick={close}>
              CANCEL
            </button>
          </div>
        </div>
      )}
      {error && (
        <div id="import-adventure-error" className="red" role="alert">
          ! {error}
        </div>
      )}
    </div>
  );
}
