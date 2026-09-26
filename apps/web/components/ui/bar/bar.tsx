import { Track } from "@/components/ui/track/track";

type BarProps = { value: number; max: number | null; danger?: boolean };

// A harm counter with its bar: wounds/shock in the tracker. `value` is harm taken; it shows what's left, so the bar
// drains. Harm tracks go crimson once any is taken.
export function Bar({ value, max, danger }: BarProps) {
  if (max === null) return <span className="dim">—</span>;
  const left = Math.max(0, max - value);
  return (
    <span className="bar">
      <Track value={left} max={max} tone={danger ? "harm" : "ink"} />
      <span style={{ flex: "none" }}>
        {left}/{max}
      </span>
    </span>
  );
}
