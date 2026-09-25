"use client";
import { startingXp } from "@wg/shared";

import { useBuilder } from "../../builder-context";
import { citeLabel } from "../../utils";

// The XP ledger (every purchase with its cost and page) and everything still to do, each a link to its screen.
export function XpLedger() {
  const { resolved: r, tier, go } = useBuilder();
  const budget = r?.budget ?? startingXp(tier);
  const spent = r?.spent ?? 0;
  const todo = [
    ...(r?.pending.map((p) => ({ ...p, kind: "TO DO", severity: "todo" as const })) ?? []),
    ...(r?.problems.map((p) => ({ ...p, kind: p.severity === "gm" ? "GM" : "FIX" })) ?? []),
  ];
  return (
    <div className="stack">
      <div className="tbar">
        <span>XP LEDGER</span>
        <span>
          {spent} / {budget}
        </span>
      </div>
      <div className="dim">
        {spent > budget ? `${spent - budget} over` : `${budget - spent} left`} · Tier {tier} × 100 (Core p.20)
      </div>
      <table className="bld-ledger">
        <tbody>
          {r?.ledger.map((l, i) => (
            <tr key={i}>
              <td>
                {l.what}
                {l.cite && <div className="dim bld-cite">{l.cite}</div>}
              </td>
              <td>{l.xp}</td>
            </tr>
          ))}
          {!r?.ledger.length && (
            <tr>
              <td className="dim">Nothing bought yet</td>
              <td />
            </tr>
          )}
        </tbody>
      </table>
      <div className="tbar iron">
        <span>STILL TO DO</span>
        <span>{todo.length}</span>
      </div>
      {todo.length === 0 ? (
        <div className="dim">{r ? "Nothing left. Ready to save." : "Choose an archetype to begin."}</div>
      ) : (
        <ul className="bld-todo">
          {todo.map((t, i) => (
            <li key={i}>
              <button className={t.severity === "error" ? "bad" : ""} onClick={() => go(t.step)}>
                <span className="label">{t.kind}</span> <span>{t.what}</span>
                {t.cite && <span className="dim bld-cite"> {citeLabel(t.cite)}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
