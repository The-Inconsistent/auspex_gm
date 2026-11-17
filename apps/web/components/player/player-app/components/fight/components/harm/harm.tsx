type HarmProps = { wounds: number; maxWounds: number; shock: number; maxShock: number | null };

// Wounds and Shock left out of max, as numbers the way the GM's tracker shows them: a bar was hard to read at a glance.
// No Shock track ("–", p.324) shows Wounds alone. The visible numbers are hidden from screen readers, which get the
// sentence instead.
export function Harm({ wounds, maxWounds, shock, maxShock }: HarmProps) {
  const w = Math.max(0, maxWounds - wounds);
  const s = maxShock === null ? null : Math.max(0, maxShock - shock);
  return (
    <span className="mono pf-hp">
      <span aria-hidden="true">
        <span className="pf-hp-k">W</span> {w}/{maxWounds}
      </span>
      {s !== null && (
        <span aria-hidden="true">
          <span className="pf-hp-k">S</span> {s}/{maxShock}
        </span>
      )}
      <span className="sr-only">
        Wounds {w} of {maxWounds} left{s === null ? "" : `, Shock ${s} of ${maxShock} left`}
      </span>
    </span>
  );
}
