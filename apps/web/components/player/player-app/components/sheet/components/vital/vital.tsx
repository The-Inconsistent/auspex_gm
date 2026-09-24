import { blocks } from "@/lib/blocks/blocks";

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
    <div className="vital" style={danger ? { borderColor: "var(--red-line)" } : undefined}>
      <span className="label">{label}</span>
      <span className="num" style={danger ? { color: "var(--red)" } : undefined}>
        {value}
        {max !== null && (
          <span style={{ fontSize: 22 }} className="dim">
            /{max}
          </span>
        )}
      </span>
      {max !== null && (
        <span className="bar" style={{ fontSize: 18 }}>
          {blocks({ value, max })}
        </span>
      )}
      <div style={{ display: "flex", gap: 6 }}>
        <button className="btn" style={{ flex: 1 }} aria-label={`Decrease ${label}`} onClick={onMinus}>
          −
        </button>
        <button className="btn" style={{ flex: 1 }} aria-label={`Increase ${label}`} onClick={onPlus}>
          +
        </button>
      </div>
    </div>
  );
}
