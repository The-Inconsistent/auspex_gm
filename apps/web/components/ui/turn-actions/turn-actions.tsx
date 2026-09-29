"use client";
import { useRules } from "@/components/ui/rules-provider/rules-provider";

// What one Turn allows (Core pp.178–180): one each of Movement, Combat Action and Simple Action, one Reflexive Action
// per Round, any Free Actions; a Multi-Action is +2 DN per extra action, a Full-Round Action takes the whole Turn.
// A reminder only: the table tracks what's spent. Action entries aren't linked traits, so they open by id.
const TURN_ACTIONS = [
  ["movement", "MOVE"],
  ["combat-actions", "ACTION"],
  ["simple-actions", "SIMPLE"],
  ["reflexive-actions", "REFLEXIVE 1/RND"],
  ["free-actions", "FREE"],
  ["multi-actions", "MULTI +2 DN"],
  ["full-round-actions", "FULL-ROUND"],
] as const;

export function TurnActions() {
  const { get, open } = useRules();
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }} aria-label="Actions this Turn">
      {TURN_ACTIONS.map(([id, label]) => {
        const rule = get(id);
        const chip = <span className="chip">{label}</span>;
        return rule ? (
          <button
            key={id}
            type="button"
            className="rule-link"
            aria-label={`Rule: ${rule.name}`}
            onClick={() => open([rule])}
          >
            {chip}
          </button>
        ) : (
          <span key={id}>{chip}</span>
        );
      })}
    </div>
  );
}
