import { Track } from "@/components/ui/track/track";

type VitalProps = {
  label: string;
  value: number;
  max: number | null;
  onMinus: () => void;
  onPlus: () => void;
  danger?: boolean;
};

// One big counter card on the player sheet: value, optional max and bar, and −/+ buttons.
export function Vital({ label, value, max, onMinus, onPlus, danger = false }: VitalProps) {
  return (
    <div className="vital">
      <span className={danger ? "label accent" : "label"}>{label}</span>
      <span className="num" style={danger ? { color: "var(--red)" } : undefined}>
        {value}
        {max !== null && (
          <span style={{ fontSize: 22 }} className="dim">
            /{max}
          </span>
        )}
      </span>
      {max !== null && <Track value={value} max={max} tone={danger ? "harm" : "ink"} />}
      <div style={{ display: "flex", gap: 6 }}>
        <button className="btn sq" style={{ flex: 1 }} aria-label={`Decrease ${label}`} onClick={onMinus}>
          −
        </button>
        <button
          className={danger ? "btn sq primary" : "btn sq"}
          style={{ flex: 1 }}
          aria-label={`Increase ${label}`}
          onClick={onPlus}
        >
          +
        </button>
      </div>
    </div>
  );
}
