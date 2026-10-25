"use client";
import { deriveStats, type Character, type DerivedStats } from "@wg/shared";

import { Term } from "@/components/ui/term/term";
import type { SheetTermKey } from "@/lib/sheet-terms/sheet-terms";

import { BookBox } from "../book-box/book-box";

type TraitsBoxProps = { me: Character; d: DerivedStats; tier: number };
type Cell = { k: SheetTermKey; label: string; value: number; formula: string; base: number; total?: boolean };

const signed = (n: number) => (n > 0 ? `+${n}` : `−${-n}`);

// The book's grey formula under each worked-out Trait (Core p.40), so a new player sees where a number comes from:
// "= Wil − 1 (4), +1" when a bonus or the GM changed it, the bare formula when nothing did. `base` is deriveStats' own
// number with no bonuses and no override, so the UI never redoes the formula.
const caption = ({ formula, base, value }: Cell) =>
  value === base ? formula : `${formula} (${base}), ${signed(value - base)}`;

function TraitCell(c: Cell) {
  return (
    <div className={c.total ? "bs-cell bs-cell-total" : "bs-cell"}>
      <span className="bs-lbl">
        <Term k={c.k}>{c.label}</Term>
      </span>
      <span className="bs-v mono">{c.value}</span>
      <span className="bs-cap">{caption(c)}</span>
    </div>
  );
}

// CONVICTION · RESOLVE · SPEED (Size isn't on a built sheet), then SURVIVAL: Defence; Resilience as Base + Armour =
// Total; max Wounds and Shock, and Determination (Core pp.36–37, 40, 193). The numbers are deriveStats'.
export function TraitsBox({ me, d, tier }: TraitsBoxProps) {
  const s = me.stats;
  const ar = s.armour.ar;
  // The Traits before any bonus or GM override; Resilience also before armour, for its BASE cell.
  const bare = deriveStats({ stats: { ...s, mods: {} }, overrides: {}, tier });
  const unarmoured = deriveStats({ stats: { ...s, mods: {}, armour: { ...s.armour, ar: 0 } }, overrides: {}, tier });
  return (
    <>
      <BookBox label="Conviction, Resolve, Speed">
        <div className="bs-cells bs-cells-3">
          <TraitCell k="conviction" label="CONVICTION" value={d.conviction} formula="= Wil" base={bare.conviction} />
          <TraitCell k="resolve" label="RESOLVE" value={d.resolve} formula="= Wil − 1" base={bare.resolve} />
          <TraitCell k="speed" label="SPEED" value={d.speed} formula="by Species" base={bare.speed} />
        </div>
      </BookBox>
      <BookBox title="SURVIVAL" id="ps-survival" label="Survival">
        <div className="bs-sv">
          <TraitCell k="defence" label="DEFENCE" value={d.defence} formula="= I − 1" base={bare.defence} />
          <div className="bs-sv-res">
            <span className="bs-lbl">
              <Term k="resilience">RESILIENCE</Term>
            </span>
            <div className="bs-cells bs-cells-3">
              <TraitCell
                k="resilience"
                label="BASE"
                value={unarmoured.resilience}
                formula="= T + 1"
                base={unarmoured.resilience}
              />
              <TraitCell k="armourRating" label="+ ARMOUR" value={ar} formula={s.armour.name || "none"} base={ar} />
              <TraitCell
                k="resilience"
                label="= TOTAL"
                value={d.resilience}
                formula="damage over it wounds you"
                base={bare.resilience}
                total
              />
            </div>
          </div>
        </div>
        <div className="bs-cells bs-cells-2">
          <TraitCell k="wounds" label="MAX WOUNDS" value={d.maxWounds} formula="= T + 2 × Tier" base={bare.maxWounds} />
          <div className="bs-stack">
            <TraitCell k="shock" label="MAX SHOCK" value={d.maxShock} formula="= Wil + Tier" base={bare.maxShock} />
            <TraitCell
              k="determination"
              label="DETERMINATION"
              value={d.determination}
              formula="= T"
              base={bare.determination}
            />
          </div>
        </div>
      </BookBox>
    </>
  );
}
