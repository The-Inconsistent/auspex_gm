"use client";
import { useMemo, useState, type MouseEvent } from "react";

import type { ActionInput, Character, Codex, FactionPresets, Threat } from "@wg/shared";

import { AttitudeChip } from "@/components/ui/attitude-chip/attitude-chip";
import { Refusal } from "@/components/ui/refusal/refusal";
import type { Send } from "@/hooks/use-table/use-table";

import { CodexEditor } from "./components/codex-editor/codex-editor";
import { GM_ONLY_FIELDS } from "./components/codex-editor/constants";
import { FactionCard } from "./components/faction-card/faction-card";
import { FactionPicker } from "./components/faction-picker/faction-picker";
import { NpcCard } from "./components/npc-card/npc-card";
import { CODEX_KINDS, CODEX_KIND_KEYS, type CodexKind } from "./constants";
import type { Row } from "./types";

type CodexViewProps = {
  codex: Codex;
  characters: Character[];
  send: Send;
  initialKind?: CodexKind;
  factionPresets: FactionPresets;
  bestiary: Threat[];
  tier: number;
  players: number; // Scaling Threats adds the number of players for an Adversary (Core p.326)
};

const rowsFor = (kind: CodexKind, c: Codex): Row[] => c[CODEX_KINDS[kind].collection] as unknown as Row[];
const titleOf = (r: Row) => String(r.name ?? r.title ?? "?");
const stripId = ({ id, revealedAt, ...rest }: Row) => rest;
// A button inside <summary> would also open or close the row; run its action only.
const only = (fn: () => void) => (e: MouseEvent) => {
  e.preventDefault();
  fn();
};

export function CodexView({
  codex,
  characters,
  send,
  initialKind = "npc",
  factionPresets,
  bestiary,
  tier,
  players,
}: CodexViewProps) {
  const [kind, setKind] = useState<CodexKind>(initialKind);
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rows = rowsFor(kind, codex);
  const factionById = useMemo(() => new Map(codex.factions.map((f) => [f.id, f])), [codex.factions]);
  const npcById = useMemo(() => new Map(codex.npcs.map((n) => [n.id, n])), [codex.npcs]);

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
            keywords={factionPresets.keywords}
            bestiary={bestiary}
            tier={tier}
            onDone={() => setEditing(null)}
          />
        ) : (
          <>
            <div>
              <button className="btn primary" onClick={() => setEditing("new")}>
                + NEW {kind.toUpperCase()}
              </button>
            </div>
            {kind === "faction" && factionPresets.presets.length > 0 && (
              <FactionPicker
                presets={factionPresets.presets}
                factions={codex.factions}
                send={send}
                onError={setError}
              />
            )}
            <div className="list">
              {rows.length === 0 && <div className="dim">Nothing recorded yet.</div>}
              {rows.map((r) => {
                const npc = kind === "npc" ? npcById.get(r.id) : undefined;
                return (
                  <details key={r.id} className="item">
                    <summary className="item-head">
                      <b style={{ flex: 1 }}>{titleOf(r).toUpperCase()}</b>
                      {npc && <AttitudeChip attitude={npc.attitude} />}
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
                    {kind === "faction" && factionById.get(r.id) && (
                      <FactionCard faction={factionById.get(r.id)!} npcs={codex.npcs} />
                    )}
                    {CODEX_KINDS[kind].read.map(([key, label]) =>
                      r[key] ? (
                        <div key={key} className={GM_ONLY_FIELDS.has(key) ? "field plate" : "field"}>
                          <span className="label">{label}</span>
                          <pre className="text">{String(r[key])}</pre>
                        </div>
                      ) : null,
                    )}
                    {npc && <NpcCard npc={npc} bestiary={bestiary} tier={tier} players={players} />}
                  </details>
                );
              })}
            </div>
          </>
        )}
      </div>
      <Refusal error={error} onDismiss={() => setError(null)} />
    </div>
  );
}
