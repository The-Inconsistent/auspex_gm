"use client";
import { dnLabel, testTitle, type Threat } from "@wg/shared";

import { RuleIdLink } from "@/components/ui/rule-link/rule-link";
import { StatBlock } from "@/components/ui/stat-block/stat-block";
import type { HazardView } from "@/lib/hazards/hazards";

type HazardChipsProps = { view: HazardView; bestiary: Threat[]; tier: number };

// "on-fire" → "On Fire": a Condition's name from its rule id.
const conditionName = (id: string) =>
  id
    .split("-")
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(" ");

// A place's hazard on the CODEX list and the PREP card (issue #49): its Tests as chips, its Conditions as rule links, the
// Threats it brings with their stat blocks, and the printed result folded away. GM-only.
export function HazardChips({ view, bestiary, tier }: HazardChipsProps) {
  return (
    <div className="stack" style={{ gap: 4 }}>
      {(view.tests.length > 0 || view.conditions.length > 0) && (
        <div className="keys" style={{ paddingTop: 0, alignItems: "center" }}>
          {view.tests.map((t, i) => (
            <span key={i} className="chip" title={t.purpose}>
              {dnLabel(t)} · {testTitle(t)}
            </span>
          ))}
          {view.conditions.map((c) => (
            <RuleIdLink key={c} id={c}>
              <span className="chip">{conditionName(c)}</span>
            </RuleIdLink>
          ))}
        </div>
      )}
      {view.threats.map(({ threatId, count }) => {
        const threat = bestiary.find((t) => t.id === threatId);
        return (
          <details key={threatId}>
            <summary style={{ cursor: "pointer" }}>
              <b>{threat?.name ?? threatId}</b>{" "}
              <span className="dim">{typeof count === "object" ? "" : `×${count} · `}stat block</span>
            </summary>
            {threat ? <StatBlock t={threat} tier={tier} /> : <div className="dim">Not in the loaded bestiary.</div>}
          </details>
        );
      })}
      {view.note && <div className="dim">{view.note}</div>}
      {view.text && (
        <details>
          <summary className="dim" style={{ cursor: "pointer" }}>
            {view.own ? "WHAT HAPPENS" : "AS PRINTED"}
          </summary>
          <pre className="text">{view.text}</pre>
        </details>
      )}
    </div>
  );
}
