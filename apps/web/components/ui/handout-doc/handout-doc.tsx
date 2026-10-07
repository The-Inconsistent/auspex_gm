import type { HandoutStyle } from "@wg/shared";

import { Mentions } from "@/components/ui/mentions/mentions";
import { voxLines } from "@/lib/vox-lines/vox-lines";

import { headerOf } from "./constants";

// `id` is the handout's own, so its text doesn't link to itself (Mentions, issue #200); a draft has none yet.
type HandoutDocProps = { handout: { id?: string; body: string; style: HandoutStyle; header: string } };

// A handout drawn as its prop (issue #204): the player's phone, the GM's preview and the editor share it, and the
// printed page (components/print/handout-sheet) draws the same frames. Original CSS and SVG, no Games Workshop marks.
// `plain` is the cogitator slate every handout had before styles, so an older one looks as it did.
export function HandoutDoc({ handout }: HandoutDocProps) {
  const { id, body, style } = handout;
  const head = headerOf(handout);
  const lines = style === "vox" ? voxLines(body) : [];
  if (style === "plain")
    return (
      <pre className="text slate">
        <Mentions text={body} self={id} />
      </pre>
    );
  return (
    <div className="handout-doc" data-style={style}>
      {style === "form" ? (
        <div className="hd-form-head">
          <span className="hd-head">{head}</span>
          <span className="hd-stamp-box" aria-hidden="true" />
        </div>
      ) : (
        <div className="hd-head">{head}</div>
      )}
      {style === "vox" ? (
        <>
          <div className="hd-noise" aria-hidden="true" />
          {/* The stamp column is as wide as the longest stamp, and absent when no line has one (Decision 3). */}
          <div className="hd-vox" data-stamped={lines.some((l) => l.stamp !== undefined) || undefined}>
            {lines.map((l, i) => (
              <div key={i} className="hd-vox-line">
                {l.stamp !== undefined && <span className="hd-vox-stamp">{l.stamp}</span>}
                <span className="hd-vox-text">
                  <Mentions text={l.text} self={id} />
                </span>
              </div>
            ))}
          </div>
          <div className="hd-noise" aria-hidden="true" />
        </>
      ) : (
        <pre className={`text ${style === "slate" || style === "form" ? "slate" : ""}`}>
          <Mentions text={body} self={id} />
        </pre>
      )}
      {style === "decree" && (
        <div className="hd-decree-foot">
          <svg className="hd-seal" viewBox="0 0 52 52" aria-hidden="true">
            <circle cx="26" cy="26" r="21" strokeWidth="6" strokeDasharray="3 2.2" />
            <circle cx="26" cy="26" r="13" className="hd-seal-ring" />
          </svg>
          <span className="hd-sign">Signed and sealed</span>
        </div>
      )}
    </div>
  );
}
