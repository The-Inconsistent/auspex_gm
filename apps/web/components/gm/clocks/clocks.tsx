"use client";
import { useState, type FormEvent } from "react";

import { Eye, EyeOff } from "lucide-react";

import {
  CLOCK_SEGMENTS,
  ClockSegments,
  MAX_CLOCK_NAME,
  MAX_CLOCKS,
  MAX_COUNTDOWN_LABEL,
  MAX_COUNTDOWN_SECONDS,
  type ActionInput,
  type Clock,
  type LiveState,
} from "@wg/shared";

import { ClockPie } from "@/components/ui/clock-pie/clock-pie";
import { Countdown } from "@/components/ui/countdown/countdown";
import { Refusal } from "@/components/ui/refusal/refusal";
import type { Send } from "@/hooks/use-table/use-table";

import { DEFAULT_COUNTDOWN_MINUTES, NEW_CLOCK_SEGMENTS } from "./constants";

type ClocksProps = { state: LiveState; send: Send };

// CLOCKS (issue #210), in TRACK and PREP: the GM's pacing pies and one countdown. Table furniture, not a rule: a full
// clock or a countdown at 00:00 does nothing, the GM decides. A new clock starts hidden so it can be prepped before
// the table sees it (decision 2); the eye shows it on the phones and the table screen.
export function Clocks({ state, send }: ClocksProps) {
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [segments, setSegments] = useState<ClockSegments>(NEW_CLOCK_SEGMENTS);
  const [label, setLabel] = useState("");
  const [minutes, setMinutes] = useState(DEFAULT_COUNTDOWN_MINUTES);
  const [showCountdown, setShowCountdown] = useState(true);
  const { clocks, countdown } = state;
  const maxMinutes = MAX_COUNTDOWN_SECONDS / 60;

  // Sends an action and shows the server's refusal, if any. True when it went through.
  const run = async (a: ActionInput) => {
    const r = await send(a);
    setError(r.ok ? null : r.error);
    return r.ok;
  };

  // NEW CLOCK: an empty, hidden clock of the chosen size.
  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    if (await run({ type: "clock.save", name, segments })) setName("");
  };

  // The eye: show the clock to the table, or take it back.
  const handleVisible = (c: Clock) =>
    run({ type: "clock.save", id: c.id, name: c.name, segments: c.segments, visible: !c.visible });

  // DELETE asks first: a clock filled over a whole session is easy to lose to a stray tap.
  const handleDelete = (c: Clock) => {
    if (window.confirm(`Delete the clock "${c.name}"?`)) void run({ type: "clock.delete", id: c.id });
  };

  // START: the countdown runs from now; a running one starts over.
  const handleStart = (e: FormEvent) => {
    e.preventDefault();
    void run({ type: "countdown.set", label, seconds: Math.round(minutes * 60), visible: showCountdown });
  };

  return (
    <section className="panel pad stack" style={{ gap: 8 }} aria-label="Clocks">
      <div className="rule">CLOCKS</div>
      {clocks.length > 0 && (
        <div className="keys" style={{ padding: 0, alignItems: "stretch" }}>
          {clocks.map((c) => (
            <div key={c.id} className="field" style={{ display: "grid", gap: 6, justifyItems: "center", minWidth: 0 }}>
              <ClockPie clock={c} />
              <b style={{ maxWidth: 160, overflowWrap: "anywhere", textAlign: "center" }}>
                {c.name.toUpperCase()} {c.filled}/{c.segments}
              </b>
              {!c.visible && <span className="chip">HIDDEN</span>}
              <div className="keys" style={{ padding: 0, justifyContent: "center" }}>
                <button
                  className="btn sm"
                  aria-label={`${c.name}: one segment less`}
                  disabled={c.filled === 0}
                  onClick={() => run({ type: "clock.tick", id: c.id, delta: -1 })}
                >
                  −1
                </button>
                <button
                  className="btn sm primary"
                  aria-label={`${c.name}: one segment more`}
                  disabled={c.filled >= c.segments}
                  onClick={() => run({ type: "clock.tick", id: c.id, delta: 1 })}
                >
                  +1
                </button>
                <button
                  className="btn sm"
                  aria-label={`Show ${c.name} to the table`}
                  aria-pressed={c.visible}
                  onClick={() => handleVisible(c)}
                >
                  {c.visible ? <Eye size={16} aria-hidden /> : <EyeOff size={16} aria-hidden />}
                </button>
                <button className="btn sm" aria-label={`Delete ${c.name}`} onClick={() => handleDelete(c)}>
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {clocks.length < MAX_CLOCKS ? (
        <form className="keys" style={{ padding: 0, alignItems: "center" }} onSubmit={handleAdd}>
          <input
            className="input sm"
            aria-label="New clock name"
            placeholder="NEW CLOCK"
            maxLength={MAX_CLOCK_NAME}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <select
            className="btn sm"
            aria-label="Segments"
            value={segments}
            onChange={(e) => setSegments(ClockSegments.parse(Number(e.target.value)))}
          >
            {CLOCK_SEGMENTS.map((n) => (
              <option key={n} value={n}>
                {n} SEGMENTS
              </option>
            ))}
          </select>
          <button className="btn sm" disabled={!name.trim()}>
            ADD CLOCK
          </button>
        </form>
      ) : (
        <span className="dim">At most {MAX_CLOCKS} clocks; delete one to add another.</span>
      )}
      <form className="keys" style={{ padding: 0, alignItems: "center" }} onSubmit={handleStart}>
        <span className="label">COUNTDOWN</span>
        {countdown && <Countdown countdown={countdown} serverNow={state.serverNow} />}
        {countdown && !countdown.visible && <span className="chip">HIDDEN</span>}
        <input
          className="input sm"
          aria-label="Countdown label"
          placeholder="LABEL"
          maxLength={MAX_COUNTDOWN_LABEL}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <label>
          <input
            className="input sm"
            type="number"
            min={1}
            max={maxMinutes}
            style={{ width: 72 }}
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value))}
          />{" "}
          MIN
        </label>
        <label>
          <input type="checkbox" checked={showCountdown} onChange={(e) => setShowCountdown(e.target.checked)} /> SHOW
        </label>
        <button className="btn sm primary" disabled={!(minutes > 0 && minutes <= maxMinutes)}>
          {countdown ? "RESTART" : "START"}
        </button>
        {countdown && (
          <button type="button" className="btn sm" onClick={() => run({ type: "countdown.clear" })}>
            CLEAR
          </button>
        )}
      </form>
      <Refusal error={error} onDismiss={() => setError(null)} />
    </section>
  );
}
