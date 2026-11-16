"use client";
import { useRef, useState } from "react";

import { ConfirmAction } from "@/components/ui/confirm-action/confirm-action";
import type { Send } from "@/hooks/use-table/use-table";

import type { TypedKind } from "../../constants";

export type InCampaignRow = {
  id: string;
  name: string;
  depth: number;
  inside: string[]; // the ids under it (a place's subtree, deepest first), removed with it
};

type InCampaignProps = {
  kind: TypedKind;
  rows: InCampaignRow[];
  empty: string;
  editing: string | null; // the row whose writing panel is open
  onEdit: (id: string) => void;
  send: Send;
  onError: (error: string | null) => void;
};

// IN THIS CAMPAIGN: what SETTING or FACTIONS has added so far. A name opens its writing panel; REMOVE takes a wrong pick
// or a double tap back without leaving the wizard for CODEX.
export function InCampaign({ kind, rows, empty, editing, onEdit, send, onError }: InCampaignProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const list = useRef<HTMLDivElement>(null);

  // REMOVE: a place goes with the places inside it (deleting only the parent would leave them at the top level), the
  // deepest first; the first refusal stops it.
  const remove = async (row: InCampaignRow) => {
    setBusy(row.id);
    // The list keeps its height: a shorter page near its foot makes the browser pull the view up (to the top, on a
    // short page), and the next row's REMOVE should land under the same finger instead.
    if (list.current) list.current.style.minHeight = `${list.current.offsetHeight}px`;
    for (const id of [...row.inside, row.id]) {
      const r = await send({ type: "codex.delete", kind, id });
      if (!r.ok) {
        setBusy(null);
        return onError(r.error);
      }
    }
    setBusy(null);
    onError(null);
  };

  return (
    <div className="field">
      <span className="label">IN THIS CAMPAIGN · {rows.length}</span>
      {rows.length === 0 ? <i className="dim">{empty}</i> : <i className="dim">Tap a name to write about it.</i>}
      <div className="list" ref={list}>
        {rows.map((row) => (
          <div key={row.id} className="ed-pick" style={{ paddingLeft: row.depth * 16 }}>
            {/* Tap a name to write it (the panel beside the list). */}
            <button
              type="button"
              className="ed-name"
              aria-pressed={editing === row.id}
              style={editing === row.id ? { color: "var(--red)" } : undefined}
              onClick={() => onEdit(row.id)}
            >
              {row.depth ? "› " : ""}
              {row.name}
            </button>
            <span className="leader" aria-hidden="true" />
            <ConfirmAction
              label="REMOVE"
              prompt={`Remove ${row.name}${row.inside.length ? ` and the ${row.inside.length} inside it` : ""}?`}
              busy={busy === row.id}
              disabled={busy !== null}
              onConfirm={() => remove(row)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
