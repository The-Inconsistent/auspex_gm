"use client";
import { useState } from "react";

import type { Codex, LiveState, MentionKind } from "@wg/shared";

import { holderOf, ItemGive } from "@/components/ui/item-give/item-give";
import { useMentions } from "@/components/ui/mentions/mentions-provider";
import type { Send } from "@/hooks/use-table/use-table";
import { revealAction } from "@/lib/scene-reveal/scene-reveal";

import type { SceneBeat } from "../../types";
import { RevealRow } from "./components/reveal-row/reveal-row";

type InThisSceneProps = {
  codex: Codex;
  characters: LiveState["characters"];
  beat: SceneBeat;
  fightLive: boolean;
  onStartFight: (beat: SceneBeat) => void;
  onError: (error: string | null) => void;
  send: Send;
};

// The panel beside the scene: its place, cast, handouts and items, each one tap to show or seal, then the fight it has
// ready. A whole-entry `codex.save` flips `revealed` (the way CODEX's REVEALED does), so a phone gets it at once.
export function InThisScene({ codex, characters, beat, fightLive, onStartFight, onError, send }: InThisSceneProps) {
  const { get, open } = useMentions();
  const [error, setError] = useState<string | null>(null);
  const fail = (e: string | null) => {
    setError(e);
    onError(e);
  };

  // SHOWN / SEALED: saves the whole entry with `revealed` flipped.
  const reveal = async (id: string, revealed: boolean) => {
    const action = revealAction({ codex, id, revealed });
    if (!action) return;
    const r = await send(action);
    fail(r.ok ? null : r.error);
  };

  // A name opens the same peek a mention does.
  const peek = (kind: MentionKind, id: string) => {
    const entry = get(kind, id);
    if (entry) open(entry);
  };

  const names = (ids: string[]) =>
    characters
      .filter((c) => ids.includes(c.id))
      .map((c) => c.name.toUpperCase())
      .join(", ");

  const places = codex.locations.filter((l) => l.id === beat.locationId);
  const cast = codex.npcs.filter((n) => beat.npcIds.includes(n.id));
  const handouts = codex.handouts.filter((h) => beat.handoutIds.includes(h.id));
  const items = codex.items.filter((i) => beat.itemIds.includes(i.id));
  const threats = beat.encounter.reduce((n, e) => n + e.count, 0);
  const empty = !places.length && !cast.length && !handouts.length && !items.length;

  return (
    <aside className="item scene-in" aria-label="In this scene">
      <div className="scene-in-head">
        <span>IN THIS SCENE</span>
        <span className="label">TAP A NAME TO PEEK</span>
      </div>
      <div className="scene-in-body">
        {empty && <div className="dim">Nothing is linked to this scene yet. EDIT it in STORY.</div>}
        {places.length > 0 && (
          <div>
            <div className="scene-gh">PLACE</div>
            {places.map((l) => (
              <RevealRow
                key={l.id}
                name={l.name}
                shown={l.revealed}
                onPeek={() => peek("location", l.id)}
                onToggle={() => reveal(l.id, !l.revealed)}
              />
            ))}
          </div>
        )}
        {cast.length > 0 && (
          <div>
            <div className="scene-gh">CAST</div>
            {cast.map((n) => (
              <RevealRow
                key={n.id}
                name={n.name}
                shown={n.revealed}
                onPeek={() => peek("npc", n.id)}
                onToggle={() => reveal(n.id, !n.revealed)}
              />
            ))}
          </div>
        )}
        {handouts.length > 0 && (
          <div>
            <div className="scene-gh">HANDOUTS</div>
            {handouts.map((h) => (
              <RevealRow
                key={h.id}
                name={h.title}
                shown={h.revealed}
                only={h.audience.length ? names(h.audience) || "PRIVATE" : undefined}
                onPeek={() => peek("handout", h.id)}
                onToggle={() => reveal(h.id, !h.revealed)}
              />
            ))}
          </div>
        )}
        {items.length > 0 && (
          <div>
            <div className="scene-gh">ITEMS</div>
            {items.map((it) => {
              const holder = holderOf(it, { codex, characters });
              return (
                <RevealRow key={it.id} name={it.name} shown={!!it.givenTo} onPeek={() => peek("item", it.id)}>
                  <span className="scene-holder dim">
                    {holder.label} {holder.name}
                  </span>
                  <ItemGive item={it} characters={characters} send={send} onError={fail} />
                </RevealRow>
              );
            })}
          </div>
        )}
        {error && <div className="red">! {error}</div>}
        <div className="scene-fight">
          <div className="scene-fight-line">
            <span className="label accent">FIGHT</span>
            <span>
              {fightLive ? (
                "A fight is under way"
              ) : threats > 0 ? (
                <>
                  <b>
                    {threats} Threat{threats > 1 ? "s" : ""} prepared
                  </b>
                </>
              ) : (
                "none prepared"
              )}
            </span>
          </div>
          {!fightLive && (
            <button type="button" className="btn primary" onClick={() => onStartFight(beat)}>
              {threats > 0 ? "START FIGHT" : "START A FIGHT"}
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
