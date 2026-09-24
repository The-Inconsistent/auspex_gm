"use client";
import { useState } from "react";

import type { ActionInput, Codex } from "@wg/shared";

import { Refusal } from "@/components/ui/refusal/refusal";
import type { Send } from "@/hooks/use-table/use-table";

import { CodexEditor } from "./components/codex-editor/codex-editor";
import { CODEX_KINDS, CODEX_KIND_KEYS, type CodexKind } from "./constants";
import type { Row } from "./types";

type CodexViewProps = { codex: Codex; send: Send };

const rowsFor = (kind: CodexKind, c: Codex): Row[] => c[CODEX_KINDS[kind].collection] as unknown as Row[];
const titleOf = (r: Row) => String(r.name ?? r.title ?? "?");
const stripId = ({ id, revealedAt, ...rest }: Row) => rest;

export function CodexView({ codex, send }: CodexViewProps) {
  const [kind, setKind] = useState<CodexKind>("npc");
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
    const result = await send({ type: "codex.save", kind, id: r.id, data: { ...stripId(r), revealed: !r.revealed } } as ActionInput);
    setError(result.ok ? null : result.error);
  };

  return (
    <div className="stack">
      <nav className="tabs" role="tablist">
        {CODEX_KIND_KEYS.map((k) => (
          <button key={k} role="tab" className="tab" aria-selected={kind === k} onClick={() => pickKind(k)}>{k.toUpperCase()}S</button>
        ))}
      </nav>
      <div className="pad stack">
        {editing ? (
          <CodexEditor key={editing === "new" ? "new" : editing.id} kind={kind} codex={codex} send={send} row={editing === "new" ? null : editing} onDone={() => setEditing(null)} />
        ) : (
          <>
            <div><button className="btn primary" onClick={() => setEditing("new")}>+ NEW {kind.toUpperCase()}</button></div>
            <div className="list">
              {rows.length === 0 && <div className="dim">Nothing recorded yet.</div>}
              {rows.map((r) => (
                <div key={r.id} className="item" style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <b style={{ flex: 1 }}>{titleOf(r).toUpperCase()}</b>
                  {"revealed" in r && (
                    <button className="btn sm" style={{ color: r.revealed ? "var(--fg)" : "var(--red)" }} onClick={() => toggleRevealed(r)}>
                      {r.revealed ? "REVEALED" : "HIDDEN"}
                    </button>
                  )}
                  <button className="btn sm" onClick={() => setEditing(r)}>EDIT</button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      <Refusal error={error} onDismiss={() => setError(null)} />
    </div>
  );
}
