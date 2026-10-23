import { useMemo, useState } from "react";

import { flatTree, placeTree, type Codex } from "@wg/shared";

import { AttitudeChip } from "@/components/ui/attitude-chip/attitude-chip";
import { CodexSearch } from "@/components/ui/codex-search/codex-search";
import { isFresh } from "@/lib/seen/seen";

import { ARCHIVE_KINDS, type ArchiveKind } from "../../constants";
import { asEntries, entryName, subline, type IntelEntry } from "../../utils";
import { MissionLog, Recaps } from "../mission/mission";

type ArchiveProps = { codex: Codex; fresh: ReadonlySet<string>; onOpen: (e: IntelEntry) => void };

// ARCHIVE: everything this phone has been shown, by kind. The codex search (issue #198) sits on top; its hits replace
// the list below while it holds text.
export function Archive({ codex, fresh, onOpen }: ArchiveProps) {
  const parents = useMemo(() => new Map(codex.locations.map((l) => [l.id, l.name])), [codex.locations]);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<ArchiveKind>("npc");
  const counts: Record<ArchiveKind, number> = {
    npc: codex.npcs.length,
    location: codex.locations.length,
    handout: codex.handouts.length,
    mission: codex.adventures.length,
    recap: codex.sessions.filter((s) => s.recap).length,
  };
  // Nested as the GM files them (issue #50); a place under a hidden one comes top-level (toPlayerCodex).
  const rows: { e: IntelEntry; depth: number }[] =
    kind === "location"
      ? flatTree(placeTree(codex.locations)).map(({ row, depth }) => ({ e: { kind: "location", entry: row }, depth }))
      : kind === "npc"
        ? asEntries.npcs(codex).map((e) => ({ e, depth: 0 }))
        : kind === "handout"
          ? asEntries.handouts(codex).map((e) => ({ e, depth: 0 }))
          : [];
  return (
    <>
      <CodexSearch query={query} onQuery={setQuery} />
      {!query.trim() && (
        <>
          <div className="pl-kinds" role="group" aria-label="Kinds">
            {ARCHIVE_KINDS.map(([k, label]) => (
              <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}>
                {label} <span className="mono">{counts[k]}</span>
              </button>
            ))}
          </div>
          {kind === "mission" && <MissionLog codex={codex} heading={false} />}
          {kind === "recap" && <Recaps codex={codex} />}
          {rows.length > 0 && (
            <div className="pl-ents">
              {rows.map(({ e, depth }) => (
                <button
                  key={`${e.kind}:${e.entry.id}`}
                  type="button"
                  className="pl-ent"
                  style={{ paddingLeft: 10 + depth * 18 }}
                  onClick={() => onOpen(e)}
                >
                  <span className="pl-ent-text">
                    <span className="pl-ent-name">
                      {entryName(e)}
                      {isFresh({ fresh, kind: e.kind, entry: e.entry }) && <span className="chip warn">NEW</span>}
                    </span>
                    {subline(e, parents) && <span className="pl-ent-sub">{subline(e, parents)}</span>}
                  </span>
                  {e.kind === "npc" && <AttitudeChip attitude={e.entry.attitude} />}
                </button>
              ))}
            </div>
          )}
          {counts[kind] === 0 && <div className="dim">Nothing here yet.</div>}
        </>
      )}
    </>
  );
}
