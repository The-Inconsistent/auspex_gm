"use client";

import { useState } from "react";

import {
  CUSTOM_PREFIX,
  CUSTOM_THREAT_CAP,
  threatCite,
  threatLabel,
  type PoolPresetTable,
  type Threat,
  type Wargear,
} from "@wg/shared";

import { StatBlock } from "@/components/ui/stat-block/stat-block";
import { cloneDraft, draftOf, type ThreatDraft } from "@/components/ui/threat-builder/constants";
import { ThreatBuilder } from "@/components/ui/threat-builder/threat-builder";
import { ThreatStarts } from "@/components/ui/threat-starts/threat-starts";
import type { Send } from "@/hooks/use-table/use-table";

type ThreatEditorProps = {
  customThreats: Threat[];
  bestiary: Threat[]; // the books' stat blocks plus the customs, as GmApp merges them
  wargear: Wargear[];
  ruinActions: PoolPresetTable | null;
  tier: number;
  send: Send;
};

// A stat block the GM writes for their table (issue #43): the customs this campaign holds, and the three ways to start
// a new one (ThreatStarts) — CLONE FROM BESTIARY, BLANK or QUICK. Saving sends `threat.save`, which re-parses it server-side and sets the id,
// the source and the page.
export function ThreatEditor({ customThreats, bestiary, wargear, ruinActions, tier, send }: ThreatEditorProps) {
  // `slug` is null for one not saved yet; the server returns the slug it made.
  const [editing, setEditing] = useState<{ slug: string | null; draft: ThreatDraft } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const full = customThreats.length >= CUSTOM_THREAT_CAP;

  const start = (draft: ThreatDraft, slug: string | null = null) => {
    setError(null);
    setEditing({ slug, draft });
  };

  // CLONE on a saved one: a second copy, which takes its own slug from the name.
  const clone = (t: Threat) => start(cloneDraft(t, threatCite(t)));

  const remove = async (t: Threat) => {
    const r = await send({ type: "threat.delete", slug: t.id.slice(CUSTOM_PREFIX.length) });
    setError(r.ok ? null : r.error);
  };

  if (editing)
    return (
      <ThreatBuilder
        start={editing}
        wargear={wargear}
        ruinActions={ruinActions}
        send={send}
        onSaved={() => setEditing(null)}
        onCancel={() => setEditing(null)}
      />
    );

  return (
    <div className="stack">
      <div className="keys" style={{ alignItems: "center" }}>
        <ThreatStarts bestiary={bestiary} tier={tier} disabled={full} onStart={start} />
        <span className="dim">
          {customThreats.length} / {CUSTOM_THREAT_CAP}
          {full ? " · full" : ""}
        </span>
      </div>
      {error && <div className="red">! {error}</div>}
      {customThreats.length === 0 && (
        <div className="dim">None yet. Clone a book entry to tweak it for your table, or start from blank.</div>
      )}
      <div className="list">
        {customThreats.map((t) => (
          <details key={t.id} className="item">
            <summary>
              <b>{threatLabel(t)}</b>
            </summary>
            <div className="stack">
              <StatBlock t={t} tier={tier} />
              <div className="keys">
                <button className="btn sm" onClick={() => start(draftOf(t), t.id.slice("custom-".length))}>
                  EDIT
                </button>
                {/* CLONE makes a second copy, which takes its own slug from the name. */}
                <button className="btn sm" disabled={full} onClick={() => clone(t)}>
                  CLONE
                </button>
                <button className="btn sm danger" onClick={() => remove(t)}>
                  DELETE
                </button>
              </div>
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
