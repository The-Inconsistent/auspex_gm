"use client";
import { useState } from "react";

import { flatTree, placeTree, type Codex, type LiveState } from "@wg/shared";

import { AttitudeChip } from "@/components/ui/attitude-chip/attitude-chip";
import { CodexPicture } from "@/components/ui/codex-picture/codex-picture";
import { CodexSearch } from "@/components/ui/codex-search/codex-search";
import { HandoutDoc } from "@/components/ui/handout-doc/handout-doc";
import { Mentions } from "@/components/ui/mentions/mentions";
import { nextSessionLine } from "@/lib/next-session/next-session";

import { MISSION_GROUPS } from "./constants";

type IntelProps = { codex: Codex; state: LiveState };

// The codex search (issue #198) over what this phone was shown; its hits replace the page below.
export function Intel(props: IntelProps) {
  const [query, setQuery] = useState("");
  return (
    <>
      <CodexSearch query={query} onQuery={setQuery} />
      {!query.trim() && <IntelPage {...props} />}
    </>
  );
}

function IntelPage({ codex, state }: IntelProps) {
  const handouts = [...codex.handouts].sort((a, b) => (b.revealedAt ?? "").localeCompare(a.revealedAt ?? ""));
  // Every recap, newest first (issue #195, §11.151): the latest open, the rest folded for a player catching up.
  const [last, ...older] = codex.sessions.filter((s) => s.recap).reverse();
  const { framework, frameworkBonus, patron, kind, limits, nextSessionAt, nextSessionPlace } = state.campaign;
  return (
    <>
      {/* When the table meets next (issue #197), in this phone's own time zone; the .ics carries it to a calendar. */}
      {nextSessionAt && (
        <div className="stack" style={{ gap: 4 }}>
          <div className="rule">NEXT SESSION</div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <b style={{ flex: 1 }}>{nextSessionLine(nextSessionAt, nextSessionPlace)}</b>
            <a className="btn sm" href={`/api/campaigns/${state.campaign.id}/next.ics`} download>
              ADD TO CALENDAR
            </a>
          </div>
        </div>
      )}
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
      {/* The adventures the GM has shown the party (toPlayerCodex sends only those; issue #196, §11.148–150). */}
      {codex.adventures.length > 0 && (
        <div className="stack" style={{ gap: 4 }}>
          <div className="rule">MISSION LOG</div>
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
      )}
      {last && (
        <div className="stack" style={{ gap: 4 }}>
          <div className="rule">
            PREVIOUSLY (SESSION {last.number}
            {last.title && ` · ${last.title.toUpperCase()}`})
          </div>
          <pre className="text">
            <Mentions text={last.recap} />
          </pre>
          {older.map((s) => (
            <details key={s.id}>
              <summary className="label">
                SESSION {s.number}
                {s.title && ` · ${s.title.toUpperCase()}`} · {new Date(s.startedAt).toLocaleDateString()}
              </summary>
              <pre className="text">
                <Mentions text={s.recap} />
              </pre>
            </details>
          ))}
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
          <HandoutDoc handout={h} />
        </div>
      ))}
      <div className="rule">KNOWN PERSONS</div>
      {codex.npcs.map((n) => (
        <div key={n.id} className="item">
          <b>{n.name.toUpperCase()}</b> <AttitudeChip attitude={n.attitude} />
          {n.role && <span className="dim">{n.role}</span>}
          {/* Only once the GM shows it: toPlayerCodex drops a held-back picture's id (issue #199). */}
          {n.imageId && <CodexPicture imageId={n.imageId} alt={n.name} />}
          {n.description && (
            <pre className="text">
              <Mentions text={n.description} self={n.id} />
            </pre>
          )}
        </div>
      ))}
      <div className="rule">KNOWN LOCATIONS</div>
      {/* Nested as the GM files them (issue #50); a place under a hidden one comes top-level (toPlayerCodex). */}
      {flatTree(placeTree(codex.locations)).map(({ row: l, depth }) => (
        <div key={l.id} className="item" style={{ marginLeft: depth * 18 }}>
          <b>{l.name.toUpperCase()}</b>
          {l.imageId && <CodexPicture imageId={l.imageId} alt={l.name} />}
          {l.description && (
            <pre className="text">
              <Mentions text={l.description} self={l.id} />
            </pre>
          )}
        </div>
      ))}
    </>
  );
}
