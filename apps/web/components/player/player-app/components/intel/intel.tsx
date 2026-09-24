import type { Codex, LiveState } from "@wg/shared";

type IntelProps = { codex: Codex; state: LiveState };

export function Intel({ codex, state }: IntelProps) {
  const handouts = [...codex.handouts].sort((a, b) => (b.revealedAt ?? "").localeCompare(a.revealedAt ?? ""));
  const last = [...codex.sessions].reverse().find((s) => s.recap);
  return (
    <>
      {state.campaign.framework && (
        <div className="stack" style={{ gap: 4 }}>
          <div className="rule">── MISSION ──</div>
          <pre className="text">{state.campaign.framework}</pre>
          {state.campaign.patron && <div className="dim">PATRON: {state.campaign.patron}</div>}
        </div>
      )}
      {last && (
        <div className="stack" style={{ gap: 4 }}>
          <div className="rule">── PREVIOUSLY (SESSION {last.number}) ──</div>
          <pre className="text">{last.recap}</pre>
        </div>
      )}
      <div className="rule">── HANDOUTS ──</div>
      {handouts.length === 0 && <div className="dim">No transmissions received.</div>}
      {handouts.map((h) => (
        <div key={h.id} className="item">
          <b>{h.title.toUpperCase()}</b>
          <pre className="text">{h.body}</pre>
        </div>
      ))}
      <div className="rule">── KNOWN PERSONS ──</div>
      {codex.npcs.map((n) => (
        <div key={n.id} className="item">
          <b>{n.name.toUpperCase()}</b>
          {n.role && <span className="dim">{n.role}</span>}
          {n.description && <pre className="text">{n.description}</pre>}
        </div>
      ))}
      <div className="rule">── KNOWN LOCATIONS ──</div>
      {codex.locations.map((l) => (
        <div key={l.id} className="item">
          <b>{l.name.toUpperCase()}</b>
          {l.description && <pre className="text">{l.description}</pre>}
        </div>
      ))}
    </>
  );
}
