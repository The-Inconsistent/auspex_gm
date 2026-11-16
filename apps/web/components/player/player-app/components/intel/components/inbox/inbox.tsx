import type { Codex, LiveState } from "@wg/shared";

import { AttitudeChip } from "@/components/ui/attitude-chip/attitude-chip";
import { WhisperReply } from "@/components/player/whisper-sheet/components/whisper-reply/whisper-reply";
import { headerOf } from "@/components/ui/handout-doc/constants";
import type { Send } from "@/hooks/use-table/use-table";

import { entryName, firstLine, inboxEntries, parentName, stampOf, type IntelEntry } from "../../utils";
import { NextSession } from "../mission/mission";

type InboxProps = {
  codex: Codex;
  state: LiveState;
  characterId: string;
  send: Send;
  fresh: ReadonlySet<string>;
  markSeen: () => void;
  onOpen: (e: IntelEntry) => void;
  onShow: (e: IntelEntry) => void;
};

// INBOX: what the GM revealed or gave since this phone last left INTEL, as transmissions, then when we meet next. The
// mission itself is under MISSION.
export function Inbox({ codex, state, characterId, send, fresh, markSeen, onOpen, onShow }: InboxProps) {
  const entries = inboxEntries(codex, fresh);
  return (
    <>
      {entries.length === 0 ? (
        <div className="dim">Nothing new. The archive holds the rest.</div>
      ) : (
        <>
          {entries.map((e) => (
            <Transmission key={`${e.kind}:${e.entry.id}`} codex={codex} e={e} onOpen={onOpen} onShow={onShow} />
          ))}
          <button type="button" className="pl-mark-read mono" onClick={markSeen}>
            MARK ALL READ
          </button>
        </>
      )}
      {/* This session's whispers to this Agent (§11.164), to reread and answer: a session's start or end clears them. */}
      {state.whispers.map((w) => (
        <article key={w.id} className="slate-card cut pl-xmit">
          <span className="xmit pl-xmit-stamp">+++ WHISPER FROM THE GM +++</span>
          <p className="wh-text">{w.text}</p>
          <WhisperReply whisper={w} characterId={characterId} send={send} />
        </article>
      ))}
      <NextSession state={state} />
    </>
  );
}

type TransmissionProps = {
  codex: Codex;
  e: IntelEntry;
  onOpen: (e: IntelEntry) => void;
  onShow: (e: IntelEntry) => void;
};

function Transmission({ codex, e, onOpen, onShow }: TransmissionProps) {
  const stamp = (
    <span className="xmit pl-xmit-stamp">
      <span className="pl-xmit-new">NEW</span>+++ {stampOf(e)} +++
    </span>
  );
  if (e.kind === "handout") {
    const head = headerOf(e.entry);
    return (
      <article className="slate-card cut pl-xmit">
        {stamp}
        <h3 className="pl-xmit-name">{entryName(e)}</h3>
        {head && <span className="mono pl-xmit-head">{head}</span>}
        {/* toPlayerCodex leaves the viewer alone in a private handout's audience. */}
        {e.entry.audience.length > 0 && <span className="mono pl-xmit-head">FOR YOUR EYES ONLY</span>}
        <p className="mono pl-xmit-line">{firstLine(e.entry.body)}</p>
        <div className="pl-xmit-keys">
          <button type="button" className="pl-sbtn" onClick={() => onOpen(e)}>
            READ
          </button>
          <button type="button" className="pl-sbtn pl-sbtn-hot" onClick={() => onShow(e)}>
            SHOW THE TABLE
          </button>
        </div>
      </article>
    );
  }
  const parent = e.kind === "location" ? parentName(codex, e.entry) : null;
  return (
    <button type="button" className="slate-card cut pl-xmit pl-xmit-tap" onClick={() => onOpen(e)}>
      {stamp}
      <span className="pl-xmit-name">{entryName(e)}</span>
      {e.kind === "npc" && (
        <span className="pl-xmit-meta">
          <AttitudeChip attitude={e.entry.attitude} />
          {e.entry.role && <span className="pl-xmit-role">{e.entry.role}</span>}
        </span>
      )}
      {parent && <span className="pl-xmit-role">In {parent}</span>}
    </button>
  );
}
