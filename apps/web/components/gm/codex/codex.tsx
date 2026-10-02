"use client";
import { useState, type MouseEvent } from "react";

import type { ActionInput, Character, Codex } from "@wg/shared";

import { Refusal } from "@/components/ui/refusal/refusal";
import type { Send } from "@/hooks/use-table/use-table";

import { CodexEditor } from "./components/codex-editor/codex-editor";
import { GM_ONLY_FIELDS } from "./components/codex-editor/constants";
import { CODEX_KINDS, CODEX_KIND_KEYS, type CodexKind } from "./constants";
import type { Row } from "./types";

type CodexViewProps = { codex: Codex; characters: Character[]; send: Send; initialKind?: CodexKind };

const rowsFor = (kind: CodexKind, c: Codex): Row[] => c[CODEX_KINDS[kind].collection] as unknown as Row[];
const titleOf = (r: Row) => String(r.name ?? r.title ?? "?");
const stripId = ({ id, revealedAt, ...rest }: Row) => rest;
// A button inside <summary> would also open or close the row; run its action only.
const only = (fn: () => void) => (e: MouseEvent) => {
  e.preventDefault();
  fn();
};

export function CodexView({ codex, characters, send, initialKind = "npc" }: CodexViewProps) {
  const [kind, setKind] = useState<CodexKind>(initialKind);
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rows = rowsFor(kind, codex);

  // Kind tab: switch lists and close any open editor.
  const pickKind = (k: CodexKind) => {
    setKind(k);
    setEditing(null);
  };

  // REVEALED / HIDDEN chip: flips whether players see the entry.
  const toggleRevealed = async (r: Row) => {
    const result = await send({
      type: "codex.save",
      kind,
      id: r.id,
      data: { ...stripId(r), revealed: !r.revealed },
    } as ActionInput);
    setError(result.ok ? null : result.error);
  };

  return (
    <div className="stack">
      <nav className="tabs sub" role="tablist" style={{ padding: "0 16px" }}>
        {CODEX_KIND_KEYS.map((k) => (
          <button key={k} role="tab" className="tab" aria-selected={kind === k} onClick={() => pickKind(k)}>
            {k.toUpperCase()}S
          </button>
        ))}
      </nav>
      <div className="pad stack">
        {editing ? (
          <CodexEditor
            key={editing === "new" ? "new" : editing.id}
            kind={kind}
            codex={codex}
            characters={characters}
            send={send}
            row={editing === "new" ? null : editing}
            onDone={() => setEditing(null)}
          />
        ) : (
          <>
            <div>
              <button className="btn primary" onClick={() => setEditing("new")}>
                + NEW {kind.toUpperCase()}
              </button>
            </div>
            <div className="list">
              {rows.length === 0 && <div className="dim">Nothing recorded yet.</div>}
              {rows.map((r) => (
                <details key={r.id} className="item">
                  <summary className="item-head">
                    <b style={{ flex: 1 }}>{titleOf(r).toUpperCase()}</b>
                    {"revealed" in r && (
                      <button
                        className="btn sm"
                        style={{ color: r.revealed ? "var(--ink)" : "var(--red)" }}
                        onClick={only(() => toggleRevealed(r))}
                      >
                        {r.revealed ? "REVEALED" : "HIDDEN"}
                      </button>
                    )}
                    <button className="btn sm" onClick={only(() => setEditing(r))}>
                      EDIT
                    </button>
                  </summary>
                  {CODEX_KINDS[kind].read.map(([key, label]) =>
                    r[key] ? (
                      <div key={key} className={GM_ONLY_FIELDS.has(key) ? "field plate" : "field"}>
                        <span className="label">{label}</span>
                        <pre className="text">{String(r[key])}</pre>
                      </div>
                    ) : null,
                  )}
                </details>
              ))}
            </div>
          </>
        )}
      </div>
      <Refusal error={error} onDismiss={() => setError(null)} />
    </div>
  );
}
