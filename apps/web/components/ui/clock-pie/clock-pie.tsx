import { clockLabel, type Clock } from "@wg/shared";

import { piePaths } from "@/lib/clock-pie/clock-pie";

import "./clock-pie.css";

type ClockPieProps = { clock: Pick<Clock, "name" | "segments" | "filled">; size?: number };

// A clock as a pie (issue #210): filled segments in crimson ink, empty ones as outline. Pure SVG; the name is read out,
// so a screen reader hears "Hive guard, 3 of 6".
export function ClockPie({ clock, size = 44 }: ClockPieProps) {
  return (
    <svg
      className="clock-pie"
      viewBox="-1.1 -1.1 2.2 2.2"
      width={size}
      height={size}
      role="img"
      aria-label={clockLabel(clock)}
    >
      {piePaths(clock.segments).map((d, i) => (
        <path key={i} d={d} className={i < clock.filled ? "on" : undefined} />
      ))}
    </svg>
  );
}
