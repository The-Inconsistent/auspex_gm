"use client";
import { useMemo, useRef, useState } from "react";

import {
  Side,
  UNSEEN_ID,
  canAct,
  deriveStats,
  effectiveStrength,
  isOut,
  sideOf,
  skillTotal,
  threatStatus,
  type Character,
  type Combatant,
  type LiveState,
  type RuleEntry,
} from "@wg/shared";

import { RuleLink } from "@/components/ui/rule-link/rule-link";
import { RequestSpend } from "@/components/ui/request-spend/request-spend";
import { StatBlock } from "@/components/ui/stat-block/stat-block";
import { StatusChips } from "@/components/ui/status-chips/status-chips";
import { Track } from "@/components/ui/track/track";
import { TurnActions } from "@/components/ui/turn-actions/turn-actions";
import { WeaponLine } from "@/components/ui/weapon-line/weapon-line";
import type { Send } from "@/hooks/use-table/use-table";

import { weaponSkill } from "@/lib/sheet-pools/sheet-pools";

type FightProps = { state: LiveState; characterId: string; send: Send; legend: RuleEntry[] };

// What a combatant is doing this Round, in words (state is never colour alone): out of the fight (Slain, Dead) and
// ambushed in Round 1 (p.177) as @wg/shared's isOut and canAct decide, so the phone agrees with the tracker.
function turnWord(state: LiveState, c: Combatant) {
  const enc = state.encounter;
  if (c.id === enc?.currentId) return "ACTING";
  if (isOut(state, c)) return "OUT";
  if (c.acted) return "DONE";
  return canAct(state, c) ? "READY" : "AMBUSHED";
}

export function Fight({ state, characterId, send, legend }: FightProps) {
  const [open, setOpen] = useState<string | null>(null);
  const fieldRef = useRef<HTMLDivElement>(null);
  const chars = useMemo(() => new Map(state.characters.map((c) => [c.id, c])), [state.characters]);
  const enc = state.encounter;
  const me = chars.get(characterId);
  if (!enc) return <p className="pf-empty">No fight right now. The GM starts it, and this tab fills in.</p>;

  const mine = enc.combatants.find((c) => c.kind === "pc" && c.characterId === characterId);
  const myTurn = !!mine && enc.currentId === mine.id;
  const current = enc.combatants.find((c) => c.id === enc.currentId);
  const currentName = current
    ? current.kind === "pc"
      ? chars.get(current.characterId)?.name
      : current.label
    : enc.currentId === UNSEEN_ID
      ? "Unseen threat" // a hidden threat taking its Turn (§11.56)
      : null;
  const next = enc.upNext ?? null;
  const rows = (side: Side) => enc.combatants.filter((c) => sideOf(c) === side);
  const nextRows = next ? rows(next) : [];
  const after = next
    ? `${next.toUpperCase()} PICK · ${nextRows.filter((c) => canAct(state, c)).length}/${nextRows.length} TO ACT`
    : "NO ONE LEFT TO ACT";

  // Threat card header: expand its stat block, or collapse it if already open.
  const toggleOpen = (id: string) => setOpen(open === id ? null : id);
  // THE FIELD ›: scroll to both sides' lists and move focus there.
  const goToField = () => {
    fieldRef.current?.scrollIntoView({ block: "start" });
    fieldRef.current?.focus();
  };

  return (
    <div className="pf">
      {myTurn && me ? (
        <MyTurn me={me} state={state} send={send} after={after} onField={goToField} />
      ) : (
        <section className="pf-now slate-card cut" aria-label="Now acting">
          <span className="xmit">+++ NOW ACTING +++</span>
          <b className="pf-now-name">{currentName ?? `${(next ?? "—").toUpperCase()} PICK`}</b>
          <span className="mono pf-now-next">
            UP NEXT: {next ? `${next.toUpperCase()} PICK` : "—"}
            {mine ? ` · YOU: ${turnWord(state, mine)}` : ""}
          </span>
          <span className="pf-now-note">When the GM picks you, this phone buzzes and the header turns crimson.</span>
        </section>
      )}

      <div className="pf-field" ref={fieldRef} tabIndex={-1} aria-label="The field">
        {Side.options.map((side) => (
          <section key={side} className="pf-side" aria-label={side}>
            <div className="pf-h">
              <h2>{side.toUpperCase()}</h2>
              <i />
              <span className="mono">
                {rows(side).filter((c) => c.acted).length}/{rows(side).length} DONE
              </span>
            </div>
            <ul className={`pf-rows ${side}`}>
              {rows(side).map((c) => {
                const now = c.id === enc.currentId;
                const word = turnWord(state, c);
                const isMe = c.id === mine?.id;
                const ch = c.kind === "pc" ? chars.get(c.characterId) : undefined;
                const name = c.kind === "pc" ? (ch?.name ?? "?") : c.label;
                const conds = c.kind === "pc" ? (ch?.conditions ?? []) : c.conditions;
                const left = ch
                  ? deriveStats({ stats: ch.stats, overrides: ch.overrides, tier: state.campaign.tier }).maxWounds
                  : 0;
                const wounds = ch ? Math.max(0, left - ch.wounds) : 0;
                const head = (
                  <>
                    {c.kind === "threat" && c.marker && (
                      <span
                        role="img"
                        aria-label={`${c.marker} marker`}
                        className="pf-mk"
                        style={{ background: `var(--marker-${c.marker})` }}
                      />
                    )}
                    <b className="pf-name">{name}</b>
                    {isMe && <span className="pf-you">YOU</span>}
                    {c.kind === "pc" && ch && (
                      <span className="pf-bar">
                        <Track value={wounds} max={left} />
                        <span className="sr-only">
                          Wounds left {wounds}/{left}
                        </span>
                      </span>
                    )}
                    {c.kind === "threat" &&
                      (c.mobCount !== null ? (
                        <span className="mono pf-mob">
                          ×{c.mobCount} OF {c.mobStart}
                        </span>
                      ) : (
                        <span className="pf-bar">
                          <Track value={Math.max(0, c.maxWounds - c.wounds)} max={c.maxWounds} label="Wounds" />
                        </span>
                      ))}
                    <span className={`mono pf-st ${now ? "now" : ""}`}>{word}</span>
                  </>
                );
                // Only the header is a button, so the expanded stat block isn't read out as the button's name.
                return (
                  <li
                    key={c.id}
                    className={`pf-row ${now ? "now" : ""} ${isMe ? "me" : ""} ${c.acted && !now ? "done" : ""}`}
                  >
                    {c.kind === "threat" ? (
                      <button className="pf-hdr" aria-expanded={open === c.id} onClick={() => toggleOpen(c.id)}>
                        {head}
                      </button>
                    ) : (
                      <div className="pf-hdr">{head}</div>
                    )}
                    {(conds.length > 0 || (c.kind === "threat" && threatStatus(c).length > 0)) && (
                      <div className="pf-tags">
                        {c.kind === "threat" && <StatusChips items={threatStatus(c)} />}
                        {conds.map((k) => (
                          <RuleLink key={k} name={k}>
                            <span className="chip">{k.toUpperCase()}</span>
                          </RuleLink>
                        ))}
                      </div>
                    )}
                    {open === c.id &&
                      c.kind === "threat" &&
                      (c.stats ? (
                        <div className="pf-stats">
                          <StatBlock t={c.stats} tier={state.campaign.tier} legend={legend} />
                        </div>
                      ) : (
                        <span className="pf-restricted">Data restricted by the GM.</span>
                      ))}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

type MyTurnProps = { me: Character; state: LiveState; send: Send; after: string; onField: () => void };

// Your Turn: what it allows, your guns, and the two spend pools. One RequestSpend dialog per pool lists that pool's spends.
function MyTurn({ me, state, send, after, onField }: MyTurnProps) {
  const spend = { state, characterId: me.id, send };
  return (
    <>
      <section className="pf-sec">
        <div className="pf-h">
          <h2>THIS TURN</h2>
          <i />
        </div>
        <TurnActions />
        <span className="pf-cap">One of each, Core pp.178–180. Tap one to read it.</span>
      </section>

      {me.stats.weapons.length > 0 && (
        <section className="pf-sec">
          <div className="pf-h">
            <h2>STRIKE</h2>
            <i />
          </div>
          {me.stats.weapons.map((w) => {
            const skill = weaponSkill(w);
            return (
              <div key={w.name} className="pf-weapon slate-card cut">
                <span className="pool-badge" aria-label={`${skill} pool`}>
                  {skillTotal(me.stats, skill)}
                </span>
                <div className="pf-weapon-text">
                  <b>{w.name}</b>
                  <span className="pf-wl">
                    <WeaponLine weapon={w} strength={effectiveStrength(me.stats)} />
                  </span>
                </div>
              </div>
            );
          })}
        </section>
      )}

      <section className="pf-sec">
        <div className="pf-h">
          <h2>SPEND</h2>
          <i />
          <span className="mono">THE GM ANSWERS</span>
        </div>
        <div className="pf-spends">
          <RequestSpend
            pool="wrath"
            {...spend}
            className="pf-spend wrath cut"
            label={
              <>
                <span className="pf-spend-w">WRATH</span>
                <span className="pf-spend-s">REROLL · RESTORE SHOCK</span>
                <span className="mono pf-spend-c">YOU HOLD {me.wrath}</span>
              </>
            }
          />
          <RequestSpend
            pool="glory"
            {...spend}
            className="pf-spend glory cut"
            label={
              <>
                <span className="pf-spend-w">GLORY</span>
                <span className="pf-spend-s">DICE · DAMAGE · SEIZE</span>
                <span className="mono pf-spend-c">PARTY HOLDS {state.campaign.glory}</span>
              </>
            }
          />
        </div>
      </section>

      <div className="mono pf-after">
        <span>AFTER YOU: {after}</span>
        <button type="button" className="pf-link" onClick={onField}>
          THE FIELD ›
        </button>
      </div>
    </>
  );
}
