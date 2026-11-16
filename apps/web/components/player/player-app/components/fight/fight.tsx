"use client";
import { useMemo, useRef, useState, type ReactNode } from "react";

import {
  Side,
  UNSEEN_ID,
  canAct,
  deriveStats,
  effectiveStrength,
  pcStatus,
  sideOf,
  skillTotal,
  threatStatus,
  turnMark,
  type Character,
  type Combatant,
  type LiveState,
  type RuleEntry,
  type ThreatCombatant,
} from "@wg/shared";

import { CombatOptions } from "@/components/ui/combat-options/combat-options";
import { RuleLink } from "@/components/ui/rule-link/rule-link";
import { StatBlock } from "@/components/ui/stat-block/stat-block";
import { StatusChips } from "@/components/ui/status-chips/status-chips";
import { Term } from "@/components/ui/term/term";
import { Track } from "@/components/ui/track/track";
import { WeaponLine } from "@/components/ui/weapon-line/weapon-line";
import type { Send } from "@/hooks/use-table/use-table";

import { weaponSkill } from "@/lib/sheet-pools/sheet-pools";

import { Harm } from "./components/harm/harm";
import { SpendSheet } from "./components/spend-sheet/spend-sheet";
import { StrikeSteps } from "./components/strike-steps/strike-steps";

type FightProps = { state: LiveState; characterId: string; send: Send; legend: RuleEntry[]; actions: RuleEntry[] };

// What a combatant is doing this Round, in words (state is never colour alone): @wg/shared's turnMark decides, so the
// phone agrees with the tracker (out of the fight, ambushed in Round 1 p.177, held p.177).
const TURN_WORDS = {
  out: "OUT",
  acting: "ACTING",
  ambushed: "AMBUSHED",
  held: "HELD",
  done: "DONE",
  ready: "READY",
} as const;
const turnWord = (state: LiveState, c: Combatant) => TURN_WORDS[turnMark(state, c)];

export function Fight({ state, characterId, send, legend, actions }: FightProps) {
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
  const setting = enc.round === 0; // Determine Ambushes, Set the Scene (p.176)
  const rows = (side: Side) => enc.combatants.filter((c) => sideOf(c) === side);
  const nextRows = next ? rows(next) : [];
  const after = next
    ? `${next.toUpperCase()} PICK · ${nextRows.filter((c) => canAct(state, c)).length}/${nextRows.length} TO ACT`
    : "NO ONE LEFT TO ACT";

  // Threat card header: expand its stat block, or collapse it if already open.
  const toggleOpen = (id: string) => setOpen(open === id ? null : id);
  // AGENTS ›: scroll to the field below (on your Turn, the Agents) and move focus there.
  const goToField = () => {
    fieldRef.current?.scrollIntoView({ block: "start" });
    fieldRef.current?.focus();
  };

  // The threat picked in 2 · PICK A TARGET; a slain one (a Mob at 0, Slain, p.324) is no target to aim at.
  const picked = enc.combatants.find((c): c is ThreatCombatant => c.kind === "threat" && c.id === open);
  const target = picked && !threatStatus(picked).includes("Slain") ? picked : null;

  // One combatant's row. On your Turn the Threats' rows are 2 · PICK A TARGET: opening one is the pick, the same tap that
  // shows its stat block anywhere else.
  const renderRow = (c: Combatant) => {
    const now = c.id === enc.currentId;
    const word = turnWord(state, c);
    const isMe = c.id === mine?.id;
    const ch = c.kind === "pc" ? chars.get(c.characterId) : undefined;
    const name = c.kind === "pc" ? (ch?.name ?? "?") : c.label;
    const conds = c.kind === "pc" ? (ch?.conditions ?? []) : c.conditions;
    const d = ch && deriveStats({ stats: ch.stats, overrides: ch.overrides, tier: state.campaign.tier });
    // A threat shows numbers once its stat block is shown; a bars-only one keeps the bar, as its maxima are stat block
    // values the GM is holding back (§11.56).
    const harm =
      c.kind === "pc" ? (
        ch && d && <Harm wounds={ch.wounds} maxWounds={d.maxWounds} shock={ch.shock} maxShock={d.maxShock} />
      ) : c.mobCount !== null ? (
        <span className="mono pf-mob">
          ×{c.mobCount} OF {c.mobStart}
        </span>
      ) : c.stats ? (
        <Harm wounds={c.wounds} maxWounds={c.maxWounds} shock={c.shock} maxShock={c.maxShock} />
      ) : (
        <span className="pf-bar">
          <Track value={Math.max(0, c.maxWounds - c.wounds)} max={c.maxWounds} label="Wounds" />
        </span>
      );
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
        {myTurn && c.id === target?.id && <span className="pf-you">TARGET</span>}
        {harm}
        <span className={`mono pf-st ${now ? "now" : ""}`}>{word}</span>
      </>
    );
    // Only the header is a button, so the expanded stat block isn't read out as the button's name.
    return (
      <li key={c.id} className={`pf-row ${now ? "now" : ""} ${isMe ? "me" : ""} ${c.acted && !now ? "done" : ""}`}>
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
            <span className="pf-restricted">
              No information on this threat. Ask the GM for a Scholar (Int) Test to learn more.
            </span>
          ))}
      </li>
    );
  };

  return (
    <div className="pf">
      {myTurn && me ? (
        <MyTurn
          me={me}
          state={state}
          send={send}
          after={after}
          onField={goToField}
          actions={actions}
          target={target}
          targets={<ul className="pf-rows threats">{rows("threats").map(renderRow)}</ul>}
        />
      ) : (
        <section className="pf-now slate-card cut" aria-label="Now acting">
          <span className="xmit">{setting ? "+++ BEFORE ROUND 1 +++" : "+++ NOW ACTING +++"}</span>
          <b className="pf-now-name">
            {setting ? "THE GM IS SETTING THE SCENE" : (currentName ?? `${(next ?? "—").toUpperCase()} PICK`)}
          </b>
          {!setting && (
            <span className="mono pf-now-next">
              UP NEXT: {next ? `${next.toUpperCase()} PICK` : "—"}
              {mine ? ` · YOU: ${turnWord(state, mine)}` : ""}
            </span>
          )}
          <span className="pf-now-note">
            {mine && turnMark(state, mine) === "ambushed"
              ? "You're ambushed: no Turn in Round 1 (p.177)."
              : "When the GM picks you, this phone buzzes and the header turns crimson."}
          </span>
        </section>
      )}

      <div className="pf-field" ref={fieldRef} tabIndex={-1} aria-label="The field">
        {/* On your Turn the Threats sit in 2 · PICK A TARGET, so the field below is the Agents. */}
        {(myTurn ? (["agents"] as const) : Side.options).map((side) => (
          <section key={side} className="pf-side" aria-label={side}>
            <div className="pf-h">
              <h2>{side.toUpperCase()}</h2>
              <i />
              <span className="mono">
                {rows(side).filter((c) => c.acted).length}/{rows(side).length} DONE
              </span>
            </div>
            <ul className={`pf-rows ${side}`}>{rows(side).map(renderRow)}</ul>
          </section>
        ))}
      </div>
    </div>
  );
}

type MyTurnProps = {
  me: Character;
  state: LiveState;
  send: Send;
  after: string;
  onField: () => void;
  actions: RuleEntry[];
  target: ThreatCombatant | null; // the threat opened in 2 · PICK A TARGET
  targets: ReactNode; // the Threats' rows, built by Fight so a tap there opens the same stat block
};

// Your Turn: what it allows (one OPTIONS dialog of the combat-action entries, Core pp.177–190), then the attack in the
// order it's made: 1 a weapon, 2 a target, 3 the dice steps for that pair; one SPEND button for both pools.
function MyTurn({ me, state, send, after, onField, actions, target, targets }: MyTurnProps) {
  const [picked, setPicked] = useState(0);
  const weapons = me.stats.weapons;
  const at = Math.min(picked, weapons.length - 1); // the list can shrink under a held pick
  const weapon = weapons[at];
  const status = pcStatus(me, deriveStats({ stats: me.stats, overrides: me.overrides, tier: state.campaign.tier }));
  return (
    <>
      <section className="pf-sec">
        <div className="pf-h">
          <h2>THIS TURN</h2>
          <i />
        </div>
        {actions.length > 0 && <CombatOptions actions={actions} weapons={weapons} />}
        <span className="pf-cap">One of each per Turn, Core pp.177–190. Tap one to read it.</span>
        {(me.stats.skills["Psychic Mastery"] ?? 0) > 0 && (
          <span className="pf-cap">
            A power: a 1 on a Wrath Die is <Term k="perils">Perils of the Warp</Term>.
          </span>
        )}
      </section>

      {weapon && (
        <section className="pf-sec">
          <div className="pf-h">
            <h2>1 · STRIKE</h2>
            <i />
            <span className="mono">PICK A WEAPON</span>
          </div>
          {weapons.map((w, i) => {
            const skill = weaponSkill(w);
            const on = w === weapon;
            return (
              // The WeaponLine holds rule-link buttons, so the pick is its own button and not the whole card.
              <div key={`${w.name}-${i}`} className={`pf-weapon slate-card cut ${on ? "on" : ""}`}>
                <button type="button" className="pf-pick" aria-pressed={on} onClick={() => setPicked(i)}>
                  <span className="pool-badge" aria-label={`${skill} pool`}>
                    {skillTotal(me.stats, skill)}
                  </span>
                  <b>{w.name}</b>
                </button>
                <span className="pf-wl">
                  <WeaponLine weapon={w} strength={effectiveStrength(me.stats)} />
                </span>
              </div>
            );
          })}
        </section>
      )}

      {/* Outside the weapon guard: an Agent with no weapon still sees the Threats on their Turn (a psyker, a fresh sheet). */}
      <section className="pf-sec">
        <div className="pf-h">
          <h2>{weapon ? "2 · PICK A TARGET" : "THREATS"}</h2>
          <i />
          <span className="mono">{target ? `› ${target.label.toUpperCase()}` : "TAP A THREAT"}</span>
        </div>
        {targets}
      </section>

      {weapon && (
        <section className="pf-sec">
          <div className="pf-h">
            <h2>3 · THEN, WITH YOUR DICE</h2>
            <i />
          </div>
          <StrikeSteps
            key={`${at}-${target?.id ?? ""}`}
            me={me}
            weapon={weapon}
            wounded={status.includes("Wounded")}
            target={target}
          />
        </section>
      )}

      <section className="pf-sec">
        <SpendSheet state={state} me={me} send={send} />
      </section>

      <div className="mono pf-after">
        <span>AFTER YOU: {after}</span>
        <button type="button" className="pf-link" onClick={onField}>
          AGENTS ›
        </button>
      </div>
    </>
  );
}
