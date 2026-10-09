import { z } from "zod";

// Clocks and the countdown (issue #210): the GM's pacing furniture, not a Wrath & Glory rule (rules-flow.md §11). The
// app never decides anything from them: a clock fills when the GM taps it, and a full clock or a countdown at 00:00
// does nothing on its own.

// Pie sizes, as Blades in the Dark's progress clocks (issue #210 decision 1).
export const CLOCK_SEGMENTS = [4, 6, 8] as const;
export const ClockSegments = z.literal(CLOCK_SEGMENTS);
export type ClockSegments = z.infer<typeof ClockSegments>;
export const MAX_CLOCKS = 6; // decision 3
export const MAX_CLOCK_NAME = 40;
export const ClockName = z.string().trim().min(1).max(MAX_CLOCK_NAME);

export const Clock = z.object({
  id: z.string(),
  name: z.string(),
  segments: ClockSegments,
  filled: z.number().int().min(0),
  visible: z.boolean(), // a hidden clock is the GM's secret, like a hidden Threat (toPlayerView)
});
export type Clock = z.infer<typeof Clock>;

// One countdown, kept as the moment it ends rather than a ticking value, so the server runs no timer and a phone that
// reconnects still shows the right time.
export const MAX_COUNTDOWN_LABEL = 40;
export const MAX_COUNTDOWN_SECONDS = 3 * 60 * 60; // ponytail: app limit, a scene's countdown; raise it if a table asks
export const Countdown = z.object({
  label: z.string(),
  endsAt: z.number().int(), // epoch ms, the server's clock
  visible: z.boolean(),
});
export type Countdown = z.infer<typeof Countdown>;

// A clock after a tap: filled moves by delta and stays inside the pie. Two taps sent together both count, because the
// api applies each to what the last one left (clock.tick).
export const tickClock = ({ clock, delta }: { clock: Clock; delta: number }): Clock => ({
  ...clock,
  filled: Math.min(clock.segments, Math.max(0, clock.filled + delta)),
});

// Whole seconds left at `now` (epoch ms on the server's clock), never below 0.
export const countdownLeft = ({ endsAt, now }: { endsAt: number; now: number }) =>
  Math.max(0, Math.ceil((endsAt - now) / 1000));

// "mm:ss"; minutes past 99 just grow a digit.
export const mmss = (seconds: number) =>
  `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

// A clock as read aloud: "Hive guard, 3 of 6".
export const clockLabel = (c: Pick<Clock, "name" | "filled" | "segments">) => `${c.name}, ${c.filled} of ${c.segments}`;
