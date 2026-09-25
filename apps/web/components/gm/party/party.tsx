"use client";
import QRCode from "qrcode";
import { useState, type ChangeEvent, type FormEvent } from "react";

import {
  CharacterStats,
  deriveStats,
  pcStatus,
  type ActionResult,
  type Character,
  type Codex,
  type LiveState,
  type Member,
  type Wargear,
} from "@wg/shared";

import { NEW_CHARACTER } from "@/components/builder/constants";
import { StatusChips } from "@/components/ui/status-chips/status-chips";
import type { Send } from "@/hooks/use-table/use-table";
import { TOKENS } from "@/lib/tokens/tokens";

import { QrDialog, type JoinQr } from "./components/qr-dialog/qr-dialog";
import { RequisitionForm } from "./components/requisition-form/requisition-form";
import { CHARACTER_INVITE_HOURS, DEFAULT_XP, QR_SIZE, ROOM_INVITE_HOURS, XP_AWARDS } from "./constants";

type PartyProps = { state: LiveState; codex: Codex; send: Send; wargear: Wargear[] };

export function Party({ state, codex, send, wargear }: PartyProps) {
  const [name, setName] = useState("");
  const [qr, setQr] = useState<JoinQr | null>(null);
  const [importFor, setImportFor] = useState<string | null>(null);
  const [reqFor, setReqFor] = useState<string | null>(null);
  const [json, setJson] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [xp, setXp] = useState<number>(DEFAULT_XP);
  const [recap, setRecap] = useState("");
  const [framework, setFramework] = useState(state.campaign.framework);
  const [patron, setPatron] = useState(state.campaign.patron);
  const open = codex.sessions.find((s) => !s.endedAt);
  const { members, invites } = state.access;
  const seatOf = (characterId: string) => members.find((m) => m.characterId === characterId);
  const nameOf = (characterId: string | null) => state.characters.find((c) => c.id === characterId)?.name ?? "?";

  const report = (r: ActionResult, ok: string) => setMsg(r.ok ? ok : `! ${r.error}`);

  // Renders a join URL as a full-screen QR code.
  const showCode = async ({ title, url }: { title: string; url: string }) => {
    try {
      const img = await QRCode.toDataURL(url, {
        margin: 1,
        width: QR_SIZE,
        color: { dark: TOKENS.ink, light: TOKENS.vellum },
      });
      setQr({ title, url, img });
    } catch (e) {
      setMsg(`! QR code failed: ${e instanceof Error ? e.message : "unknown error"}`);
    }
  };

  // GUEST QR: a no-account join token for one character (the phone keeps it in a cookie).
  const showGuestQr = async (c: Character) => {
    const r = await send({ type: "token.issue", characterId: c.id });
    if (!r.ok || !r.token) return report(r, "");
    await showCode({ title: c.name, url: `${window.location.origin}/join/${r.token}` });
  };

  // INVITE: a single-use link for one character; the player signs in (or joins as a guest) and takes that seat.
  const inviteCharacter = async (c: Character) => {
    const r = await send({
      type: "invite.create",
      mode: "character",
      characterId: c.id,
      hours: CHARACTER_INVITE_HOURS,
    });
    if (!r.ok || !r.token) return report(r, "");
    await showCode({ title: `${c.name} invite`, url: `${window.location.origin}/invite/${r.token}` });
  };

  // ROOM QR: one code for the whole table tonight; each player claims an open agent or starts a new one.
  const inviteRoom = async () => {
    const r = await send({ type: "invite.create", mode: "room", hours: ROOM_INVITE_HOURS });
    if (!r.ok || !r.token) return report(r, "");
    await showCode({ title: "Room", url: `${window.location.origin}/invite/${r.token}` });
  };

  // REVOKE (invite): the link stops working; anyone already seated keeps their seat.
  const revokeInvite = async (id: string) => report(await send({ type: "invite.revoke", id }), "INVITE REVOKED");

  // REMOVE (member): takes away their seat and disconnects them.
  const removeMember = async (m: Member) =>
    report(await send({ type: "member.remove", userId: m.userId }), `${m.name.toUpperCase()} REMOVED`);

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

  // REQUISITION: opens the requisition form for this character, or closes it.
  const toggleReq = (id: string) => setReqFor(reqFor === id ? null : id);

  // A recorded requisition closes its form.
  const requisitioned = (r: ActionResult, ok: string) => {
    report(r, ok);
    if (r.ok) setReqFor(null);
  };

  // XP input: digits only.
  const handleXpChange = (e: ChangeEvent<HTMLInputElement>) => setXp(Number(e.target.value.replace(/\D/g, "")) || 0);

  // LOAD STATS (JSON): opens the import box for this character, or closes it.
  const toggleImport = (id: string) => setImportFor(importFor === id ? null : id);

  // CANCEL (import box): closes it and drops the pasted JSON.
  const cancelImport = () => {
    setImportFor(null);
    setJson("");
  };

  // END SESSION: awards XP to everyone and saves the recap.
  const endSession = async () =>
    report(await send({ type: "session.end", xp, recap }), `SESSION ENDED · +${xp} XP EACH`);

  // START SESSION: resets the pools per the rules.
  const startSession = async () => report(await send({ type: "session.start" }), "SESSION STARTED · POOLS RESET");

  // Framework SAVE.
  const saveFramework = async () =>
    report(await send({ type: "campaign.update", framework, patron }), "FRAMEWORK SAVED");

  // RESPITE: a 6h rest; Wounds and Shock → 0, Wrath → 2.
  const respite = async (c: Character) =>
    report(await send({ type: "character.respite", id: c.id }), `${c.name.toUpperCase()} RESPITE`);

  // ±1 WEALTH: the GM's adventure award or loot (p.206); players spend their own from the sheet.
  const adjWealth = async (c: Character, wealth: number) =>
    report(
      await send({ type: "character.supply", id: c.id, wealth }),
      `${c.name.toUpperCase()} WEALTH ${wealth > 0 ? "+" : ""}${wealth}`,
    );

  // REVOKE GUEST QR: kills every guest token (and guest socket) for the character; signed-in members keep their seat.
  const revoke = async (c: Character) =>
    report(await send({ type: "token.revoke", characterId: c.id }), `${c.name.toUpperCase()} GUEST LINKS REVOKED`);

  // ADD AGENT: creates a character with the typed name.
  const handleAddCharacter = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!name.trim()) return;
    report(await send({ type: "character.create", name: name.trim() }), `${name.toUpperCase()} ADDED`);
    setName("");
  };

  return (
    <div className="pad stack">
      {msg && <div className={msg.startsWith("!") ? "red" : "accent"}>{msg}</div>}

      <section className="cols">
        <div className="panel pad stack">
          <div className="rule">SESSION</div>
          {open ? (
            <>
              <div>SESSION {open.number} IN PROGRESS</div>
              <div className="field">
                <label className="label" htmlFor="xp">
                  XP EACH (8 / 10 / 12, p.321)
                </label>
                <div style={{ display: "flex", gap: 6 }} role="group" aria-label="XP each">
                  {XP_AWARDS.map((n) => (
                    <button
                      key={n}
                      className={`btn ${xp === n ? "primary" : ""}`}
                      aria-pressed={xp === n}
                      onClick={() => setXp(n)}
                    >
                      {n}
                    </button>
                  ))}
                  <input
                    id="xp"
                    className="input"
                    style={{ width: 80 }}
                    inputMode="numeric"
                    value={xp}
                    onChange={handleXpChange}
                  />
                </div>
              </div>
              <div className="field">
                <label className="label" htmlFor="recap">
                  RECAP (players see this)
                </label>
                <textarea
                  id="recap"
                  className="input"
                  value={recap}
                  onChange={(e) => setRecap(e.target.value)}
                  placeholder="Previously in Wrath & Glory…"
                />
              </div>
              <div>
                <button className="btn primary" onClick={endSession}>
                  END SESSION
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="dim">
                Starting a session resets per the rules (p.162): every Wrath → 2, Glory → 0, Ruin →{" "}
                {state.characters.length} (players).
              </div>
              <div>
                <button className="btn primary" onClick={startSession}>
                  START SESSION {codex.sessions.length + 1}
                </button>
              </div>
            </>
          )}
        </div>

        <div className="panel pad stack">
          <div className="rule">FRAMEWORK (p.18)</div>
          <div className="field">
            <label className="label" htmlFor="patron">
              PATRON
            </label>
            <input id="patron" className="input" value={patron} onChange={(e) => setPatron(e.target.value)} />
          </div>
          <div className="field">
            <label className="label" htmlFor="fw">
              FRAMEWORK
            </label>
            <textarea id="fw" className="input" value={framework} onChange={(e) => setFramework(e.target.value)} />
          </div>
          <div>
            <button className="btn" onClick={saveFramework}>
              SAVE
            </button>
          </div>
        </div>
      </section>

      <section className="panel pad stack">
        <div className="rule">TABLE ACCESS</div>
        <div className="keys" style={{ paddingTop: 0 }}>
          <button className="btn primary" onClick={inviteRoom}>
            ROOM QR
          </button>
          <span className="dim">
            Players scan it, sign in or join as a guest, and claim an agent. Live {ROOM_INVITE_HOURS} h.
          </span>
        </div>
        {invites.length > 0 && (
          <div className="list">
            {invites.map((i) => (
              <div key={i.id} className="item" style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <span style={{ flex: 1 }}>
                  {i.mode === "room" ? "ROOM" : nameOf(i.characterId).toUpperCase()} · {i.uses} USED
                  {i.allowGuests ? "" : " · ACCOUNTS ONLY"}
                </span>
                <span className="dim">UNTIL {new Date(i.expiresAt).toLocaleString()}</span>
                <button className="btn sm danger" onClick={() => revokeInvite(i.id)}>
                  REVOKE
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="label">SIGNED IN</div>
        {members.map((m) => (
          <div key={m.userId} style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <span style={{ flex: 1 }}>
              {m.name.toUpperCase()} ·{" "}
              {m.role === "gm" ? "GM" : m.characterId ? nameOf(m.characterId).toUpperCase() : "NO AGENT"}
            </span>
            {m.role === "player" && (
              <button className="btn sm danger" onClick={() => removeMember(m)}>
                REMOVE
              </button>
            )}
          </div>
        ))}
      </section>
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
              <div className="dim">{seatOf(c.id) ? `PLAYED BY ${seatOf(c.id)!.name.toUpperCase()}` : "OPEN SEAT"}</div>
              <div className="dim">
                WEALTH {c.stats.wealth} · AMMO{" "}
                {Object.entries(c.stats.ammo)
                  .map(([k, n]) => `${n} ${k}`)
                  .join(", ") || "NONE"}
              </div>
              <div className="dim">
                WND {c.wounds}/{d.maxWounds} · SHK {c.shock}/{d.maxShock} · WRATH {c.wrath} · DEF {d.defence} · RES{" "}
                {d.resilience}
              </div>
              <div className="keys">
                <a className="btn sm" href={`/c/${state.campaign.id}/build/${c.id}`}>
                  {c.build ? "REBUILD" : "BUILD"}
                </a>
                <button className="btn sm" onClick={() => inviteCharacter(c)}>
                  INVITE
                </button>
                <button className="btn sm" onClick={() => showGuestQr(c)}>
                  GUEST QR
                </button>
                <button className="btn sm" aria-expanded={importFor === c.id} onClick={() => toggleImport(c.id)}>
                  LOAD STATS (JSON)
                </button>
                <button className="btn sm" onClick={() => respite(c)}>
                  RESPITE
                </button>
                <button className="btn sm" aria-expanded={reqFor === c.id} onClick={() => toggleReq(c.id)}>
                  REQUISITION
                </button>
                <button className="btn sm" onClick={() => adjWealth(c, 1)}>
                  +1 WEALTH
                </button>
                <button className="btn sm" onClick={() => adjWealth(c, -1)}>
                  −1 WEALTH
                </button>
                <button className="btn sm danger" onClick={() => revoke(c)}>
                  REVOKE GUEST QR
                </button>
              </div>
              {reqFor === c.id && (
                <RequisitionForm
                  character={c}
                  catalogue={wargear}
                  influence={d.influence}
                  sessionId={open?.id ?? null}
                  send={send}
                  onResult={requisitioned}
                  onCancel={() => setReqFor(null)}
                />
              )}
              {importFor === c.id && (
                <div className="stack">
                  <textarea
                    className="input"
                    aria-label="Stats JSON"
                    value={json}
                    onChange={(e) => setJson(e.target.value)}
                    placeholder='{"species":"Primaris Astartes","attributes":{…}}'
                  />
                  <div className="keys">
                    <button className="btn primary" onClick={() => importStats(c.id)}>
                      LOAD
                    </button>
                    <button className="btn" onClick={cancelImport}>
                      CANCEL
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <form style={{ display: "flex", gap: 8 }} onSubmit={handleAddCharacter}>
        <input
          className="input"
          aria-label="New character name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="NEW AGENT NAME"
        />
        <button className="btn">ADD AGENT</button>
        <a className="btn" href={`/c/${state.campaign.id}/build/${NEW_CHARACTER}`}>
          NEW FROM BUILDER
        </a>
      </form>

      {qr && <QrDialog qr={qr} onClose={() => setQr(null)} />}
    </div>
  );
}
