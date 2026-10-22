"use client";
import { useState, type KeyboardEvent } from "react";

import { CONDITIONS, Visibility } from "@wg/shared";

import { VISIBILITY_LABEL } from "@/components/ui/visibility-select/constants";

import type { KeyAction, KeyPanel } from "../../types";

type KeyBarProps = {
  // The one turn button; null when nothing is due (a Round with someone still to act, nobody acting).
  primary: KeyAction | null;
  seize: KeyAction | null;
  // The selected row's Conditions; null with no row selected.
  conditions: { name: string; active: string[]; onToggle: (k: string) => void } | null;
  more: {
    ambush: KeyAction | null;
    visibility: { value: Visibility; onPick: (v: Visibility) => void } | null;
    remove: KeyAction | null;
    newRound: KeyAction | null;
    endFight: KeyAction;
  };
};

// The turn's key bar: at most four controls. One primary turn button, SEIZE when it's open, + CONDITION and MORE, whose
// panels fold open above the bar (one at a time, each with its own CLOSE). The tracker keys it by the selected row, so
// a new selection starts with both folded.
export function KeyBar({ primary, seize, conditions, more }: KeyBarProps) {
  const [open, setOpen] = useState<KeyPanel | null>(null);
  const toggle = (p: KeyPanel) => setOpen(open === p ? null : p);
  const close = () => setOpen(null);
  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") close();
  };

  // MORE names what's inside it, so it's not a mystery meat button.
  const moreList = [
    more.ambush?.label.split(" ")[0]?.toLowerCase(), // AMBUSH or AWARE · cost
    more.visibility && "players see",
    more.remove && "remove",
    more.newRound && "new round",
    "end fight",
  ].filter(Boolean);

  const run = (a: KeyAction) => () => {
    close();
    a.onClick();
  };

  return (
    <div className="fight-keys" onKeyDown={handleKeyDown}>
      {open === "conditions" && conditions && (
        <div className="fight-panel" role="group" aria-label={`Conditions on ${conditions.name}`}>
          <span className="label">CONDITIONS · {conditions.name.toUpperCase()}</span>
          <div className="fight-chips">
            {CONDITIONS.map((k) => {
              const on = conditions.active.includes(k);
              return (
                <button
                  key={k}
                  type="button"
                  className="fight-pill"
                  aria-pressed={on}
                  onClick={() => conditions.onToggle(k)}
                >
                  {on && <span aria-hidden="true">✓ </span>}
                  {k.toUpperCase()}
                </button>
              );
            })}
          </div>
          <button type="button" className="btn" onClick={close}>
            CLOSE
          </button>
        </div>
      )}
      {open === "more" && (
        <div className="fight-panel" role="group" aria-label="More actions">
          <span className="label">MORE</span>
          <div className="fight-chips">
            {more.ambush && (
              <button type="button" className="btn" onClick={run(more.ambush)}>
                {more.ambush.label}
              </button>
            )}
            {more.visibility && (
              <div className="fight-seg" role="group" aria-label="What players see">
                {Visibility.options.map((v) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={v === more.visibility?.value}
                    onClick={() => more.visibility?.onPick(v)}
                  >
                    {VISIBILITY_LABEL[v]}
                  </button>
                ))}
              </div>
            )}
            {more.newRound && (
              <button type="button" className="btn" onClick={run(more.newRound)}>
                {more.newRound.label}
              </button>
            )}
            {more.remove && (
              <button type="button" className="btn danger" onClick={run(more.remove)}>
                {more.remove.label}
              </button>
            )}
            <button type="button" className="btn danger" onClick={run(more.endFight)}>
              {more.endFight.label}
            </button>
          </div>
          <button type="button" className="btn" onClick={close}>
            CLOSE
          </button>
        </div>
      )}
      <div className="keys" role="group" aria-label="Turn actions">
        {primary && (
          <button type="button" className="btn primary" onClick={run(primary)}>
            {primary.label}
          </button>
        )}
        {seize && (
          <button type="button" className="btn" onClick={run(seize)}>
            {seize.label}
          </button>
        )}
        {conditions && (
          <button
            type="button"
            className="btn"
            aria-expanded={open === "conditions"}
            onClick={() => toggle("conditions")}
          >
            + CONDITION
          </button>
        )}
        <button
          type="button"
          className="btn"
          aria-expanded={open === "more"}
          aria-label={`More actions: ${moreList.join(", ")}`}
          onClick={() => toggle("more")}
        >
          MORE
        </button>
      </div>
    </div>
  );
}
