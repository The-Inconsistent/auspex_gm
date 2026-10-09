import type { LiveState } from "@wg/shared";

import { ClockPie } from "@/components/ui/clock-pie/clock-pie";
import { Countdown } from "@/components/ui/countdown/countdown";

type ClockStripProps = { state: Pick<LiveState, "clocks" | "countdown" | "serverNow">; size?: number };

// The clocks and countdown the GM shows the table (issue #210), as the phones and the table screen draw them. The
// snapshot only carries visible ones (toPlayerView), so the GM's hidden prep never reaches this. Nothing to show: no
// strip at all.
export function ClockStrip({ state, size = 44 }: ClockStripProps) {
  const { clocks, countdown, serverNow } = state;
  if (!clocks.length && !countdown) return null;
  return (
    <section className="clock-strip" aria-label="Clocks">
      {countdown && <Countdown countdown={countdown} serverNow={serverNow} />}
      {clocks.map((c) => (
        <figure key={c.id}>
          <ClockPie clock={c} size={size} />
          <figcaption aria-hidden>{c.name}</figcaption>
        </figure>
      ))}
    </section>
  );
}
