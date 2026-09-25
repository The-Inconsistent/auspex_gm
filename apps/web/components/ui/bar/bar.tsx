import { Track } from "@/components/ui/track/track";

type BarProps = { value: number; max: number | null; danger?: boolean };

// A counter with its track: wounds/shock in the tracker. Harm tracks go crimson once any is taken.
export function Bar({ value, max, danger }: BarProps) {
  if (max === null) return <span className="dim">—</span>;
  return (
    <span className="bar">
      <Track value={value} max={max} tone={danger ? "harm" : "ink"} />
      <span style={{ flex: "none" }}>
        {value}/{max}
      </span>
    </span>
  );
}
