import type { Codex, LiveState } from "@wg/shared";

import { Mentions } from "@/components/ui/mentions/mentions";
import { nextSessionLine } from "@/lib/next-session/next-session";

import { MISSION_GROUPS } from "../../constants";

type StateProps = { state: LiveState };
type CodexProps = { codex: Codex };

// THE MISSION: the framework and what the whole table agreed (Core p.316, rules-flow §11.79), so nobody has to remember it.
export function Mission({ state }: StateProps) {
  const { framework, frameworkBonus, patron, kind, limits } = state.campaign;
  if (!framework && kind.length === 0 && limits.length === 0) return null;
  return (
    <div className="stack" style={{ gap: 4 }}>
      <div className="rule">THE MISSION</div>
      {framework && <pre className="text">{framework}</pre>}
      {frameworkBonus && <div className="dim">BONUS: {frameworkBonus}</div>}
      {patron && <div className="dim">PATRON: {patron}</div>}
      {kind.length > 0 && <div className="dim">KIND OF GAME: {kind.join(" · ")}</div>}
      {limits.length > 0 && <div className="dim">LEAVE OUT: {limits.join(" · ")}</div>}
    </div>
  );
}

// When the table meets next (issue #197), in this phone's own time zone; the .ics carries it to a calendar.
export function NextSession({ state }: StateProps) {
  const { nextSessionAt, nextSessionPlace, id } = state.campaign;
  if (!nextSessionAt) return null;
  return (
    <div className="stack" style={{ gap: 4 }}>
      <div className="rule">NEXT SESSION</div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <b style={{ flex: 1 }}>{nextSessionLine(nextSessionAt, nextSessionPlace)}</b>
        <a className="btn sm" href={`/api/campaigns/${id}/next.ics`} download>
          ADD TO CALENDAR
        </a>
      </div>
    </div>
  );
}

// The adventures the GM has shown the party (toPlayerCodex sends only those; issue #196, §11.148–150).
export function MissionLog({ codex, heading = true }: CodexProps & { heading?: boolean }) {
  if (codex.adventures.length === 0) return null;
  return (
    <div className="stack" style={{ gap: 4 }}>
      {heading && <div className="rule">MISSION LOG</div>}
      {MISSION_GROUPS.map(([status, label]) =>
        codex.adventures
          .filter((a) => a.status === status)
          .map((a) => (
            <div key={a.id}>
              <span className={`chip ${status === "running" ? "warn" : ""}`}>{label}</span>{" "}
              <b>{a.title.toUpperCase()}</b>
              {a.brief && <div className="dim">{a.brief}</div>}
            </div>
          )),
      )}
    </div>
  );
}

// Every recap, newest first (issue #195, §11.151): the latest open, the rest folded for a player catching up.
export function Recaps({ codex }: CodexProps) {
  const recaps = codex.sessions.filter((s) => s.recap).reverse();
  if (recaps.length === 0) return <div className="dim">No recaps yet.</div>;
  return (
    <div className="stack" style={{ gap: 8 }}>
      {recaps.map((s, i) => (
        <details key={s.id} open={i === 0}>
          <summary className="label">
            PREVIOUSLY · SESSION {s.number}
            {s.title && ` · ${s.title.toUpperCase()}`} · {new Date(s.startedAt).toLocaleDateString()}
          </summary>
          <pre className="text">
            <Mentions text={s.recap} />
          </pre>
        </details>
      ))}
    </div>
  );
}
