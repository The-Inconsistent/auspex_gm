"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  CUSTOM_PREFIX,
  CUSTOM_THREAT_CAP,
  threatCite,
  type PoolPresetTable,
  type Threat,
  type Wargear,
} from "@wg/shared";

import { ConfirmAction } from "@/components/ui/confirm-action/confirm-action";
import { usePrint } from "@/components/ui/print-dialog/print-dialog";
import { PrintPick } from "@/components/ui/print-pick/print-pick";
import { StatBlock } from "@/components/ui/stat-block/stat-block";
import { cloneDraft, draftOf, type ThreatDraft } from "@/components/ui/threat-builder/constants";
import { ThreatBuilder } from "@/components/ui/threat-builder/threat-builder";
import { FACTION_LABEL } from "@/components/ui/threat-picker/constants";
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

const slugOf = (t: Threat) => t.id.slice(CUSTOM_PREFIX.length);

// The class printed at each Tier, this campaign's marked (Core p.323).
function TierStrip({ t, tier }: { t: Threat; tier: number }) {
  return (
    <span className="th-tierstrip" aria-label={`Threat by Tier: ${t.threat.map((c) => c ?? "none").join(", ")}`}>
      {t.threat.map((c, i) => (
        <i key={i} className={i === tier - 1 ? "on" : undefined}>
          {c ?? "–"}
        </i>
      ))}
    </span>
  );
}

// A stat block the GM writes for their table (issue #43, canvas Threats-List): the customs this campaign holds beside
// the one tapped, printed, and one NEW THREAT whose dialog holds the three ways to start (ThreatStarts). Saving sends
// `threat.save`, which re-parses it server-side and sets the id, the source and the page.
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
  // A new one (copy, blank, quick, CLONE) starts from a draft only this tablet holds, so it stays here; `slug` is null
  // for one not saved yet, and the server returns the slug it made. A saved one is edited at its own URL.
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
  const [shownId, setShownId] = useState<string | null>(null);
  const shown = customThreats.find((t) => t.id === shownId) ?? customThreats[0];
  const dialog = useRef<HTMLDialogElement>(null);

  // The dialog takes the focus itself: on its find box, the bestiary list would open over BLANK and QUICK.
  const openNew = () => {
    dialog.current?.showModal();
    dialog.current?.focus();
  };

  const start = (draft: ThreatDraft) => {
    dialog.current?.close();
    setError(null);
    setDrafting({ slug: null, draft });
  };

  // SAVE or CANCEL: a refused DELETE is left behind, a draft just closes, a saved one goes back to the list's URL. The saved one shows beside the list.
  const done = (threatId?: string) => {
    setError(null);
    if (threatId) setShownId(threatId);
    if (drafting) setDrafting(null);
    else onEdit(null);
  };

  // CLONE (in the editor's MORE): a second copy, which takes its own slug from the name; the original's URL is left.
  const clone = (t: Threat) => {
    onEdit(null);
    start(cloneDraft(t, threatCite(t)));
  };

  const remove = async (t: Threat) => {
    const r = await send({ type: "threat.delete", slug: slugOf(t) });
    setError(r.ok ? null : r.error);
    if (r.ok) onEdit(null);
  };

  if (editing)
    return (
      <div className="stack">
        {error && <div className="red">! {error}</div>}
        <ThreatBuilder
          key={editing.slug ?? "new"} // its draft is read once: another threat's URL starts afresh
          page
          start={editing}
          tier={tier}
          wargear={wargear}
          ruinActions={ruinActions}
          send={send}
          onSaved={done}
          onCancel={() => done()}
          more={
            !drafting &&
            saved && (
              <>
                <button className="btn" disabled={full} onClick={() => clone(saved)}>
                  CLONE
                </button>
                <ConfirmAction label="DELETE" prompt={`Delete ${saved.name}?`} onConfirm={() => remove(saved)} />
              </>
            )
          }
        />
      </div>
    );

  return (
    <div className="th-list">
      <section className="stack" aria-label="Your threats">
        <div className="rule">YOUR THREATS</div>
        <div className="keys" style={{ alignItems: "center" }}>
          <span className="dim" style={{ flex: 1 }}>
            {customThreats.length} of {CUSTOM_THREAT_CAP}
            {full ? " · full" : ""}
          </span>
          {toPrint.length > 0 && (
            <button className="btn sm" onClick={() => print({ threats: toPrint })}>
              PRINT {toPrint.length}
            </button>
          )}
          {/* At the cap a form the server would refuse wastes the GM's typing, so there's nothing to open. */}
          <button className="btn primary" disabled={full} onClick={openNew}>
            + NEW THREAT
          </button>
        </div>
        {error && <div className="red">! {error}</div>}
        {customThreats.length === 0 && (
          <div className="dim">None yet. Copy a book entry to tweak it for your table, or start from a blank page.</div>
        )}
        <div className="th-rows">
          {customThreats.map((t) => (
            <div key={t.id} className="th-row" aria-current={t.id === shown?.id || undefined}>
              <PrintPick name={t.name} on={picked.has(t.id)} onToggle={() => setPicked((p) => toggleIn(p, t.id))} />
              <button className="th-row-main" aria-pressed={t.id === shown?.id} onClick={() => setShownId(t.id)}>
                <b>{t.name.toUpperCase()}</b>
                <span className="dim">
                  {FACTION_LABEL[t.faction]}
                  {t.note ? ` · ${t.note}` : ""}
                </span>
              </button>
              <TierStrip t={t} tier={tier} />
            </div>
          ))}
        </div>
      </section>
      {shown && (
        <section className="stack" aria-label={`${shown.name}, as printed`}>
          <div className="keys" style={{ alignItems: "center" }}>
            <span className="chip">CUSTOM</span>
            <span className="dim" style={{ flex: 1 }}>
              {shown.note ?? "Written for this table"}
            </span>
            <button className="btn" onClick={() => onEdit(slugOf(shown))}>
              EDIT
            </button>
          </div>
          <StatBlock t={shown} tier={tier} />
        </section>
      )}
      {/* A native modal <dialog>: Escape, the focus trap and focus return come from the browser. */}
      <dialog
        ref={dialog}
        className="party-dlg"
        aria-label="New threat"
        tabIndex={-1}
        // A click on the dialog element itself, not its content, is a click on the backdrop.
        onClick={(e) => e.target === dialog.current && dialog.current.close()}
      >
        <div className="sb-title">
          <span>NEW THREAT</span>
        </div>
        <div className="party-dlg-body stack">
          <ThreatStarts bestiary={bestiary} tier={tier} full={full} onStart={start} />
          <span className="dim">
            {customThreats.length} of {CUSTOM_THREAT_CAP} custom threats
          </span>
        </div>
        <div className="dlg-foot">
          <button className="btn sm" onClick={() => dialog.current?.close()}>
            CLOSE
          </button>
        </div>
      </dialog>
    </div>
  );
}
