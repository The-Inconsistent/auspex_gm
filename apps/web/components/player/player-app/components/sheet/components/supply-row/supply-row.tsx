type SupplyRowProps = { label: string; value: number; onMinus: () => void; onPlus: () => void; removable?: boolean };

// One −/value/+ line in the sheet's SUPPLY section. `removable`: − at 0 drops the row (an empty ammo type).
export function SupplyRow({ label, value, onMinus, onPlus, removable = false }: SupplyRowProps) {
  const remove = removable && value === 0;
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <span style={{ flex: 1 }}>{label.toUpperCase()}</span>
      <button className="btn sm" aria-label={remove ? `Remove ${label}` : `Decrease ${label}`} onClick={onMinus}>
        {remove ? "×" : "−"}
      </button>
      <span className="display" style={{ fontSize: 26, minWidth: 28, textAlign: "center" }}>
        {value}
      </span>
      <button className="btn sm" aria-label={`Increase ${label}`} onClick={onPlus}>
        +
      </button>
    </div>
  );
}
