"use client";
import { useState } from "react";

import { activeCharacterIds, type ActionResult, type LiveState } from "@wg/shared";

import { Refusal } from "@/components/ui/refusal/refusal";
import type { Send } from "@/hooks/use-table/use-table";

import { CallForm } from "./components/call-form/call-form";
import { Tally } from "./components/tally/tally";

type TestCallProps = { state: LiveState; send: Send };

// The Test the GM calls at the table (issue #191), on every tab like the spend requests. No call: CALL A TEST, for the
// "Awareness, DN 3, everyone" said aloud. A call: who has reported, and what a failure offers the GM, one tap each,
// never on its own (rules-flow.md §11.145).
export function TestCall({ state, send }: TestCallProps) {
  const [error, setError] = useState<string | null>(null);
  const report = (r: ActionResult) => setError(r.ok ? null : r.error);
  const active = activeCharacterIds(state.access);
  const agents = state.characters.filter((c) => active.has(c.id));

  return (
    <>
      <section className="band" style={{ display: "grid", gap: 6, padding: "8px 12px" }} aria-label="Called Test">
        {state.testCall ? (
          <Tally
            key={state.testCall.id}
            call={state.testCall}
            characters={state.characters}
            send={send}
            onResult={report}
          />
        ) : (
          <CallForm agents={agents} send={send} onResult={report} />
        )}
      </section>
      <Refusal error={error} onDismiss={() => setError(null)} />
    </>
  );
}
