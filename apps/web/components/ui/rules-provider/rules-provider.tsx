"use client";
import { createContext, use, useMemo, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";

import { LINKED_RULE_KINDS, ruleKey, type RuleEntry } from "@wg/shared";

import { RuleItem } from "@/components/ui/rule-item/rule-item";

type Rules = { find: (name: string) => RuleEntry[]; open: (entries: RuleEntry[]) => void };

const RulesContext = createContext<Rules | null>(null);

type RulesProviderProps = { rules: RuleEntry[]; children: ReactNode };

// The seat-gated rules, looked up by a trait or Condition name as the data spells it, and one dialog that shows an
// entry over the current screen, so a player mid-fight keeps their place.
// A name can match two entries (Tesla, in core and in Legacy of the Necrontyr); the dialog then shows both.
export function RulesProvider({ rules, children }: RulesProviderProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  // `n` counts opens and keys the entries, so each open starts expanded even if the reader collapsed one last time.
  const [shown, setShown] = useState<{ entries: RuleEntry[]; n: number }>({ entries: [], n: 0 });
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
        // Render the new entries before showModal() picks what to focus; otherwise it focuses the old rule, which
        // then unmounts and drops focus to <body>.
        flushSync(() => setShown((s) => ({ entries, n: s.n + 1 })));
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
        aria-label={`Rule: ${shown.entries.map((r) => r.name).join(", ")}`}
        onClick={(e) => e.target === e.currentTarget && e.currentTarget.close()}
      >
        <div className="stack pad">
          {shown.entries.map((r) => (
            <RuleItem key={`${shown.n}-${r.id}`} r={r} open />
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
