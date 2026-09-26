import { sourceCite, type RuleEntry } from "@wg/shared";

import { RULE_KIND_LABELS } from "@/components/ui/rules-ref/constants";

type RuleItemProps = { r: RuleEntry };

// One rules entry as a disclosure row: name, kind and cite, gist; the book text when opened. Stat entries lead with
// the label the stat block prints ("SHK · Shock"), so a player can find what they're looking at.
export function RuleItem({ r }: RuleItemProps) {
  return (
    <details className="item rule-item">
      <summary className="item-head">
        <b className="rule-name">
          {r.abbr && <span className="accent">{r.abbr} · </span>}
          {r.name}
        </b>
        <span className="label rule-meta">
          {r.type ?? RULE_KIND_LABELS[r.kind]} · {sourceCite(r)}
        </span>
        <span className="rule-gist">{r.gist}</span>
      </summary>
      <pre className="text">{r.text}</pre>
    </details>
  );
}
