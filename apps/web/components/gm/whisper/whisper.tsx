"use client";
import { useEffect, useState } from "react";

import { MAX_WHISPER, type LiveState } from "@wg/shared";

import type { Send } from "@/hooks/use-table/use-table";
import { useStoredSet } from "@/hooks/use-stored-set/use-stored-set";

type WhisperPanelProps = { state: LiveState; send: Send; to?: string[]; onSent?: () => void };

// Each reply as this tablet has seen it: a changed reply is new again.
const replyKeys = (state: LiveState) =>
  state.whispers.flatMap((w) => Object.entries(w.replies).map(([c, r]) => `${w.id}:${c}:${r.at}`));
const readKey = (campaignId: string) => `wg:whisper-replies:${campaignId}`;

// Replies the GM hasn't opened WHISPER since, for the header's badge.
export function useUnreadReplies(state: LiveState) {
  const [read, save] = useStoredSet(readKey(state.campaign.id));
  const keys = replyKeys(state);
  return { unread: keys.filter((k) => !read?.has(k)).length, markRead: () => save(keys) };
}

// WHISPER: a private line to some Agents, then this session's whispers with their replies (rules-flow.md §11.164).
// `to`: the Agents picked to start with (a PARTY card's own).
export function WhisperPanel({ state, send, to = [], onSent }: WhisperPanelProps) {
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set(to));
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { markRead } = useUnreadReplies(state);
  const names = new Map(state.characters.map((c) => [c.id, c.name]));

  // External system: localStorage. Replies shown while the panel is open count as read.
  const shown = replyKeys(state).join(",");
  useEffect(() => {
    markRead();
  }, [shown]); // eslint-disable-line react-hooks/exhaustive-deps -- markRead changes every render; `shown` is what moves

  const handleWho = (id: string) => {
    const next = new Set(picked);
    if (!next.delete(id)) next.add(id);
    setPicked(next);
  };

  const handleSend = async () => {
    const r = await send({ type: "whisper.send", to: [...picked], text });
    setError(r.ok ? null : r.error);
    if (!r.ok) return;
    setText("");
    onSent?.();
  };

  const handleDelete = async (id: string) => {
    const r = await send({ type: "whisper.delete", id });
    setError(r.ok ? null : r.error);
  };

  if (!state.characters.length) return <span className="dim">WHISPER: no Agents yet.</span>;
  return (
    <div className="stack wh-panel">
      <div className="keys" role="group" aria-label="Agents to whisper to">
        {state.characters.map((c) => (
          <button
            key={c.id}
            className={`btn sm ${picked.has(c.id) ? "primary" : ""}`}
            aria-pressed={picked.has(c.id)}
            onClick={() => handleWho(c.id)}
          >
            {c.name.toUpperCase()}
          </button>
        ))}
      </div>
      <textarea
        className="input"
        aria-label="Whisper"
        placeholder="What only they notice…"
        rows={3}
        maxLength={MAX_WHISPER}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <button className="btn sm primary" disabled={!picked.size || !text.trim()} onClick={handleSend}>
        WHISPER
      </button>
      {error && (
        <div className="hd-error" role="alert">
          ! {error}
        </div>
      )}
      {state.whispers.length > 0 && <div className="rule">THIS SESSION</div>}
      {state.whispers.map((w) => (
        <div key={w.id} className="wh-log">
          <div className="wh-log-head">
            <span className="label">TO {w.to.map((id) => names.get(id)?.toUpperCase() ?? "(GONE)").join(", ")}</span>
            <button className="btn sm" aria-label="Take this whisper back" onClick={() => handleDelete(w.id)}>
              ✕
            </button>
          </div>
          <span>{w.text}</span>
          {Object.entries(w.replies).map(([c, r]) => (
            <span key={c} className="accent">
              {names.get(c) ?? "(gone)"}: {r.text}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}
