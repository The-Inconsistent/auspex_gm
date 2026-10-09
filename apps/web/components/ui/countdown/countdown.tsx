"use client";
import { useEffect, useState } from "react";

import { countdownLeft, mmss, type Countdown as CountdownState } from "@wg/shared";

type CountdownProps = { countdown: CountdownState; serverNow: number };

// The countdown as mm:ss (issue #210). `endsAt` is on the server's clock and `serverNow` is when this snapshot left it,
// so a phone whose own clock runs fast or slow still shows the right time. At zero it shows 00:00 and stops; nothing
// else happens.
export function Countdown({ countdown, serverNow }: CountdownProps) {
  const { endsAt, label } = countdown;
  const [left, setLeft] = useState<number | null>(null);

  // External system: the device clock, read once a second until the countdown runs out. Each snapshot re-reads the
  // skew between the server's clock and this one.
  useEffect(() => {
    const offset = serverNow - Date.now();
    const tick = () => {
      const s = countdownLeft({ endsAt, now: Date.now() + offset });
      setLeft(s);
      if (s === 0) clearInterval(timer);
    };
    const timer = setInterval(tick, 1000);
    const first = setTimeout(tick, 0);
    return () => {
      clearInterval(timer);
      clearTimeout(first);
    };
  }, [endsAt, serverNow]);

  const shown = left === null ? "--:--" : mmss(left);
  return (
    <div className="countdown" role="timer" aria-label={`${label || "Countdown"}: ${shown}`}>
      <span className={`countdown-time display ${left === 0 ? "out" : ""}`}>{shown}</span>
      {label && <span className="label">{label.toUpperCase()}</span>}
    </div>
  );
}
