"use client";
import { useState } from "react";

import { NextSessionPlace, type ActionResult, type LiveState } from "@wg/shared";

import { FieldError } from "@/components/ui/field-error/field-error";
import { useFieldErrors } from "@/hooks/use-field-errors/use-field-errors";
import type { Send } from "@/hooks/use-table/use-table";
import { fromLocalInput, nextSessionLine, toLocalInput } from "@/lib/next-session/next-session";

type NextSessionProps = {
  campaign: LiveState["campaign"];
  send: Send;
  onResult: (r: ActionResult, ok: string) => void;
};

// PARTY › SESSION › NEXT SESSION (issue #197): when and where the table meets next, typed once and shown on every phone's
// INTEL with ADD TO CALENDAR. The date is this tablet's local time, stored as UTC (decision 1); START SESSION clears it
// and keeps the place (decision 3). PARTY remounts this on a change from elsewhere, so the form always starts from the
// server's values.
export function NextSession({ campaign, send, onResult }: NextSessionProps) {
  const [when, setWhen] = useState(toLocalInput(campaign.nextSessionAt));
  const [place, setPlace] = useState(campaign.nextSessionPlace);
  const fields = useFieldErrors("next-session-");

  // SAVE: the date and the place together. An empty date is no date.
  const save = async () => {
    const nextSessionPlace = fields.check(NextSessionPlace, place);
    if (nextSessionPlace === null) return;
    const nextSessionAt = fromLocalInput(when);
    onResult(
      await send({ type: "campaign.update", nextSessionAt, nextSessionPlace }),
      nextSessionAt ? `NEXT SESSION ${nextSessionLine(nextSessionAt, nextSessionPlace).toUpperCase()}` : "NO DATE SET",
    );
  };

  // CLEAR: the date only; the place stays for the next one, as START SESSION leaves it.
  const clear = async () =>
    onResult(await send({ type: "campaign.update", nextSessionAt: null }), "NEXT SESSION CLEARED");

  return (
    <div className="stack">
      <div className="label">NEXT SESSION</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          className="input"
          type="datetime-local"
          aria-label="Next session date and time"
          style={{ width: "auto" }}
          value={when}
          onChange={(e) => setWhen(e.target.value)}
        />
        <input
          id="next-session-"
          className="input"
          aria-label="Next session place"
          style={{ flex: 1, minWidth: 160 }}
          placeholder="PLACE (optional)"
          value={place}
          onChange={(e) => setPlace(e.target.value)}
          {...fields.marks()}
        />
      </div>
      <FieldError {...fields.reason()} />
      <div className="keys" style={{ paddingTop: 0 }}>
        <button className="btn sm primary" onClick={save}>
          SAVE
        </button>
        {campaign.nextSessionAt && (
          <button className="btn sm" onClick={clear}>
            CLEAR
          </button>
        )}
      </div>
    </div>
  );
}
