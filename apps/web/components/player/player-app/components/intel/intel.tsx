import { flatTree, placeTree, type Codex, type LiveState } from "@wg/shared";

import { AttitudeChip } from "@/components/ui/attitude-chip/attitude-chip";

type IntelProps = { codex: Codex; state: LiveState };

export function Intel({ codex, state }: IntelProps) {
  const handouts = [...codex.handouts].sort((a, b) => (b.revealedAt ?? "").localeCompare(a.revealedAt ?? ""));
  const last = [...codex.sessions].reverse().find((s) => s.recap);
  const { framework, frameworkBonus, patron, kind, limits } = state.campaign;
  return (
    <>
      {(framework || kind.length > 0 || limits.length > 0) && (
        <div className="stack" style={{ gap: 4 }}>
          <div className="rule">MISSION</div>
          {framework && <pre className="text">{framework}</pre>}
          {frameworkBonus && <div className="dim">BONUS: {frameworkBonus}</div>}
          {patron && <div className="dim">PATRON: {patron}</div>}
          {/* What the whole table agreed (Core p.316, rules-flow §11.79), so nobody has to remember it. */}
          {kind.length > 0 && <div className="dim">KIND OF GAME: {kind.join(" · ")}</div>}
          {limits.length > 0 && <div className="dim">LEAVE OUT: {limits.join(" · ")}</div>}
        </div>
      )}
      {last && (
        <div className="stack" style={{ gap: 4 }}>
          <div className="rule">PREVIOUSLY (SESSION {last.number})</div>
          <pre className="text">{last.recap}</pre>
        </div>
      )}
      <div className="rule">HANDOUTS</div>
      {handouts.length === 0 && <div className="dim">No transmissions received.</div>}
      {handouts.map((h) => (
        <div key={h.id} className="handout stack" style={{ gap: 8 }}>
          <span className="label">
            {h.title.toUpperCase()}
            {/* toPlayerCodex leaves the viewer alone in a private handout's audience. */}
            {h.audience.length > 0 && " · FOR YOUR EYES ONLY"}
          </span>
          <pre className="text slate">{h.body}</pre>
        </div>
      ))}
      <div className="rule">KNOWN PERSONS</div>
      {codex.npcs.map((n) => (
        <div key={n.id} className="item">
          <b>{n.name.toUpperCase()}</b> <AttitudeChip attitude={n.attitude} />
          {n.role && <span className="dim">{n.role}</span>}
          {n.description && <pre className="text">{n.description}</pre>}
        </div>
      ))}
      <div className="rule">KNOWN LOCATIONS</div>
      {/* Nested as the GM files them (issue #50); a place under a hidden one comes top-level (toPlayerCodex). */}
      {flatTree(placeTree(codex.locations)).map(({ row: l, depth }) => (
        <div key={l.id} className="item" style={{ marginLeft: depth * 18 }}>
          <b>{l.name.toUpperCase()}</b>
          {l.description && <pre className="text">{l.description}</pre>}
        </div>
      ))}
    </>
  );
}
