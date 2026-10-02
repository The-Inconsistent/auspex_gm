import { ATTITUDE_DN, type Attitude } from "@wg/shared";

// "HOSTILE · +4 DN": an Attitude with the modifier it puts on a social Test's DN (Core p.168).
export const attitudeLabel = (a: Attitude) => {
  const n = ATTITUDE_DN[a];
  return `${a.toUpperCase()} · ${n < 0 ? "−" : "+"}${Math.abs(n)} DN`;
};

type AttitudeChipProps = { attitude: Attitude };

// Neutral changes nothing, so it shows no chip; a harder DN is drawn in red. Players see it too (rules-flow §11.89).
export function AttitudeChip({ attitude }: AttitudeChipProps) {
  if (attitude === "neutral") return null;
  return <span className={ATTITUDE_DN[attitude] > 0 ? "chip warn" : "chip"}>{attitudeLabel(attitude)}</span>;
}
