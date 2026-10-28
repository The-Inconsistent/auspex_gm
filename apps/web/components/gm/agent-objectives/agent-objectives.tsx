import type { objectivesAt } from "@/lib/scene/scene";

type AgentObjectivesProps = { rows: ReturnType<typeof objectivesAt> };

// The Agents' missions tied here in PARTY (§11.163), on a closed plate like the GM notes: each is one player's secret,
// and the tablet sits on the table. One line each, whose then what; a met one is struck through and says DONE, so it
// isn't told by the strike alone. Not drawn when nothing is tied here.
export function AgentObjectives({ rows }: AgentObjectivesProps) {
  if (!rows.length) return null;
  return (
    <details className="field plate">
      <summary className="label">AGENT OBJECTIVES · {rows.length} · TAP TO REVEAL</summary>
      {rows.map(({ agent, objective: o }, i) => (
        <div key={i} className="agent-obj">
          <b>{agent.toUpperCase()}</b>
          <span className={o.done ? "agent-obj-done" : undefined}>{o.text}</span>
          {o.done && <span className="chip">DONE</span>}
        </div>
      ))}
    </details>
  );
}
