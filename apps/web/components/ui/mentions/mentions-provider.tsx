"use client";
import { createContext, use, useMemo, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";

import { nameLinker, type Codex, type MentionKind, type MentionName } from "@wg/shared";

import { Peek } from "./components/peek/peek";

// A codex entry a mention can point at; `row` is the snapshot row the peek reads its fields from.
export type MentionEntry = MentionName & { hidden: boolean; row: Readonly<Record<string, unknown>> };

type Mentions = {
  entries: MentionEntry[]; // every linkable entry, for the editor's @ picker
  get: (kind: MentionKind, id: string) => MentionEntry | undefined;
  link: (args: { text: string; self?: string }) => ({ text: string } | MentionEntry)[];
  missing: string; // what a token shows when this seat has no such entry
  open: (entry: MentionEntry) => void;
};

const MentionsContext = createContext<Mentions | null>(null);

type MentionsProviderProps = { codex: Codex; missing: string; children: ReactNode };

// Codex mentions (issue #200, docs/campaign-model.md §Mentions) over the snapshot this seat holds: the GM's whole codex,
// or a phone's toPlayerCodex, so a phone can only link what it's already been shown. One dialog peeks at an entry over
// the current screen, as RulesProvider does for a rule.
export function MentionsProvider({ codex, missing, children }: MentionsProviderProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  // Only the key: the peek reads the entry from the live snapshot, so an edit on another screen shows up in it.
  const [shown, setShown] = useState<{ kind: MentionKind; id: string } | null>(null);
  const entries = useMemo<MentionEntry[]>(
    () => [
      // In this order, so on a shared name an NPC wins the auto-link.
      ...codex.npcs.map((r) => ({ kind: "npc" as const, id: r.id, name: r.name, hidden: !r.revealed, row: r })),
      ...codex.locations.map((r) => ({
        kind: "location" as const,
        id: r.id,
        name: r.name,
        hidden: !r.revealed,
        row: r,
      })),
      ...codex.handouts.map((r) => ({
        kind: "handout" as const,
        id: r.id,
        name: r.title,
        hidden: !r.revealed,
        row: r,
      })),
      ...codex.factions.map((r) => ({ kind: "faction" as const, id: r.id, name: r.name, hidden: false, row: r })),
      ...codex.items.map((r) => ({ kind: "item" as const, id: r.id, name: r.name, hidden: false, row: r })),
      ...codex.adventures.flatMap((a) =>
        a.beats.map((r) => ({ kind: "scene" as const, id: r.id, name: r.title, hidden: false, row: r })),
      ),
    ],
    [codex],
  );
  const byId = useMemo(() => new Map(entries.map((e) => [`${e.kind}:${e.id}`, e])), [entries]);
  const value = useMemo<Mentions>(
    () => ({
      entries,
      get: (kind, id) => byId.get(`${kind}:${id}`),
      link: nameLinker(entries),
      missing,
      open: (entry) => {
        // Render the entry before showModal() picks what to focus (see RulesProvider). A link inside the peek swaps
        // the entry in the dialog that's already open.
        flushSync(() => setShown({ kind: entry.kind, id: entry.id }));
        if (!dialog.current?.open) dialog.current?.showModal();
      },
    }),
    [entries, byId, missing],
  );
  const entry = shown && byId.get(`${shown.kind}:${shown.id}`);

  return (
    <MentionsContext value={value}>
      {children}
      <dialog
        ref={dialog}
        className="rule-dialog"
        aria-label={entry ? `Codex: ${entry.name}` : "Codex"}
        onClick={(e) => e.target === e.currentTarget && e.currentTarget.close()}
      >
        <div className="stack pad">
          {entry ? <Peek key={`${entry.kind}:${entry.id}`} entry={entry} /> : <p className="dim">{missing}</p>}
          <form method="dialog">
            <button className="btn primary">CLOSE</button>
          </form>
        </div>
      </dialog>
    </MentionsContext>
  );
}

export function useMentions(): Mentions {
  const mentions = use(MentionsContext);
  if (!mentions) throw new Error("useMentions outside MentionsProvider");
  return mentions;
}
