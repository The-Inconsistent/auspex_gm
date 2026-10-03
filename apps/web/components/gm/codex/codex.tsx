"use client";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Fragment, useMemo, useState, type MouseEvent } from "react";

import {
  parseCite,
  placeTree,
  type ActionInput,
  type Character,
  type Codex,
  type FactionPresets,
  type FlavourTable,
  type HazardTable,
  type SpaceHulkGenerator,
  type NpcPreset,
  type PlaceSummary,
  type PlaceNode,
  type Threat,
} from "@wg/shared";

import { AttitudeChip } from "@/components/ui/attitude-chip/attitude-chip";
import { PageCite } from "@/components/ui/page-cite/page-cite";
import { Refusal } from "@/components/ui/refusal/refusal";
import type { Send } from "@/hooks/use-table/use-table";

import { CodexEditor } from "./components/codex-editor/codex-editor";
import { GM_ONLY_FIELDS } from "./components/codex-editor/constants";
import { FactionCard } from "./components/faction-card/faction-card";
import { FactionPicker } from "./components/faction-picker/faction-picker";
import { NpcCard } from "./components/npc-card/npc-card";
import { NpcPicker } from "./components/npc-picker/npc-picker";
import { HulkGenerator } from "./components/hulk-generator/hulk-generator";
import { PlacePicker } from "./components/place-picker/place-picker";
import { CODEX_KINDS, CODEX_KIND_KEYS, type CodexKind } from "./constants";
import type { Row } from "./types";

type Place = Row & { parentId: string | null };

type CodexViewProps = {
  codex: Codex;
  characters: Character[];
  send: Send;
  initialKind?: CodexKind;
  factionPresets: FactionPresets;
  npcPresets: NpcPreset[];
  places: PlaceSummary[]; // the books' places, for ADD FROM BOOK (issue #50)
  flavour: FlavourTable[];
  hazards: HazardTable[]; // the books' hazard tables, for a place's list (issue #49)
  spaceHulk: SpaceHulkGenerator | null; // RR1 pp.6–11, for the SPACE HULK GENERATOR (issue #50 step 8)
  bestiary: Threat[];
  tier: number;
  players: number; // Scaling Threats adds the number of players for an Adversary (Core p.326)
};

const rowsFor = (kind: CodexKind, c: Codex): Row[] => c[CODEX_KINDS[kind].collection] as unknown as Row[];
const titleOf = (r: Row) => String(r.name ?? r.title ?? "?");
const stripId = ({ id, revealedAt, ...rest }: Row) => rest;
// A place copied from a book opens its GM NOTES with the cite (issue #50): split off, it becomes a link to the page.
const citeOf = (notes: string) => {
  const [first = "", ...rest] = notes.split("\n");
  return parseCite(first) ? { cite: first, rest: rest.join("\n").trim() } : null;
};
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
  npcPresets,
  places,
  flavour,
  hazards,
  spaceHulk,
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

  // LOCATIONS is a tree (issue #50): a place's "N INSIDE" button folds the places inside it.
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set());
  const tree = useMemo(() => (kind === "location" ? placeTree(rows as Place[]) : []), [kind, rows]);
  // N INSIDE: fold or unfold one place.
  const toggleFold = (id: string) =>
    setFolded((f) => (f.has(id) ? new Set([...f].filter((x) => x !== id)) : new Set([...f, id])));
  // COLLAPSE ALL: fold every place that holds another.
  const collapseAll = () => setFolded(new Set(codex.locations.flatMap((l) => (l.parentId ? [l.parentId] : []))));
  const nests = codex.locations.some((l) => l.parentId);

  // One entry: its head (title, chips, REVEALED / HIDDEN, EDIT) and, opened, what it records.
  const entry = (r: Row, node?: PlaceNode<Place>) => {
    const npc = kind === "npc" ? npcById.get(r.id) : undefined;
    const open = !folded.has(r.id);
    return (
      <details key={r.id} className="item">
        <summary className="item-head">
          <b style={{ flex: 1 }}>{titleOf(r).toUpperCase()}</b>
          {node && node.inside > 0 && (
            <button
              className="btn sm"
              aria-expanded={open}
              aria-label={`${open ? "Hide" : "Show"} the ${node.inside} places inside ${titleOf(r)}`}
              onClick={only(() => toggleFold(r.id))}
            >
              {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />} {node.inside} INSIDE
            </button>
          )}
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
              {key === "gmNotes" && kind === "location" && citeOf(String(r[key])) ? (
                <>
                  <span>
                    <PageCite cite={citeOf(String(r[key]))!.cite} />
                  </span>
                  <pre className="text">{citeOf(String(r[key]))!.rest}</pre>
                </>
              ) : (
                <pre className="text">{String(r[key])}</pre>
              )}
            </div>
          ) : null,
        )}
        {npc && (
          <NpcCard
            npc={npc}
            adventures={codex.adventures}
            bestiary={bestiary}
            tier={tier}
            players={players}
            send={send}
            onError={setError}
          />
        )}
      </details>
    );
  };

  // The places inside a place, indented under it unless folded.
  const branch = (nodes: PlaceNode<Place>[]) =>
    nodes.map((n) => (
      <Fragment key={n.row.id}>
        {entry(n.row, n)}
        {n.children.length > 0 && !folded.has(n.row.id) && (
          <div className="list place-branch">{branch(n.children)}</div>
        )}
      </Fragment>
    ));

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
            flavour={flavour}
            hazards={hazards}
            onDone={() => setEditing(null)}
          />
        ) : (
          <>
            <div>
              <button className="btn primary" onClick={() => setEditing("new")}>
                + NEW {kind.toUpperCase()}
              </button>
            </div>
            {kind === "location" && nests && (
              <div className="keys" style={{ paddingTop: 0 }}>
                <button className="btn sm" onClick={() => setFolded(new Set())}>
                  EXPAND ALL
                </button>
                <button className="btn sm" onClick={collapseAll}>
                  COLLAPSE ALL
                </button>
              </div>
            )}
            {kind === "npc" && npcPresets.length > 0 && (
              <NpcPicker presets={npcPresets} codex={codex} send={send} onError={setError} />
            )}
            {kind === "location" && places.length > 0 && (
              <PlacePicker places={places} codex={codex} send={send} onError={setError} />
            )}
            {kind === "location" && spaceHulk && (
              <HulkGenerator generator={spaceHulk} hazards={hazards} codex={codex} send={send} onError={setError} />
            )}
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
              {kind === "location" ? branch(tree) : rows.map((r) => entry(r))}
            </div>
          </>
        )}
      </div>
      <Refusal error={error} onDismiss={() => setError(null)} />
    </div>
  );
}
