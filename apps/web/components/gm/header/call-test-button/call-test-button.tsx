"use client";
import { useCallback, useState } from "react";

import { activeCharacterIds, type ActionResult, type LiveState } from "@wg/shared";

import { CallForm } from "@/components/gm/test-call/components/call-form/call-form";
import type { Send } from "@/hooks/use-table/use-table";

import { Popover } from "../popover/popover";

type CallTestButtonProps = { state: LiveState; send: Send };

// CALL A TEST in the header: today's call form in a popover. While a call is open the button only says so; the tally
// (TestCall) is rendered by the header's owner under it, and its CLOSE ends the call.
export function CallTestButton({ state, send }: CallTestButtonProps) {
  const active = activeCharacterIds(state.access);
  const agents = state.characters.filter((c) => active.has(c.id));

  if (state.testCall) {
    return (
      <button className="btn" disabled aria-label="A Test is called. Close it in the tally below to call another">
        TEST CALLED
      </button>
    );
  }

  return (
    <Popover button="CALL A TEST" label="Call a Test" title="Call a Test">
      {(close) => <CallPanel agents={agents} send={send} close={close} />}
    </Popover>
  );
}

type CallPanelProps = { agents: LiveState["characters"]; send: Send; close: () => void };

// The panel's own component, so a refusal's error unmounts with the popover and is gone the next time it opens.
function CallPanel({ agents, send, close }: CallPanelProps) {
  const [error, setError] = useState<string | null>(null);

  // CallForm is a <details> closed at rest (it can't be edited from here); the popover is already the "open it" tap, so
  // open it as the panel mounts. A stable ref callback runs once, so the GM can still fold it.
  const openForm = useCallback((el: HTMLDivElement | null) => {
    el?.querySelector("details")?.setAttribute("open", "");
  }, []);

  // CALL: the form's answer; a refusal stays in the panel, a call closes it (the tally takes over).
  const handleResult = (r: ActionResult) => {
    setError(r.ok ? null : r.error);
    if (r.ok) close();
  };

  return (
    <div ref={openForm} className="hd-call">
      <CallForm agents={agents} send={send} onResult={handleResult} />
      {error && (
        <div className="hd-error" role="alert">
          ! {error}
        </div>
      )}
    </div>
  );
}
