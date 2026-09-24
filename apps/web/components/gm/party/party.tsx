"use client";
import QRCode from "qrcode";
import { useState, type ChangeEvent, type FormEvent } from "react";

import { CharacterStats, deriveStats, pcStatus, type ActionResult, type Character, type Codex, type LiveState } from "@wg/shared";

import { StatusChips } from "@/components/ui/status-chips/status-chips";
import type { Send } from "@/hooks/use-table/use-table";
import { TOKENS } from "@/lib/tokens/tokens";

import { QrDialog, type JoinQr } from "./components/qr-dialog/qr-dialog";
import { DEFAULT_XP, QR_SIZE, XP_AWARDS } from "./constants";

type PartyProps = { state: LiveState; codex: Codex; send: Send };

export function Party({ state, codex, send }: PartyProps) {
  const [name, setName] = useState("");
  const [qr, setQr] = useState<JoinQr | null>(null);
  const [importFor, setImportFor] = useState<string | null>(null);
  const [json, setJson] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [xp, setXp] = useState<number>(DEFAULT_XP);
  const [recap, setRecap] = useState("");
  const [framework, setFramework] = useState(state.campaign.framework);
  const [patron, setPatron] = useState(state.campaign.patron);
  const open = codex.sessions.find((s) => !s.endedAt);

  const report = (r: ActionResult, ok: string) => setMsg(r.ok ? ok : `! ${r.error}`);

  // SHOW QR: issues a fresh join token for the character and renders it as a QR code.
  const showQr = async (c: Character) => {
    const r = await send({ type: "token.issue", characterId: c.id });
    if (!r.ok || !r.token) return report(r, "");
    const url = `${window.location.origin}/join/${r.token}`;
    try {
      const img = await QRCode.toDataURL(url, { margin: 1, width: QR_SIZE, color: { dark: TOKENS.bg, light: TOKENS.fg } });
      setQr({ name: c.name, url, img });
    } catch (e) {
      setMsg(`! QR code failed: ${e instanceof Error ? e.message : "unknown error"}`);
    }
  };

  // LOAD: validates the pasted stats JSON and saves it on the character.
  const importStats = async (id: string) => {
    try {
      const stats = CharacterStats.parse(JSON.parse(json));
      report(await send({ type: "character.update", id, stats }), "STATS LOADED");
      setImportFor(null);
      setJson("");
    } catch (e) {
      setMsg(`! Invalid stats JSON: ${e instanceof Error ? e.message.slice(0, 200) : "parse error"}`);
    }
  };

  // XP input: digits only.
  const handleXpChange = (e: ChangeEvent<HTMLInputElement>) => setXp(Number(e.target.value.replace(/\D/g, "")) || 0);

  // LOAD STATS (JSON): opens the import box for this character, or closes it.
  const toggleImport = (id: string) => setImportFor(importFor === id ? null : id);

  // END SESSION: awards XP to everyone and saves the recap.
  const endSession = async () => report(await send({ type: "session.end", xp, recap }), `SESSION ENDED · +${xp} XP EACH`);

  // START SESSION: resets the pools per the rules.
  const startSession = async () => report(await send({ type: "session.start" }), "SESSION STARTED · POOLS RESET");

  // Framework SAVE.
  const saveFramework = async () => report(await send({ type: "campaign.update", framework, patron }), "FRAMEWORK SAVED");

  // RESPITE: a 6h rest; Wounds and Shock → 0, Wrath → 2.
  const respite = async (c: Character) => report(await send({ type: "character.respite", id: c.id }), `${c.name.toUpperCase()} RESPITE`);

  // REVOKE LINKS: kills every join token (and live socket) for the character.
  const revoke = async (c: Character) => report(await send({ type: "token.revoke", characterId: c.id }), `${c.name.toUpperCase()} LINKS REVOKED`);

  // ADD AGENT: creates a character with the typed name.
  const handleAddCharacter = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!name.trim()) return;
    report(await send({ type: "character.create", name: name.trim() }), `${name.toUpperCase()} ADDED`);
    setName("");
  };

  return (
    <div className="pad stack">
      {msg && <div className={msg.startsWith("!") ? "red" : "amber"}>{msg}</div>}

      <section className="cols">
        <div className="panel pad stack">
          <div className="rule">── SESSION ──</div>
          {open ? (
            <>
              <div>SESSION {open.number} IN PROGRESS</div>
              <div className="field"><label className="label" htmlFor="xp">XP EACH (8 / 10 / 12, p.321)</label>
                <div style={{ display: "flex", gap: 6 }} role="group" aria-label="XP each">{XP_AWARDS.map((n) => <button key={n} className={`btn ${xp === n ? "primary" : ""}`} aria-pressed={xp === n} onClick={() => setXp(n)}>{n}</button>)}
                  <input id="xp" className="input" style={{ width: 80 }} inputMode="numeric" value={xp} onChange={handleXpChange} /></div></div>
              <div className="field"><label className="label" htmlFor="recap">RECAP (players see this)</label>
                <textarea id="recap" className="input" value={recap} onChange={(e) => setRecap(e.target.value)} placeholder="Previously in Wrath & Glory…" /></div>
              <div><button className="btn primary" onClick={endSession}>END SESSION</button></div>
            </>
          ) : (
            <>
              <div className="dim">Starting a session resets per the rules (p.162): every Wrath → 2, Glory → 0, Ruin → {state.characters.length} (players).</div>
              <div><button className="btn primary" onClick={startSession}>START SESSION {codex.sessions.length + 1}</button></div>
            </>
          )}
        </div>

        <div className="panel pad stack">
          <div className="rule">── FRAMEWORK (p.18) ──</div>
          <div className="field"><label className="label" htmlFor="patron">PATRON</label><input id="patron" className="input" value={patron} onChange={(e) => setPatron(e.target.value)} /></div>
          <div className="field"><label className="label" htmlFor="fw">FRAMEWORK</label><textarea id="fw" className="input" value={framework} onChange={(e) => setFramework(e.target.value)} /></div>
          <div><button className="btn" onClick={saveFramework}>SAVE</button></div>
        </div>
      </section>

      <div className="rule">── KILL TEAM ──</div>
      <div className="list">
        {state.characters.map((c) => {
          const d = deriveStats({ stats: c.stats, overrides: c.overrides, tier: state.campaign.tier });
          return (
            <div key={c.id} className="item">
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <b style={{ flex: 1 }}>{c.name.toUpperCase()}</b>
                <span className="dim">{c.stats.archetype || "NO STATS YET"}</span>
                <StatusChips items={pcStatus(c, d)} />
                <span className="dim">XP {c.xp}</span>
              </div>
              <div className="dim">WND {c.wounds}/{d.maxWounds} · SHK {c.shock}/{d.maxShock} · WRATH {c.wrath} · DEF {d.defence} · RES {d.resilience}</div>
              <div className="keys">
                <button className="btn sm" onClick={() => showQr(c)}>SHOW QR</button>
                <button className="btn sm" onClick={() => toggleImport(c.id)}>LOAD STATS (JSON)</button>
                <button className="btn sm" onClick={() => respite(c)}>RESPITE</button>
                <button className="btn sm danger" onClick={() => revoke(c)}>REVOKE LINKS</button>
              </div>
              {importFor === c.id && (
                <div className="stack">
                  <textarea className="input" aria-label="Stats JSON" value={json} onChange={(e) => setJson(e.target.value)} placeholder='{"species":"Primaris Astartes","attributes":{…}}' />
                  <div><button className="btn primary" onClick={() => importStats(c.id)}>LOAD</button></div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <form style={{ display: "flex", gap: 8 }} onSubmit={handleAddCharacter}>
        <input className="input" aria-label="New character name" value={name} onChange={(e) => setName(e.target.value)} placeholder="NEW AGENT NAME" />
        <button className="btn">ADD AGENT</button>
      </form>

      {qr && <QrDialog qr={qr} onClose={() => setQr(null)} />}
    </div>
  );
}
