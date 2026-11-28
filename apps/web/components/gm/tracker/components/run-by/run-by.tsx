"use client";
import { useId } from "react";

type RunByProps = {
  name: string; // the ally
  current: string | null; // the Agent running it, null for the GM
  options: { id: string | null; name: string }[];
  onPick: (id: string | null) => void;
  // CHIP is the row's last column; BUTTON is the same picker in the side panel.
  as?: "chip" | "button";
};

// RUN BY (issue #350, rules-flow §11.208): who runs an ally, the GM or the Agent's player. One entry, then a native
// popover with the choices (light dismiss, Escape), as the PLAYERS SEE picker. An Ally offers only THE GM, so it is a
// plain chip with nothing to pick.
export function RunBy({ name, current, options, onPick, as = "chip" }: RunByProps) {
  const id = useId();
  const who = options.find((o) => o.id === current)?.name ?? "THE GM";
  if (options.length < 2)
    return (
      <span className="chip ally fight-run" aria-label={`${name}: run by the GM only`}>
        GM
      </span>
    );
  return (
    <>
      <button
        type="button"
        className={as === "chip" ? "fight-vis" : "btn sm"}
        popoverTarget={id}
        aria-label={`${name}: run by ${who}. Tap to change`}
      >
        {as === "chip" ? (
          <span className="chip ally fight-run" title={who}>
            {current ? who.toUpperCase() : "GM"}
          </span>
        ) : (
          <>RUN BY · {current ? who.toUpperCase() : "THE GM"}</>
        )}
      </button>
      <span id={id} popover="auto" className="term-pop" role="dialog" aria-label={`${name}: run by`}>
        <span className="term-pop-head">
          <b className="display">RUN BY</b>
        </span>
        <span className="term-pop-text">{name}</span>
        {options.map((o) => (
          <button
            key={o.id ?? "gm"}
            type="button"
            className="btn vis-pick"
            aria-pressed={o.id === current}
            popoverTarget={id}
            popoverTargetAction="hide"
            onClick={() => o.id !== current && onPick(o.id)}
          >
            <b>{o.name.toUpperCase()}</b>
          </button>
        ))}
      </span>
    </>
  );
}
