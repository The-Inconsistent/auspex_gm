import { blocks } from "@/lib/blocks/blocks";

type BarProps = { value: number; max: number | null; danger?: boolean };

export function Bar({ value, max, danger }: BarProps) {
  if (max === null) return <span className="dim">—</span>;
  return (
    <span
      className="bar"
      style={{ display: "flex", gap: 6, minWidth: 0, color: danger && value > 0 ? "var(--red)" : undefined }}
    >
      <span style={{ overflow: "hidden", minWidth: 0 }}>{blocks({ value, max })}</span>
      <span style={{ fontSize: 16, flex: "none" }}>
        {value}/{max}
      </span>
    </span>
  );
}
