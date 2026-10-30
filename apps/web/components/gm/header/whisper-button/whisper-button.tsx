"use client";
import type { LiveState } from "@wg/shared";

import { useUnreadReplies, WhisperPanel } from "@/components/gm/whisper/whisper";
import type { Send } from "@/hooks/use-table/use-table";

import { Popover } from "../popover/popover";

type WhisperButtonProps = { state: LiveState; send: Send };

// WHISPER in the header (rules-flow.md §11.164): lit, with a count, while players have replied since it was last open.
export function WhisperButton({ state, send }: WhisperButtonProps) {
  const { unread } = useUnreadReplies(state);
  return (
    <Popover
      className={unread ? "btn primary" : "btn"}
      button={unread ? `WHISPER · ${unread}` : "WHISPER"}
      label={unread ? `Whisper. ${unread} new ${unread === 1 ? "reply" : "replies"}` : "Whisper to Agents"}
      title="Whisper to Agents"
    >
      {() => <WhisperPanel state={state} send={send} />}
    </Popover>
  );
}
