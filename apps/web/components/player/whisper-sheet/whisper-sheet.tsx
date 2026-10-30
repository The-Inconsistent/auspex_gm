"use client";
import { useEffect, useState } from "react";

import type { Whisper } from "@wg/shared";

import { TURN_VIBRATION } from "@/components/player/player-app/constants";
import type { Send } from "@/hooks/use-table/use-table";
import { useStoredSet } from "@/hooks/use-stored-set/use-stored-set";

import { WhisperReply } from "./components/whisper-reply/whisper-reply";

type WhisperSheetProps = { campaignId: string; characterId: string; whispers: Whisper[]; send: Send };

// A GM's whisper pops up over any tab, oldest unread first, with a buzz (rules-flow.md §11.164). CLOSE or a reply marks
// it read on this phone; INTEL's INBOX keeps the session's whispers to reread.
export function WhisperSheet({ campaignId, characterId, whispers, send }: WhisperSheetProps) {
  const [seen, save] = useStoredSet(`wg:whispers:${campaignId}`);
  // Also kept in memory, so CLOSE still works where storage is blocked.
  const [closed, setClosed] = useState<ReadonlySet<string>>(new Set());
  const unread = whispers.filter((w) => !seen?.has(w.id) && !closed.has(w.id));
  const current = unread.at(-1); // whispers come newest first

  // External system: the device vibration motor. Buzz once for each whisper as it pops up.
  const id = current?.id;
  useEffect(() => {
    if (id) navigator.vibrate?.(TURN_VIBRATION);
  }, [id]);

  if (!current) return null;

  // Only ids still in the session are kept, so the stored set never outgrows it.
  const markRead = () => {
    setClosed(new Set([...closed, current.id]));
    save(whispers.map((w) => w.id).filter((w) => w === current.id || seen?.has(w)));
  };

  return (
    <section className="pt-sheet" aria-label="A whisper from the GM">
      <div className="pt-head slate-card">
        <div className="pt-head-row">
          <span className="xmit">+++ WHISPER FROM THE GM +++</span>
          <button className="pt-hide mono" onClick={markRead}>
            CLOSE
          </button>
        </div>
        {unread.length > 1 && <span className="mono pl-xmit-head">{unread.length - 1} MORE AFTER THIS</span>}
      </div>
      <div className="pt-body">
        <p className="wh-text">{current.text}</p>
        <WhisperReply whisper={current} characterId={characterId} send={send} onSent={markRead} />
      </div>
    </section>
  );
}
