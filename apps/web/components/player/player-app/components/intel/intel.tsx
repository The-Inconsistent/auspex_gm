"use client";
import { useRef, useState } from "react";
import { flushSync } from "react-dom";

import type { Codex, LiveState } from "@wg/shared";

import type { Send } from "@/hooks/use-table/use-table";
import { freshCount } from "@/lib/seen/seen";

import { Archive } from "./components/archive/archive";
import { EntrySheet } from "./components/entry-sheet/entry-sheet";
import { Inbox } from "./components/inbox/inbox";
import { ShowTable } from "./components/show-table/show-table";
import { INTEL_VIEWS, type IntelView } from "./constants";
import { findEntry, type EntryRef, type IntelEntry } from "./utils";

// fresh: keys not yet seen (lib/seen); markSeen stores them as seen.
type IntelProps = {
  codex: Codex;
  state: LiveState;
  characterId: string;
  send: Send;
  fresh: ReadonlySet<string>;
  markSeen: () => void;
};

// INTEL: an INBOX of what is new, an ARCHIVE of everything shown, one entry sheet over both, and SHOW THE TABLE.
export function Intel({ codex, state, characterId, send, fresh, markSeen }: IntelProps) {
  const [view, setView] = useState<IntelView>("INBOX");
  const [opened, setOpened] = useState<EntryRef | null>(null);
  const [showing, setShowing] = useState<IntelEntry | null>(null);
  const sheet = useRef<HTMLDialogElement>(null);
  const table = useRef<HTMLDivElement>(null);
  const newCount = freshCount(codex, fresh);

  // Render the entry before showModal() picks what to focus.
  const handleOpen = (e: IntelEntry) => {
    flushSync(() => setOpened({ kind: e.kind, id: e.entry.id }));
    if (!sheet.current?.open) sheet.current?.showModal();
  };
  // Fullscreen must be requested inside the tap, so render the view first, then ask. The sheet closes first: a modal
  // dialog sits above everything but a fullscreen element. A browser without it, or one that refuses, still shows the
  // view as a fixed full-screen overlay, so a refusal needs no message.
  const handleShow = async (e: IntelEntry) => {
    sheet.current?.close();
    flushSync(() => setShowing(e));
    if (!document.fullscreenEnabled) return;
    try {
      await table.current?.requestFullscreen();
    } catch {
      // refused (no user gesture left, a kiosk policy): the overlay is already up
    }
  };
  // CLOSE on the shown view: leave fullscreen if it is on, then drop the view.
  const handleCloseTable = async () => {
    setShowing(null);
    if (!document.fullscreenElement) return;
    try {
      await document.exitFullscreen();
    } catch {
      // already left (the browser's own Escape): nothing to undo
    }
  };

  return (
    <>
      <div className="pl-seg" role="group" aria-label="Intel views">
        {INTEL_VIEWS.map((v) => (
          <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}>
            {v}
            {v === "INBOX" && newCount > 0 && (
              <span className="mono pl-seg-count" aria-label={`${newCount} new`}>
                {newCount}
              </span>
            )}
          </button>
        ))}
      </div>
      {view === "INBOX" ? (
        <Inbox
          codex={codex}
          state={state}
          characterId={characterId}
          send={send}
          fresh={fresh}
          markSeen={markSeen}
          onOpen={handleOpen}
          onShow={handleShow}
        />
      ) : (
        <Archive codex={codex} fresh={fresh} onOpen={handleOpen} />
      )}
      <EntrySheet
        ref={sheet}
        codex={codex}
        entry={findEntry(codex, opened)}
        onClose={() => setOpened(null)}
        onShow={handleShow}
      />
      {showing && <ShowTable ref={table} entry={showing} onClose={handleCloseTable} />}
    </>
  );
}
