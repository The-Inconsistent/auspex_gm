"use client";

import { useEffect, useMemo, useState } from "react";

import {
  CUSTOM_PREFIX,
  CUSTOM_THREAT_CAP,
  threatCite,
  threatLabel,
  type PoolPresetTable,
  type Threat,
  type Wargear,
} from "@wg/shared";

import { usePrint } from "@/components/ui/print-dialog/print-dialog";
import { PrintPick } from "@/components/ui/print-pick/print-pick";
import { StatBlock } from "@/components/ui/stat-block/stat-block";
import { cloneDraft, draftOf, type ThreatDraft } from "@/components/ui/threat-builder/constants";
import { ThreatBuilder } from "@/components/ui/threat-builder/threat-builder";
import { ThreatStarts } from "@/components/ui/threat-starts/threat-starts";
import type { Send } from "@/hooks/use-table/use-table";
import { toggleIn } from "@/lib/toggle-set/toggle-set";

type ThreatEditorProps = {
  editSlug?: string; // from the URL (/codex/threats/<slug>/edit): the saved one being edited
  onEdit: (slug: string | null) => void; // EDIT's URL, or back to the list
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
export function ThreatEditor({
  editSlug,
  onEdit,
  customThreats,
  bestiary,
  wargear,
  ruinActions,
  tier,
  send,
}: ThreatEditorProps) {
  // A new one (CLONE, BLANK, QUICK) starts from a draft only this tablet holds, so it stays here; `slug` is null for one
  // not saved yet, and the server returns the slug it made. A saved one is edited at its own URL.
  const [drafting, setDrafting] = useState<{ slug: string | null; draft: ThreatDraft } | null>(null);
  const saved = editSlug ? customThreats.find((t) => t.id === CUSTOM_PREFIX + editSlug) : undefined;
  const routed = useMemo(() => saved && editSlug && { slug: editSlug, draft: draftOf(saved) }, [saved, editSlug]);
  const editing = drafting ?? routed ?? null;
  // A link to a custom threat that's gone: back to the list. External system: the browser's URL, through Next's router.
  const lost = !!editSlug && !saved;
  useEffect(() => {
    if (lost) onEdit(null);
  }, [lost, onEdit]);
  const [error, setError] = useState<string | null>(null);
  const full = customThreats.length >= CUSTOM_THREAT_CAP;
  const { print } = usePrint();
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set()); // ticked for PRINT N (#203)
  const toPrint = customThreats.filter((t) => picked.has(t.id)).map((t) => t.id); // a deleted one drops out

  const start = (draft: ThreatDraft) => {
    setError(null);
    setDrafting({ slug: null, draft });
  };

  // SAVE or CANCEL: a draft just closes, a saved one goes back to the list's URL.
  const done = () => (drafting ? setDrafting(null) : onEdit(null));

  // CLONE on a saved one: a second copy, which takes its own slug from the name.
  const clone = (t: Threat) => start(cloneDraft(t, threatCite(t)));

  const remove = async (t: Threat) => {
    const r = await send({ type: "threat.delete", slug: t.id.slice(CUSTOM_PREFIX.length) });
    setError(r.ok ? null : r.error);
  };

  if (editing)
    return (
      <ThreatBuilder
        key={editing.slug ?? "new"} // its draft is read once: another threat's URL starts afresh
        start={editing}
        wargear={wargear}
        ruinActions={ruinActions}
        send={send}
        onSaved={done}
        onCancel={done}
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
        {toPrint.length > 0 && (
          <button className="btn sm" onClick={() => print({ threats: toPrint })}>
            PRINT {toPrint.length}
          </button>
        )}
      </div>
      {error && <div className="red">! {error}</div>}
      {customThreats.length === 0 && (
        <div className="dim">None yet. Clone a book entry to tweak it for your table, or start from blank.</div>
      )}
      <div className="list">
        {customThreats.map((t) => (
          <details key={t.id} className="item">
            <summary className="item-head">
              <b style={{ flex: 1 }}>{threatLabel(t)}</b>
              <PrintPick
                name={threatLabel(t)}
                on={picked.has(t.id)}
                onToggle={() => setPicked((p) => toggleIn(p, t.id))}
              />
            </summary>
            <div className="stack">
              <StatBlock t={t} tier={tier} />
              <div className="keys">
                <button className="btn sm" onClick={() => onEdit(t.id.slice(CUSTOM_PREFIX.length))}>
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
