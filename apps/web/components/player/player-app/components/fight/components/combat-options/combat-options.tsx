"use client";
import { useRef } from "react";

import type { RuleEntry, Weapon } from "@wg/shared";

import { RuleItem } from "@/components/ui/rule-item/rule-item";

import { catalogueOptions } from "@/lib/combat-options/combat-options";

type CombatOptionsProps = { actions: RuleEntry[]; weapons: Weapon[] };

// OPTIONS on your Turn: the combat-action entries (Core pp.177–190) in closed groups by what you're doing, so the
// dialog opens on seven headings, not 43 rules. Within a group, what your weapons allow comes first; the rest stays
// readable but says what it needs, in words. A native modal <dialog> brings Escape, the focus trap and the backdrop.
export function CombatOptions({ actions, weapons }: CombatOptionsProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const groups = catalogueOptions(actions, weapons);
  return (
    <>
      <button type="button" className="btn" onClick={() => ref.current?.showModal()}>
        OPTIONS
      </button>
      <dialog
        ref={ref}
        className="legend"
        aria-label="Combat options"
        // A click on the dialog element itself, not its content, is a click on the backdrop.
        onClick={(e) => e.target === ref.current && ref.current.close()}
      >
        <div className="sb-title">
          <span>COMBAT OPTIONS</span>
        </div>
        <div className="list">
          {groups.map((g) => (
            <details key={g.title} className="item co-group">
              <summary className="item-head">
                <b className="rule-name">{g.title}</b>
                <span className="label rule-meta">
                  {g.usable < g.entries.length ? `${g.usable} OF ${g.entries.length} FOR YOU` : g.entries.length}
                </span>
                {g.note && <span className="rule-gist">{g.note}</span>}
              </summary>
              <div className="list co-list">
                {g.entries.map(({ rule, needs }) =>
                  needs ? (
                    <div key={rule.id} className="co-off">
                      <span className="label co-need">NOT WITH YOUR WEAPONS · NEEDS {needs.toUpperCase()}</span>
                      <RuleItem r={rule} />
                    </div>
                  ) : (
                    <RuleItem key={rule.id} r={rule} />
                  ),
                )}
              </div>
            </details>
          ))}
        </div>
        <div className="dlg-foot">
          <button className="btn sm" onClick={() => ref.current?.close()}>
            CLOSE
          </button>
        </div>
      </dialog>
    </>
  );
}
