"use client";
import { useState } from "react";

import type { ActionResult, LiveState } from "@wg/shared";

import { Refusal } from "@/components/ui/refusal/refusal";
import type { Send } from "@/hooks/use-table/use-table";

import { Tally } from "./components/tally/tally";

type TestCallProps = { state: LiveState; send: Send };

// The Test the GM calls at the table (issue #191), on every tab like the spend requests. CALL A TEST is a header button
// (header/call-test-button); this renders only the tally while a call is open: who has reported, and what a failure
// offers the GM, one tap each, never on its own (rules-flow.md §11.145).
export function TestCall({ state, send }: TestCallProps) {
  const [error, setError] = useState<string | null>(null);
  const report = (r: ActionResult) => setError(r.ok ? null : r.error);
  // No call: nothing here, the header's button makes one.
  if (!state.testCall) return null;

  return (
    <>
      <section className="band" style={{ display: "grid", gap: 6, padding: "8px 12px" }} aria-label="Called Test">
        <Tally
          key={state.testCall.id}
          call={state.testCall}
          characters={state.characters}
          send={send}
          onResult={report}
        />
      </section>
      <Refusal error={error} onDismiss={() => setError(null)} />
    </>
  );
}
