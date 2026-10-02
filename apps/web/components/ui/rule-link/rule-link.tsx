"use client";
import type { ReactNode } from "react";

import { useRules } from "@/components/ui/rules-provider/rules-provider";

type RuleLinkProps = { name: string; children?: ReactNode };

// A trait or Condition that opens its rule when tapped. Names with no entry (`Penetrating (3)`, `3 Ammo`) stay text.
export function RuleLink({ name, children = name }: RuleLinkProps) {
  const { find, open } = useRules();
  const entries = find(name);
  if (!entries.length) return <>{children}</>;
  return (
    <button type="button" className="rule-link" aria-label={`Rule: ${name}`} onClick={() => open(entries)}>
      {children}
    </button>
  );
}

type RuleIdLinkProps = { id: string; children: ReactNode };

// A rule that isn't a trait (a scene Test's DN table, Shifting, Fail Forward), opened by its id. Stays text when the
// seat isn't served that entry.
export function RuleIdLink({ id, children }: RuleIdLinkProps) {
  const { get, open } = useRules();
  const rule = get(id);
  if (!rule) return <>{children}</>;
  return (
    <button type="button" className="rule-link" aria-label={`Rule: ${rule.name}`} onClick={() => open([rule])}>
      {children}
    </button>
  );
}
