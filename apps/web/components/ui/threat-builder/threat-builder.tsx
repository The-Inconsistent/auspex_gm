"use client";
import { useState } from "react";

import { CustomThreatData, customThreatId, type PoolPresetTable, type Wargear } from "@wg/shared";

import { useFieldErrors } from "@/hooks/use-field-errors/use-field-errors";
import type { Send } from "@/hooks/use-table/use-table";

import type { ThreatDraft } from "./constants";
import { ThreatForm } from "./components/threat-form/threat-form";

type ThreatBuilderProps = {
  start: { slug: string | null; draft: ThreatDraft }; // slug null: a new one, the server makes the slug
  wargear: Wargear[];
  ruinActions: PoolPresetTable | null; // Threat Assessment p.7, offered as RUIN abilities
  send: Send;
  onSaved: (threatId: string) => void; // `custom-<slug>`, the id every picker and encounter entry uses
  onCancel: () => void;
};

// One custom stat block being written (issue #43): the form, CREATE or SAVE, CANCEL. Shared: CODEX › THREATS opens it,
// and so does a scene's + NEW CUSTOM THREAT, which adds the new threat to its prepared encounter. A fresh mount per open, so
// no mark or refusal is left from the last one.
export function ThreatBuilder({ start, wargear, ruinActions, send, onSaved, onCancel }: ThreatBuilderProps) {
  const [draft, setDraft] = useState(start.draft);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fields = useFieldErrors("t-");

  // CREATE or SAVE: the server's own schema first, so a missing NAME or Keyword is marked on its field.
  const save = async () => {
    setError(null);
    if (!fields.check(CustomThreatData, draft)) return;
    setBusy(true);
    const r = await send({ type: "threat.save", ...(start.slug ? { slug: start.slug } : {}), data: draft });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    const slug = r.slug ?? start.slug;
    if (slug) onSaved(customThreatId(slug));
  };

  return (
    <div className="panel pad stack">
      <ThreatForm draft={draft} wargear={wargear} ruinActions={ruinActions} fields={fields} onChange={setDraft} />
      {/* A refusal inside a list (an ability, a weapon) has no field of its own: it says where. */}
      {(error ?? fields.elsewhere(["name", "keywords"])) && (
        <div className="red">! {error ?? fields.elsewhere(["name", "keywords"])}</div>
      )}
      {/* A stat block carries at least one Keyword (Core p.323), so the server would refuse one without. */}
      {!draft.keywords.length && <div className="dim">A threat needs at least one keyword.</div>}
      <div className="keys">
        <button className="btn primary" aria-busy={busy} disabled={busy} onClick={save}>
          {start.slug ? "SAVE THREAT" : "CREATE THREAT"}
        </button>
        {/* Not mid-save: the save would still land, and a scene would still add it after CANCEL. */}
        <button className="btn" disabled={busy} onClick={onCancel}>
          CANCEL
        </button>
      </div>
    </div>
  );
}
