import { sourceCite, type RuleEntry } from "@wg/shared";

import { PageCite } from "@/components/ui/page-cite/page-cite";
import { RULE_KIND_LABELS } from "@/components/ui/rules-ref/constants";

type RuleItemProps = { r: RuleEntry; open?: boolean };

// One rules entry as a disclosure row: name, kind and cite, gist; the book text when opened. Stat entries lead with
// the label the stat block prints ("SHK · Shock"), so a player can find what they're looking at. `open` starts it
// expanded (the rule dialog).
export function RuleItem({ r, open }: RuleItemProps) {
  return (
    <details className="item rule-item" open={open}>
      <summary className="item-head">
        <b className="rule-name">
          {r.abbr && <span className="accent">{r.abbr} · </span>}
          {r.name}
        </b>
        <span className="label rule-meta">
          {r.type ?? RULE_KIND_LABELS[r.kind]} · <PageCite cite={sourceCite(r)} />
        </span>
        <span className="rule-gist">{r.gist}</span>
      </summary>
      <pre className="text">{r.text}</pre>
    </details>
  );
}
