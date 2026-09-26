"use client";
import type { ReactNode } from "react";

import { useRules } from "../../rules-context";

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
