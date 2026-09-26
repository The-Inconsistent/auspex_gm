import { Track } from "@/components/ui/track/track";

type VitalProps = {
  label: string;
  value: number;
  max: number | null;
  onMinus: () => void;
  onPlus: () => void;
  danger?: boolean;
  // A harm track (Wounds, Shock): `value` is harm taken, but the card shows what's left and a draining bar, with
  // HIT (+1 harm) and HEAL (−1 harm) so each button moves the shown number the way it says.
  remaining?: boolean;
};

// One big counter card on the player sheet: value, optional max and bar, and −/+ buttons.
export function Vital({ label, value, max, onMinus, onPlus, danger = false, remaining = false }: VitalProps) {
  const left = remaining && max !== null;
  const shown = left ? Math.max(0, max - value) : value;
  const [down, up] = left
    ? [
        { text: "HIT", aria: `Take 1 ${label}`, onClick: onPlus },
        { text: "HEAL", aria: `Heal 1 ${label}`, onClick: onMinus },
      ]
    : [
        { text: "−", aria: `Decrease ${label}`, onClick: onMinus },
        { text: "+", aria: `Increase ${label}`, onClick: onPlus },
      ];
  return (
    <div className="vital">
      <span className={danger ? "label accent" : "label"}>{label}</span>
      <span className="num" style={danger ? { color: "var(--red)" } : undefined}>
        {shown}
        {max !== null && (
          <span style={{ fontSize: 22 }} className="dim">
            /{max}
          </span>
        )}
      </span>
      {max !== null && <Track value={shown} max={max} tone={danger ? "harm" : "ink"} />}
      <div style={{ display: "flex", gap: 6 }}>
        <button className="btn sq" style={{ flex: 1 }} aria-label={down.aria} onClick={down.onClick}>
          {down.text}
        </button>
        <button
          className={danger ? "btn sq primary" : "btn sq"}
          style={{ flex: 1 }}
          aria-label={up.aria}
          onClick={up.onClick}
        >
          {up.text}
        </button>
      </div>
    </div>
  );
}
