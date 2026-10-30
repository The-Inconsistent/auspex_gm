"use client";
import { useState, type FormEvent } from "react";

import { MAX_WHISPER_REPLY, type Whisper } from "@wg/shared";

import type { Send } from "@/hooks/use-table/use-table";

type WhisperReplyProps = { whisper: Whisper; characterId: string; send: Send; onSent?: () => void };

// One short line back to the GM (rules-flow.md §11.164); sending again replaces it.
export function WhisperReply({ whisper, characterId, send, onSent }: WhisperReplyProps) {
  const sent = whisper.replies[characterId]?.text;
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const r = await send({ type: "whisper.reply", whisperId: whisper.id, characterId, text });
    setError(r.ok ? null : r.error);
    if (!r.ok) return;
    setText("");
    onSent?.();
  };

  return (
    <form className="wh-reply" onSubmit={handleSubmit}>
      {sent && <span className="mono pl-xmit-head">YOU REPLIED: {sent}</span>}
      <div className="wh-reply-row">
        <input
          className="input"
          aria-label="Reply to the GM"
          placeholder={sent ? "Change your reply" : "Reply to the GM"}
          maxLength={MAX_WHISPER_REPLY}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button className="pl-sbtn pl-sbtn-hot" disabled={!text.trim()}>
          SEND
        </button>
      </div>
      {error && (
        <span className="red" role="alert">
          ! {error}
        </span>
      )}
    </form>
  );
}
