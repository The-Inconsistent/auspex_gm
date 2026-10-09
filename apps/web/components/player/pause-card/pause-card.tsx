"use client";
import { useEffect, useRef, useState } from "react";

import { PAUSE_WINDOW_MS } from "@wg/shared";

import { TOLD_MS } from "./constants";

type PauseCardProps = {
  kind: string[];
  limits: string[];
  firstSession: boolean; // the table's first session: the limits open on their own (issue #194, decision 4)
  signal: () => boolean;
};

// The pause card (issue #194, rules-flow §11.157): one tap tells the GM someone wants to stop, without saying who. No
// confirmation, so it's as cheap as an X-Card. Beside it, TABLE LIMITS shows what the table agreed (Core p.316)
// read-only; hidden when nothing was agreed.
export function PauseCard({ kind, limits, firstSession, signal }: PauseCardProps) {
  const [told, setTold] = useState(false);
  const [cooling, setCooling] = useState(false);
  const [noSignal, setNoSignal] = useState(false);
  const [showLimits, setShowLimits] = useState(firstSession);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const agreed = kind.length > 0 || limits.length > 0;

  // External system: the browser's timers, cleared if the app unmounts before they fire.
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  // PAUSE: sends the signal, says so, and stays off for the server's window.
  const handlePause = () => {
    if (!signal()) {
      setNoSignal(true);
      timers.current.push(setTimeout(() => setNoSignal(false), TOLD_MS));
      return;
    }
    setTold(true);
    setCooling(true);
    timers.current.push(
      setTimeout(() => setTold(false), TOLD_MS),
      setTimeout(() => setCooling(false), PAUSE_WINDOW_MS),
    );
  };

  return (
    <>
      <button
        className="btn sm danger"
        onClick={handlePause}
        disabled={cooling}
        aria-label="Pause: tell the GM someone wants to stop, without saying who"
      >
        PAUSE
      </button>
      {agreed && (
        <button className="btn sm" aria-expanded={showLimits} onClick={() => setShowLimits((v) => !v)}>
          TABLE LIMITS
        </button>
      )}
      <div className="pause-told" role="status">
        {told ? "THE GM HAS BEEN TOLD." : noSignal ? "NO SIGNAL. TELL THE GM ALOUD, OR TRY AGAIN." : ""}
      </div>
      {agreed && showLimits && (
        <div className="table-limits">
          <div className="table-limits-text">
            {kind.length > 0 && <div>KIND OF GAME: {kind.join(" · ")}</div>}
            {limits.length > 0 && <div>LEAVE OUT: {limits.join(" · ")}</div>}
          </div>
          <button className="btn sm" aria-label="Hide the table limits" onClick={() => setShowLimits(false)}>
            ✕
          </button>
        </div>
      )}
    </>
  );
}
