"use client";
import { createContext, use, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";

import { nameLinker, type Codex, type MentionKind, type MentionName } from "@wg/shared";

import { Peek } from "./components/peek/peek";
import { KIND_LABEL } from "./constants";

// A codex entry a mention can point at; `row` is the snapshot row the peek reads its fields from.
export type MentionEntry = MentionName & { hidden: boolean; row: Readonly<Record<string, unknown>> };

type Mentions = {
  entries: MentionEntry[]; // every linkable entry, for the editor's @ picker
  get: (kind: MentionKind, id: string) => MentionEntry | undefined;
  link: (args: { text: string; self?: string }) => ({ text: string } | MentionEntry)[];
  missing: string; // what a token shows when this seat has no such entry
  open: (entry: MentionEntry) => void;
  edit?: (kind: MentionKind, id: string) => void; // straight into the editor (a quick add); GM seats only
};

const MentionsContext = createContext<Mentions | null>(null);

type MentionsProviderProps = {
  codex: Codex;
  missing: string;
  onGoTo?: (entry: MentionEntry) => void; // the GM's GO TO under a peek (issue #198): the entry's own row
  // The GM's EDIT under a peek: the entry's CODEX form in the same dialog, so a fix never leaves the screen.
  editor?: (entry: MentionEntry, done: () => void) => ReactNode;
  children: ReactNode;
};

// Codex mentions (issue #200, docs/campaign-model.md §Mentions) over the snapshot this seat holds: the GM's whole codex,
// or a phone's toPlayerCodex, so a phone can only link what it's already been shown. One dialog peeks at an entry over
// the current screen, as RulesProvider does for a rule.
export function MentionsProvider({ codex, missing, onGoTo, editor, children }: MentionsProviderProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  // Only the key: the peek reads the entry from the live snapshot, so an edit on another screen shows up in it.
  const [shown, setShown] = useState<{ kind: MentionKind; id: string } | null>(null);
  // Editing from the peek's EDIT goes back to the peek after DONE; editing opened directly (a list's name, a + NEW)
  // closes with it.
  const [editing, setEditing] = useState<false | "peek" | "direct" | "done">(false);
  // External system: the <dialog>. A direct edit's DONE closes it before the peek would paint.
  useLayoutEffect(() => {
    if (editing === "done") dialog.current?.close();
  }, [editing]);
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
        flushSync(() => {
          setShown({ kind: entry.kind, id: entry.id });
          setEditing(false);
        });
        if (!dialog.current?.open) dialog.current?.showModal();
      },
      ...(editor && {
        edit: (kind: MentionKind, id: string) => {
          flushSync(() => {
            setShown({ kind, id });
            setEditing("direct");
          });
          if (!dialog.current?.open) dialog.current?.showModal();
        },
      }),
    }),
    [entries, byId, missing, editor],
  );
  const entry = shown && byId.get(`${shown.kind}:${shown.id}`);

  // GO TO: close the peek and leave for the entry's row.
  const handleGoTo = () => {
    if (!entry || !onGoTo) return;
    dialog.current?.close();
    onGoTo(entry);
  };

  return (
    <MentionsContext value={value}>
      {children}
      {/* While editing, a stray tap outside or Esc mustn't drop the draft: only the form's SAVE or CANCEL leave it. */}
      <dialog
        ref={dialog}
        className={editing ? "rule-dialog sheet" : "rule-dialog"}
        aria-label={entry ? `${editing ? "Edit" : "Codex"}: ${entry.name}` : "Codex"}
        onClick={(e) => !editing && e.target === e.currentTarget && e.currentTarget.close()}
        onCancel={(e) => {
          if (editing) e.preventDefault();
        }}
        onClose={() => setEditing(false)}
      >
        {editing && entry && editor ? (
          // A sheet from the right: × leaves without saving, and DONE goes back to the peek so the GM rereads it.
          <div className="stack pad">
            <div className="sheet-head">
              <span className="label">{KIND_LABEL[entry.kind]}</span>
              <button className="btn sq" aria-label="Close without saving" onClick={() => dialog.current?.close()}>
                ×
              </button>
            </div>
            {editor(entry, () => setEditing(editing === "direct" ? "done" : false))}
          </div>
        ) : (
          <div className="stack pad">
            {entry ? <Peek key={`${entry.kind}:${entry.id}`} entry={entry} /> : <p className="dim">{missing}</p>}
            <form method="dialog" className="keys" style={{ paddingTop: 0 }}>
              <button className="btn primary">CLOSE</button>
              {/* A scene's editor is its STORY page (GO TO), not a codex form. */}
              {entry && editor && entry.kind !== "scene" && (
                <button type="button" className="btn" onClick={() => setEditing("peek")}>
                  EDIT
                </button>
              )}
              {entry && onGoTo && (
                <button type="button" className="btn" onClick={handleGoTo}>
                  GO TO
                </button>
              )}
            </form>
          </div>
        )}
      </dialog>
    </MentionsContext>
  );
}

export function useMentions(): Mentions {
  const mentions = use(MentionsContext);
  if (!mentions) throw new Error("useMentions outside MentionsProvider");
  return mentions;
}
