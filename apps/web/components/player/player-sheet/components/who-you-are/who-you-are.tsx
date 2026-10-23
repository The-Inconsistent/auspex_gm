"use client";
import { useState } from "react";

import { rankOf, type Character, type CharacterDetail } from "@wg/shared";

import { DetailFields, DetailHelp, DetailView, hasDetail } from "@/components/ui/character-detail/character-detail";
import type { Send } from "@/hooks/use-table/use-table";

import { Heading } from "../heading/heading";

type WhoYouAreProps = {
  me: Character;
  send: Send;
  buildHref: string;
  onError: (error: string | null) => void;
};

// WHO YOU ARE: the Detail the player writes (Core pp.32–36), with EDIT and SAVE as the long sheet has them, then the XP
// and the way to spend it: the builder's ADVANCE screen for a character already made (Core pp.146–151), the builder from
// the top for one that isn't.
export function WhoYouAre({ me, send, buildHref, onError }: WhoYouAreProps) {
  const [detail, setDetail] = useState<Partial<CharacterDetail> | null>(null); // the text being edited, or null
  // Earned in play, what advancement hasn't spent yet, and Rank (Core p.146, +1 per 40 XP earned, at most 3). The server
  // keeps `xpSpent` from the last saved build, so no catalogue is needed to show it.
  const toSpend = Math.max(0, me.xp - me.xpSpent);
  const levelUp = toSpend > 0 && !!me.build;

  // SAVE: writes the detail and closes the editor, or keeps it open with the server's reason.
  const saveDetail = async () => {
    if (!detail) return;
    const r = await send({ type: "character.update", id: me.id, detail });
    onError(r.ok ? null : r.error);
    if (r.ok) setDetail(null);
  };

  return (
    <section className="ps-section" aria-label="Who you are">
      <Heading
        title="WHO YOU ARE"
        id="ps-who"
        aside={
          <>
            <DetailHelp />
            {!detail && (
              <button type="button" className="btn sm" onClick={() => setDetail(me.detail)}>
                {hasDetail(me.detail) ? "EDIT" : "WRITE"}
              </button>
            )}
          </>
        }
      />
      {detail ? (
        <>
          <DetailFields idPrefix="sheet-detail" value={detail} onChange={setDetail} />
          <div className="keys" style={{ paddingTop: 0 }}>
            <button type="button" className="btn sm primary" onClick={saveDetail}>
              SAVE
            </button>
            <button type="button" className="btn sm" onClick={() => setDetail(null)}>
              CANCEL
            </button>
          </div>
        </>
      ) : hasDetail(me.detail) ? (
        <DetailView detail={me.detail} />
      ) : (
        <div className="ps-ink2">Appearance, past, personality: not written yet.</div>
      )}
      <div className="ps-xp">
        <span className="mono ps-xp-line">
          XP <b>{me.xp}</b> EARNED · <b>{toSpend}</b> TO SPEND · RANK <b>{rankOf(me.xp)}</b>
        </span>
        <a className={levelUp ? "btn primary" : "btn"} href={buildHref}>
          {levelUp ? `LEVEL UP · SPEND ${toSpend} XP ›` : me.build ? "SPEND XP (BUILDER)" : "CHARACTER BUILDER"}
        </a>
      </div>
    </section>
  );
}
