"use client";
import { useState } from "react";

import {
  AMMO_TYPES, Rarity, RARITY_DN, RequisitionKind, requisitionOutcome, requisitionSlot, requisitionTest, requisitionYield,
  type ActionResult, type Character,
} from "@wg/shared";

import type { Send } from "@/hooks/use-table/use-table";

import { REQUISITION_KINDS } from "../../constants";

type RequisitionFormProps = {
  character: Character; influence: number; sessionId: string | null; send: Send;
  onResult: (r: ActionResult, ok: string) => void;
};

const digits = (v: string) => Number(v.replace(/\D/g, "")) || 0;

// A requisition Influence Test (pp.205–206, p.229): the GM types in the item from the book, the player rolls
// Influence + bonus dice at the table, and the GM records the Icons.
export function RequisitionForm({ character: c, influence, sessionId, send, onResult }: RequisitionFormProps) {
  const [kind, setKind] = useState<RequisitionKind>("wargear");
  const [item, setItem] = useState("");
  const [value, setValue] = useState(0);
  const [rarity, setRarity] = useState<Rarity>("Common");
  const [keywords, setKeywords] = useState("");
  const [loadedWith, setLoadedWith] = useState("");
  const [icons, setIcons] = useState(0);
  const [spend, setSpend] = useState(0);
  const [complication, setComplication] = useState(false);

  const itemKeywords = keywords.split(",").map((k) => k.trim()).filter(Boolean);
  const t = requisitionTest({ keywords: c.stats.keywords, itemKeywords, value, rarity });
  const used = !!sessionId && c.stats.requisitioned[requisitionSlot(kind)] === sessionId;
  const shortfall = Math.max(0, t.dn - icons);
  const spent = Math.min(spend, shortfall, c.stats.wealth); // Wealth only tops up a failed roll
  const out = requisitionOutcome({ dn: t.dn, icons, spend: spent, complication, wealth: c.stats.wealth });
  const gets = kind === "wargear" ? item || "the item" : `${requisitionYield(kind, rarity)} ${item || "…"}`;

  // RECORD: the server re-checks Keywords, the session limit and Wealth, then adds the item on a success.
  const record = async () => {
    const r = await send({
      type: "character.requisition", id: c.id, kind, item, value, rarity, keywords: itemKeywords, icons, spend: spent, complication,
      loadedWith: kind === "wargear" && loadedWith.trim() ? loadedWith.trim() : undefined,
    });
    onResult(r, out.success ? `${c.name.toUpperCase()} REQUISITIONED ${gets.toUpperCase()}` : `${c.name.toUpperCase()}: REQUISITION FAILED`);
  };

  return (
    <div className="stack panel pad" style={{ gap: 8 }}>
      <div className="rule">── REQUISITION (p.205) ──</div>
      {!sessionId && <div className="amber">Start a session first: one Wargear and one Ammo Test per session.</div>}
      <div className="keys" style={{ paddingTop: 0 }} role="group" aria-label="What">
        {RequisitionKind.options.map((k) => (
          <button key={k} className={`btn sm ${kind === k ? "primary" : ""}`} aria-pressed={kind === k} onClick={() => setKind(k)}>{REQUISITION_KINDS[k]}</button>
        ))}
      </div>
      <div className="field"><label className="label" htmlFor={`rq-item-${c.id}`}>{kind === "wargear" ? "ITEM" : "AMMO TYPE"}</label>
        <input id={`rq-item-${c.id}`} className="input" list={kind === "wargear" ? undefined : "rq-ammo-types"} value={item} onChange={(e) => setItem(e.target.value)} />
        <datalist id="rq-ammo-types">{AMMO_TYPES.map((a) => <option key={a} value={a} />)}</datalist></div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <div className="field"><label className="label" htmlFor={`rq-value-${c.id}`}>VALUE</label>
          <input id={`rq-value-${c.id}`} className="input" style={{ width: 70 }} inputMode="numeric" value={value} onChange={(e) => setValue(digits(e.target.value))} /></div>
        <div className="field"><span className="label">RARITY</span>
          <div className="keys" style={{ paddingTop: 0 }} role="group" aria-label="Rarity">
            {Rarity.options.map((r) => (
              <button key={r} className={`btn sm ${rarity === r ? "primary" : ""}`} aria-pressed={rarity === r} onClick={() => setRarity(r)}>{r.toUpperCase()} +{RARITY_DN[r]}</button>
            ))}
          </div></div>
      </div>
      <div className="field"><label className="label" htmlFor={`rq-kw-${c.id}`}>ITEM KEYWORDS (comma separated)</label>
        <input id={`rq-kw-${c.id}`} className="input" value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="IMPERIUM, ADEPTUS ASTARTES, [ANY]" /></div>
      {kind === "wargear" && <div className="field"><label className="label" htmlFor={`rq-load-${c.id}`}>RANGED? LOADED WITH (+1 AMMO)</label>
        <input id={`rq-load-${c.id}`} className="input" list="rq-ammo-types" value={loadedWith} onChange={(e) => setLoadedWith(e.target.value)} placeholder="Bolt" /></div>}

      {t.eligible ? (
        <div>DN <b>{t.dn}</b> · ROLL INFLUENCE {influence}{t.bonusDice ? ` + ${t.bonusDice} BONUS` : ""} = <b>{influence + t.bonusDice} DICE</b>
          <span className="dim"> · MATCHES {[...t.shared, ...(t.any ? ["[ANY]"] : [])].join(", ")}</span></div>
      ) : (
        <div className="red">NO KEYWORD IN COMMON: {c.name.toUpperCase()} CAN'T REQUISITION THIS (p.205)</div>
      )}
      {used && <div className="red">{c.name.toUpperCase()} ALREADY MADE THIS SESSION'S {requisitionSlot(kind).toUpperCase()} TEST</div>}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end" }}>
        <div className="field"><label className="label" htmlFor={`rq-icons-${c.id}`}>ICONS ROLLED</label>
          <input id={`rq-icons-${c.id}`} className="input" style={{ width: 70 }} inputMode="numeric" value={icons} onChange={(e) => setIcons(digits(e.target.value))} /></div>
        {shortfall > 0 && c.stats.wealth > 0 && <div className="field"><label className="label" htmlFor={`rq-spend-${c.id}`}>SPEND WEALTH (HAS {c.stats.wealth}, SHORT {shortfall})</label>
          <input id={`rq-spend-${c.id}`} className="input" style={{ width: 70 }} inputMode="numeric" value={spent} onChange={(e) => setSpend(digits(e.target.value))} /></div>}
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input type="checkbox" checked={complication} onChange={(e) => setComplication(e.target.checked)} /> COMPLICATION (−1 WEALTH)</label>
      </div>
      <div className={out.success ? "amber" : "dim"}>
        {out.success ? `SUCCESS: GETS ${gets.toUpperCase()}` : "FAILS"} · WEALTH {c.stats.wealth} → {out.wealth}
      </div>
      <div><button className="btn primary" disabled={!sessionId || used || !t.eligible || !item.trim()} onClick={record}>RECORD</button></div>
    </div>
  );
}
