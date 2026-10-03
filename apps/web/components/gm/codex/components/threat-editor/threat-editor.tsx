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
import { ThreatPicker } from "@/components/ui/threat-picker/threat-picker";
import type { Send } from "@/hooks/use-table/use-table";

import { blankDraft, cloneDraft, draftOf, quickDraft, type ThreatDraft } from "./constants";
import { ThreatForm } from "./threat-form";

type ThreatEditorProps = {
  customThreats: Threat[];
  bestiary: Threat[]; // the books' stat blocks plus the customs, as GmApp merges them
  wargear: Wargear[];
  ruinActions: PoolPresetTable | null;
  tier: number;
  send: Send;
};

// A stat block the GM writes for their table (issue #43): the customs this campaign holds, and the two ways to start a
// new one — CLONE FROM BESTIARY, or BLANK. Saving sends `threat.save`, which re-parses it server-side and sets the id,
// the source and the page.
export function ThreatEditor({ customThreats, bestiary, wargear, ruinActions, tier, send }: ThreatEditorProps) {
  // `slug` is null for one not saved yet; the server returns the slug it made.
  const [editing, setEditing] = useState<{ slug: string | null; draft: ThreatDraft } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const full = customThreats.length >= CUSTOM_THREAT_CAP;

  const start = (draft: ThreatDraft, slug: string | null = null) => {
    setError(null);
    setEditing({ slug, draft });
  };

  const clone = (t: Threat) => start(cloneDraft(t, threatCite(t)));

  const save = async () => {
    if (!editing) return;
    setBusy(true);
    const r = await send({
      type: "threat.save",
      ...(editing.slug ? { slug: editing.slug } : {}),
      data: editing.draft,
    });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setError(null);
    setEditing(null);
  };

  const remove = async (t: Threat) => {
    const r = await send({ type: "threat.delete", slug: t.id.slice(CUSTOM_PREFIX.length) });
    setError(r.ok ? null : r.error);
  };

  if (editing)
    return (
      <div className="panel pad stack">
        <ThreatForm
          draft={editing.draft}
          wargear={wargear}
          ruinActions={ruinActions}
          onChange={(draft) => setEditing({ ...editing, draft })}
        />
        {error && <div className="red">! {error}</div>}
        {/* A stat block carries at least one Keyword (Core p.323), so the server would refuse one without. */}
        {!editing.draft.keywords.length && <div className="dim">Add a keyword to save.</div>}
        <div className="keys">
          <button
            className="btn primary"
            disabled={busy || !editing.draft.name.trim() || !editing.draft.keywords.length}
            onClick={save}
          >
            {editing.slug ? "SAVE THREAT" : "CREATE THREAT"}
          </button>
          <button className="btn" onClick={() => setEditing(null)}>
            CANCEL
          </button>
        </div>
      </div>
    );

  return (
    <div className="stack">
      <div className="keys" style={{ alignItems: "center" }}>
        {/* Disabled at the cap like the other two: a form the server would refuse on CREATE wastes the GM's typing. */}
        <ThreatPicker
          bestiary={bestiary}
          tier={tier}
          onPick={clone}
          label="CLONE FROM BESTIARY"
          className="btn sm"
          disabled={full}
        />
        <button className="btn sm" disabled={full} onClick={() => start(blankDraft())}>
          BLANK
        </button>
        {/* The Core p.326 row for this Tier: the derived numbers, and the Attributes left to the GM (§11.110). */}
        <button className="btn sm" disabled={full} onClick={() => start(quickDraft(tier))}>
          QUICK (TIER {Math.min(Math.max(Math.trunc(tier), 1), 4)})
        </button>
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
