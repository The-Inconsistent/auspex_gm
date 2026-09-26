"use client";
import { createContext, use, useMemo, useRef, useState, type ReactNode } from "react";

import { LINKED_RULE_KINDS, ruleKey, type RuleEntry } from "@wg/shared";

import { RuleItem } from "@/components/ui/rule-item/rule-item";

type Rules = { find: (name: string) => RuleEntry[]; open: (entries: RuleEntry[]) => void };

const RulesContext = createContext<Rules | null>(null);

// The seat-gated rules, looked up by a trait or Condition name as the data spells it, and one dialog that shows an
// entry over the current screen, so a player mid-fight keeps their place.
// A name can match two entries (Tesla, in core and in Legacy of the Necrontyr); the dialog then shows both.
export function RulesProvider({ rules, children }: { rules: RuleEntry[]; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [shown, setShown] = useState<RuleEntry[]>([]);
  const byKey = useMemo(() => {
    const m = new Map<string, RuleEntry[]>();
    for (const r of rules) {
      if (!LINKED_RULE_KINDS.includes(r.kind)) continue;
      const k = ruleKey(r.name);
      m.set(k, [...(m.get(k) ?? []), r]);
    }
    return m;
  }, [rules]);
  const value = useMemo<Rules>(
    () => ({
      find: (name) => byKey.get(ruleKey(name)) ?? [],
      open: (entries) => {
        setShown(entries);
        dialog.current?.showModal();
      },
    }),
    [byKey],
  );

  return (
    <RulesContext value={value}>
      {children}
      {/* Native modal: Esc closes it and focus returns to the tapped trait. The content fills the <dialog>, so a tap
          that lands on the <dialog> itself is on the backdrop; iOS Safari has no `closedby`. */}
      <dialog
        ref={dialog}
        className="rule-dialog"
        aria-label={`Rule: ${shown.map((r) => r.name).join(", ")}`}
        onClick={(e) => e.target === e.currentTarget && e.currentTarget.close()}
      >
        <div className="stack pad">
          {shown.map((r) => (
            <RuleItem key={r.id} r={r} open />
          ))}
          <form method="dialog">
            <button className="btn primary">CLOSE</button>
          </form>
        </div>
      </dialog>
    </RulesContext>
  );
}

export function useRules(): Rules {
  const rules = use(RulesContext);
  if (!rules) throw new Error("useRules outside RulesProvider");
  return rules;
}
