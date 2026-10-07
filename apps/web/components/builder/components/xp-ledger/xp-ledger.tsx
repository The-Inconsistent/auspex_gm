"use client";
import { startingXp, type LedgerRow } from "@wg/shared";

import { useBuilder } from "../../builder-context";
import { citeLabel } from "../../utils";

// Ledger rows with their costs and pages.
function Rows({ rows }: { rows: LedgerRow[] }) {
  return (
    <table className="bld-ledger">
      <tbody>
        {rows.map((l, i) => (
          <tr key={i}>
            <td>
              {l.what}
              {l.cite && <div className="dim bld-cite">{l.cite}</div>}
            </td>
            <td>{l.xp}</td>
          </tr>
        ))}
        {!rows.length && (
          <tr>
            <td className="dim">Nothing bought yet</td>
            <td />
          </tr>
        )}
      </tbody>
    </table>
  );
}

// What was bought in play, grouped by the session it was bought in (§11.69), the latest session first. Anything the
// server hasn't stamped yet comes last: a purchase on this screen that hasn't been saved, or one made before the app
// recorded when.
function BySession({ rows }: { rows: LedgerRow[] }) {
  const groups = new Map<number | null, LedgerRow[]>();
  for (const l of rows) groups.set(l.session ?? null, [...(groups.get(l.session ?? null) ?? []), l]);
  const order = [...groups.keys()].sort((a, b) => (a === null ? 1 : b === null ? -1 : b - a));
  if (!rows.length) return <Rows rows={[]} />;
  return (
    <>
      {order.map((k) => (
        <div className="stack" key={k ?? "unstamped"}>
          <div className="dim">{k === null ? "NOT RECORDED YET" : `SESSION ${k}`}</div>
          <Rows rows={groups.get(k)!} />
        </div>
      ))}
    </>
  );
}

// The XP ledger (every purchase with its cost and page): the creation budget, then the XP earned in play once the
// character is made, and everything still to do, each a link to its screen.
export function XpLedger() {
  const { resolved: r, tier, go, made } = useBuilder();
  const budget = r?.budget ?? startingXp(tier);
  const spent = r?.spent ?? 0;
  const adv = r?.advancement;
  const todo = [
    ...(r?.pending.map((p) => ({ ...p, kind: "TO DO", severity: "todo" as const })) ?? []),
    ...(r?.problems.map((p) => ({ ...p, kind: p.severity === "gm" ? "GM" : "FIX" })) ?? []),
  ];
  return (
    <div className="stack">
      <div className="tbar">
        <span>XP LEDGER · CREATION</span>
        <span>
          {spent} / {budget}
        </span>
      </div>
      <div className="dim">
        {spent > budget ? `${spent - budget} over` : `${budget - spent} left`} · Tier {tier} × 100 (Core p.20)
      </div>
      <Rows rows={r?.ledger.filter((l) => !l.pool) ?? []} />
      {made && adv && (
        <>
          <div className="tbar">
            <span>IN PLAY · RANK {adv.rank}</span>
            <span>
              {adv.spent} / {adv.budget}
            </span>
          </div>
          <div className="dim">
            {adv.spent > adv.budget ? `${adv.spent - adv.budget} over` : `${adv.budget - adv.spent} left`} of the XP
            earned (Core p.146)
          </div>
          <BySession rows={r?.ledger.filter((l) => l.pool) ?? []} />
        </>
      )}
      <div className="tbar iron">
        <span>STILL TO DO</span>
        <span>{todo.length}</span>
      </div>
      {todo.length === 0 ? (
        <div className="dim">
          {r ? "Nothing left. Ready to save." : "Choose an archetype, or Advanced Creation, to begin."}
        </div>
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
