import { ATTRIBUTES, type Threat } from "@wg/shared";

import { weaponLine } from "@/lib/weapon-line/weapon-line";

type StatBlockProps = { t: Threat };

// Threat stat block in terminal form. The shape is the book's (Core p.323); the numbers come from the data files.
export function StatBlock({ t }: StatBlockProps) {
  const a = t.attributes;
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="rule">
        {t.name.toUpperCase()} · {t.source === "core" ? "CORE" : t.source.toUpperCase()} P.{t.page}
      </div>
      <div className="traits">
        {ATTRIBUTES.map((k) => (
          <div key={k}>
            <span className="label">{k}</span>
            <span className="v">{a[k]}</span>
          </div>
        ))}
      </div>
      <div className="traits">
        <div>
          <span className="label">DEF</span>
          <span className="v">{t.defence}</span>
        </div>
        <div>
          <span className="label">RES</span>
          <span className="v">{t.resilience.value}</span>
        </div>
        <div>
          <span className="label">WND</span>
          <span className="v">{t.wounds}</span>
        </div>
        <div>
          <span className="label">SHK</span>
          <span className="v">{t.shock ?? "–"}</span>
        </div>
        <div>
          <span className="label">SPD</span>
          <span className="v">{t.speed}</span>
        </div>
      </div>
      {t.resilience.note && <div className="dim">{t.resilience.note}</div>}
      <div>
        <span className="dim">SKILLS </span>
        {t.skills.default !== null && `Default ${t.skills.default}, `}
        {t.skills.list.map((s) => `${s.name} ${s.dice}${s.passive ? ` (Passive ${s.passive})` : ""}`).join(", ")}
      </div>
      {t.bonuses.map((b) => (
        <div key={b.name}>
          <b>{b.name}.</b> {b.text}
        </div>
      ))}
      {t.abilities.map((ab, i) => (
        <div key={i} className="stack" style={{ gap: 2 }}>
          <div>
            {ab.type && (
              <span className="accent">
                {ab.type}
                {ab.name ? ": " : ""}
              </span>
            )}
            <b>{ab.name}</b>
            {ab.text && ` ${ab.text}`}
          </div>
          {ab.weapons.map((w) => (
            <div key={w.name} style={{ paddingLeft: 12 }}>
              <b>
                {w.name}
                {w.count ? ` (${w.count})` : ""}
              </b>{" "}
              <span className="dim">{weaponLine({ weapon: w })}</span>
            </div>
          ))}
        </div>
      ))}
      {t.determination && (
        <div>
          <span className="dim">DETERMINATION </span>
          {t.determination}
        </div>
      )}
      <div className="dim">
        CONVICTION {t.conviction} · RESOLVE {t.resolve} · SIZE {t.size}
        {t.personalRuin ? ` · PERSONAL RUIN ${t.personalRuin}` : ""}
      </div>
      {t.options.map((o) => (
        <div key={o.name}>
          <span className="accent">{o.kind === "mob" ? "MOB OPTION" : "VARIANT"}: </span>
          <b>{o.name}</b> {o.text}
          {o.weapons.map((w) => (
            <div key={w.name} style={{ paddingLeft: 12 }}>
              <b>{w.name}</b> <span className="dim">{weaponLine({ weapon: w })}</span>
            </div>
          ))}
        </div>
      ))}
      {t.mobAbilities.map((m, i) => (
        <div key={i}>
          <span className="accent">MOB{m.type ? ` ${m.type}` : ""}: </span>
          <b>{m.name}</b> {m.text}
        </div>
      ))}
    </div>
  );
}
