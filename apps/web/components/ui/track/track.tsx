import { blocks } from "@/lib/blocks/blocks";

type TrackProps = { value: number; max: number; tone?: "harm" | "ink" };

// A wound or shock track: framed cells that fill crimson (harm) or ink. The exact number is always shown beside it.
export function Track({ value, max, tone = "harm" }: TrackProps) {
  const { filled, cells } = blocks({ value, max });
  return (
    <span className={`track ${tone}`} aria-hidden="true">
      {Array.from({ length: cells }, (_, i) => (
        <span key={i} className={i < filled ? "on" : undefined} />
      ))}
    </span>
  );
}
