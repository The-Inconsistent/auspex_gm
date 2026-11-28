"use client";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useMemo, useState, type MouseEvent } from "react";

import {
  parseCite,
  placeTree,
  type ActionInput,
  type Character,
  type Codex,
  type FactionPresets,
  type FlavourTable,
  type HazardTable,
  type LootTable,
  type RelicCreator,
  type SpaceHulkGenerator,
  type NpcPreset,
  type PoolPresetTable,
  type PlaceSummary,
  type PlaceNode,
  type Threat,
  type Wargear,
} from "@wg/shared";

import { AttitudeChip } from "@/components/ui/attitude-chip/attitude-chip";
import { CodexPicture } from "@/components/ui/codex-picture/codex-picture";
import { CodexSearch } from "@/components/ui/codex-search/codex-search";
import { HandoutDoc } from "@/components/ui/handout-doc/handout-doc";
import { holderOf, ItemGive } from "@/components/ui/item-give/item-give";
import { Mentions } from "@/components/ui/mentions/mentions";
import { NpcGive } from "@/components/ui/npc-give/npc-give";
import { PageCite } from "@/components/ui/page-cite/page-cite";
import { usePrint } from "@/components/ui/print-dialog/print-dialog";
import { PrintPick } from "@/components/ui/print-pick/print-pick";
import { Refusal } from "@/components/ui/refusal/refusal";
import type { Send } from "@/hooks/use-table/use-table";
import { FIGHTS_AS_LABEL } from "@/lib/ally/ally";
import { revealAnchor } from "@/lib/anchor/anchor";
import { gmPath } from "@/lib/gm-path/gm-path";
import { toggleIn } from "@/lib/toggle-set/toggle-set";

import { CodexEditor } from "./components/codex-editor/codex-editor";
import { GM_ONLY_FIELDS } from "./components/codex-editor/constants";
import { FactionCard } from "./components/faction-card/faction-card";
import { FactionPicker } from "./components/faction-picker/faction-picker";
import { NpcCard } from "./components/npc-card/npc-card";
import { NpcPicker } from "./components/npc-picker/npc-picker";
import { HulkGenerator } from "./components/hulk-generator/hulk-generator";
import { ItemCard } from "./components/item-card/item-card";
import { LootPicker } from "./components/loot-picker/loot-picker";
import { RelicWizard } from "./components/relic-wizard/relic-wizard";
import { PlacePicker } from "./components/place-picker/place-picker";
import { ThreatEditor } from "./components/threat-editor/threat-editor";
import { CODEX_KINDS, CODEX_KIND_KEYS, type CodexKind } from "./constants";
import type { Row } from "./types";

type Place = Row & { parentId: string | null };

type CodexViewProps = {
  campaignId: string;
  codex: Codex;
  characters: Character[];
  send: Send;
  // From the URL (/codex/<kinds>/<entry>/edit): the sub-tab, the entry opened on it, the one being edited ("new" for a
  // new one) and the custom threat being edited.
  sub: SubTab;
  openId?: string;
  editId?: string;
  threatSlug?: string;
  factionPresets: FactionPresets;
  npcPresets: NpcPreset[];
  places: PlaceSummary[]; // the books' places, for ADD FROM BOOK (issue #50)
  flavour: FlavourTable[];
  hazards: HazardTable[]; // the books' hazard tables, for a place's list (issue #49)
  spaceHulk: SpaceHulkGenerator | null; // RR1 pp.6–11, for the SPACE HULK GENERATOR (issue #50 step 8)
  bestiary: Threat[];
  tier: number;
  players: number; // Scaling Threats adds the number of players for an Adversary (Core p.326)
  wargear: Wargear[]; // the catalogue: a custom threat's weapons (issue #43), an item's NAME and profile (issue #51)
  ruinActions: PoolPresetTable | null; // Threat Assessment p.7, for a custom threat's RUIN abilities (issue #43)
  loot: LootTable[]; // the books' loot tables, for FROM LOOT TABLE
  relics: RelicCreator | null; // RR2 pp.12–19, for the HOLY RELIC CREATOR
};

// THREATS isn't a codex kind - it has its own action and no revealed flag - so the sub-tabs are the kinds plus it.
export type SubTab = CodexKind | "threats";

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
  campaignId,
  codex,
  characters,
  send,
  sub,
  openId,
  editId,
  threatSlug,
  factionPresets,
  npcPresets,
  places,
  flavour,
  hazards,
  spaceHulk,
  bestiary,
  tier,
  players,
  wargear,
  ruinActions,
  loot,
  relics,
}: CodexViewProps) {
  const router = useRouter();
  const [query, setQuery] = useState(""); // the codex search (issue #198): its hits replace the sub-tab's list
  const [error, setError] = useState<string | null>(null);
  const kind: CodexKind = sub === "threats" ? "npc" : sub;
  const rows = rowsFor(kind, codex);
  const editing: Row | "new" | null = editId === "new" ? "new" : (rows.find((r) => r.id === editId) ?? null);
  // A link to an entry that's gone (deleted, or another campaign's): back to the list.
  const lost = (!!editId && !editing) || (!!openId && !rows.some((r) => r.id === openId));
  // External system: the browser's URL, through Next's router.
  useEffect(() => {
    if (lost) router.replace(gmPath.codex({ campaignId, kind }));
  }, [lost, router, campaignId, kind]);
  const factionById = useMemo(() => new Map(codex.factions.map((f) => [f.id, f])), [codex.factions]);
  const npcById = useMemo(() => new Map(codex.npcs.map((n) => [n.id, n])), [codex.npcs]);
  const itemById = useMemo(() => new Map(codex.items.map((i) => [i.id, i])), [codex.items]);
  const catalogue = useMemo(() => new Map(wargear.map((w) => [w.id, w])), [wargear]);
  const { print } = usePrint();
  // Items (#203) and handouts (#204) ticked for PRINT N; ids are unique across kinds, and a deleted one drops out.
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const itemsToPrint = codex.items.filter((i) => picked.has(i.id)).map((i) => i.id);
  const handoutsToPrint = codex.handouts.filter((h) => picked.has(h.id)).map((h) => h.id);

  // Sub-tab: another list's URL (which closes any open editor), and the search cleared.
  const pickKind = (k: SubTab) => {
    setQuery("");
    router.push(k === "threats" ? gmPath.threats({ campaignId }) : gmPath.codex({ campaignId, kind: k }));
  };

  // EDIT on a row: its editor's URL.
  const editEntry = (r: Row) => router.push(gmPath.codex({ campaignId, kind, entryId: r.id, edit: true }));

  // The editor is done (SAVE, CANCEL, DELETE): the entry's row, or the list after a new one. It takes the editor's place
  // in the history, so Back doesn't reopen it; a deleted entry's row is gone, and the lost check above goes to the list.
  const closeEditor = () =>
    router.replace(gmPath.codex({ campaignId, kind, entryId: editing === "new" ? undefined : editing?.id }));

  // A custom threat's EDIT opens its URL; closing one (or a link to one that's gone) takes the editor's place.
  const editThreat = (slug: string | null) =>
    slug ? router.push(gmPath.threats({ campaignId, slug })) : router.replace(gmPath.threats({ campaignId }));

  // Saves the whole entry with one flag changed.
  const saveWith = async (r: Row, change: Partial<Row>) => {
    const result = await send({
      type: "codex.save",
      kind,
      id: r.id,
      data: { ...stripId(r), ...change },
    } as ActionInput);
    setError(result.ok ? null : result.error);
  };
  // REVEALED / HIDDEN chip: flips whether players see the entry.
  const toggleRevealed = (r: Row) => saveWith(r, { revealed: !r.revealed });
  // PICTURE SHOWN / HELD BACK (issue #199): flips whether players see its picture, a reveal of its own.
  const togglePicture = (r: Row) => saveWith(r, { imageRevealed: !r.imageRevealed });

  // LOCATIONS is a tree (issue #50): a place's "N INSIDE" button folds the places inside it.
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set());
  // An entry's own URL (a peek's GO TO, issue #198, or back from its editor) draws every row first: the search is
  // cleared and the places unfolded, while rendering, so the row is there for the reveal below.
  const [shownId, setShownId] = useState(openId);
  if (openId !== shownId) {
    setShownId(openId);
    if (openId) {
      setQuery("");
      setFolded(new Set());
    }
  }
  // Then its row, opened and scrolled to. External system: the DOM.
  useEffect(() => {
    if (openId) revealAnchor(`entry-${openId}`, "start"); // start: a long row's title stays on screen
  }, [openId]);
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
    const item = kind === "item" ? itemById.get(r.id) : undefined;
    const handout = kind === "handout" ? codex.handouts.find((h) => h.id === r.id) : undefined;
    const holder = item && holderOf(item, { codex, characters });
    const open = !folded.has(r.id);
    return (
      <details key={r.id} id={`entry-${r.id}`} className="item">
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
          {npc && <span className="chip ally">{FIGHTS_AS_LABEL[npc.fightsAs]}</span>}
          {npc?.followsId && (
            <span className="chip ally">
              FOLLOWS {(characters.find((c) => c.id === npc.followsId)?.name ?? "an Agent").toUpperCase()}
            </span>
          )}
          {item && !item.wargearId && <span className="chip">CUSTOM</span>}
          {holder && (
            <span className="dim">
              {holder.label} <span style={{ color: "var(--ink)" }}>{holder.name}</span>
            </span>
          )}
          {item && (
            <span onClick={(e) => e.preventDefault()}>
              <ItemGive item={item} characters={characters} send={send} onError={setError} />
            </span>
          )}
          {(item || handout) && (
            <PrintPick name={titleOf(r)} on={picked.has(r.id)} onToggle={() => setPicked((p) => toggleIn(p, r.id))} />
          )}
          {"revealed" in r && (
            <button
              className="btn sm"
              style={{ color: r.revealed ? "var(--ink)" : "var(--red)" }}
              onClick={only(() => toggleRevealed(r))}
            >
              {r.revealed ? "REVEALED" : "HIDDEN"}
            </button>
          )}
          <button className="btn sm" onClick={only(() => editEntry(r))}>
            EDIT
          </button>
        </summary>
        {typeof r.imageId === "string" && (
          // A handout's picture is drawn inside its prop, below; the toggle sits here for all three kinds.
          <div className="field">
            {!handout && <CodexPicture imageId={r.imageId} alt={titleOf(r)} held={!r.imageRevealed} />}
            <span>
              <button
                className="btn sm"
                style={{ color: r.imageRevealed ? "var(--ink)" : "var(--red)" }}
                onClick={() => togglePicture(r)}
              >
                {r.imageRevealed ? "PICTURE SHOWN" : "PICTURE HELD BACK"}
              </button>
            </span>
          </div>
        )}
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
                  <pre className="text">
                    <Mentions text={citeOf(String(r[key]))!.rest} self={r.id} />
                  </pre>
                </>
              ) : (
                <pre className="text">
                  <Mentions text={String(r[key])} self={r.id} />
                </pre>
              )}
            </div>
          ) : null,
        )}
        {handout && <HandoutDoc handout={handout} />}
        {item && <ItemCard item={item} entry={item.wargearId ? catalogue.get(item.wargearId) : undefined} />}
        {npc && (
          <div className="field">
            <span className="label">FOLLOWER</span>
            <NpcGive npc={npc} characters={characters} send={send} onError={setError} />
          </div>
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
          <button key={k} role="tab" className="tab" aria-selected={sub === k} onClick={() => pickKind(k)}>
            {k.toUpperCase()}S
          </button>
        ))}
        <button role="tab" className="tab" aria-selected={sub === "threats"} onClick={() => pickKind("threats")}>
          THREATS
        </button>
      </nav>
      <div className="pad stack">
        {/* Over the lists only: hiding an open editor (THREATS keeps its own) would drop its draft. */}
        {sub !== "threats" && !editing && <CodexSearch query={query} onQuery={setQuery} />}
        {/* The search's hits replace the list, never an open editor (Back can land on one with a search typed). */}
        {query.trim() && !editing ? null : sub === "threats" ? (
          <ThreatEditor
            editSlug={threatSlug}
            onEdit={editThreat}
            customThreats={codex.customThreats}
            bestiary={bestiary}
            wargear={wargear}
            ruinActions={ruinActions}
            tier={tier}
            send={send}
          />
        ) : editing ? (
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
            wargear={wargear}
            onDone={closeEditor}
          />
        ) : (
          <>
            <div>
              <button className="btn primary" onClick={() => router.push(gmPath.newEntry(campaignId, kind))}>
                + NEW {kind.toUpperCase()}
              </button>
              {kind === "item" && (
                <span className="dim" style={{ float: "right" }}>
                  {itemsToPrint.length > 0 && (
                    <button
                      className="btn sm"
                      style={{ marginRight: 10 }}
                      onClick={() => print({ items: itemsToPrint })}
                    >
                      PRINT {itemsToPrint.length}
                    </button>
                  )}
                  {codex.items.length} ITEMS · {codex.items.filter((i) => i.givenTo).length} GIVEN
                </span>
              )}
              {kind === "handout" && handoutsToPrint.length > 0 && (
                <button
                  className="btn sm"
                  style={{ float: "right" }}
                  onClick={() => print({ handouts: handoutsToPrint })}
                >
                  PRINT {handoutsToPrint.length}
                </button>
              )}
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
            {kind === "item" && (
              <LootPicker tables={loot} wargear={wargear} tier={tier} send={send} onError={setError} />
            )}
            {kind === "item" && relics && (
              <RelicWizard creator={relics} wargear={wargear} tier={tier} send={send} onError={setError} />
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
