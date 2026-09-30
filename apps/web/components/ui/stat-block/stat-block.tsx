import { ATTRIBUTES, threatCite, type RuleEntry, type Threat } from "@wg/shared";

import { Legend } from "@/components/ui/legend/legend";
import { PageCite } from "@/components/ui/page-cite/page-cite";
import { WeaponLine } from "@/components/ui/weapon-line/weapon-line";

type StatBlockProps = { t: Threat; tier?: number; legend?: RuleEntry[] };

// Threat stat block laid out as printed (Core p.323): title bar, Tier/Threat grid, keywords, attributes, then the
// sub-bands. The numbers come from the data files; `tier` highlights the campaign's column. `legend` (the stat rules)
// adds the (?) that explains each value.
export function StatBlock({ t, tier, legend }: StatBlockProps) {
  const a = t.attributes;
  const tiers = t.threat.length;
  return (
    <div className="sb">
      <div className="sb-title">
        <span>{t.name.toUpperCase()}</span>
        <i>
          <PageCite cite={threatCite(t)} />
        </i>
        {legend && legend.length > 0 && <Legend title="Reading a stat block" entries={legend} />}
      </div>
      <div className="sb-grid" style={{ gridTemplateColumns: `64px repeat(${tiers}, minmax(0, 1fr))` }}>
        <span className="sb-head" style={{ textAlign: "left" }}>
          TIER
        </span>
        {t.threat.map((_, i) => (
          <span key={i} className={`sb-head ${i + 1 === tier ? "cur" : ""}`}>
            {i + 1}
          </span>
        ))}
        <span style={{ textAlign: "left", fontWeight: 600 }}>Threat</span>
        {t.threat.map((c, i) => (
          <span
            key={i}
            className={i + 1 === tier ? "accent" : undefined}
            style={{ fontWeight: i + 1 === tier ? 700 : 400 }}
          >
            {c ?? "–"}
          </span>
        ))}
      </div>
      <div className="sb-body">
        <span className="label">KEYWORDS </span>
        <span className="kw">{t.keywords.join(", ")}</span>
      </div>
      <div className="sb-grid" style={{ gridTemplateColumns: `repeat(${ATTRIBUTES.length}, minmax(0, 1fr))` }}>
        {ATTRIBUTES.map((k) => (
          <span key={k} className="sb-head">
            {k.toUpperCase()}
          </span>
        ))}
        {ATTRIBUTES.map((k) => (
          <span key={k} className="sb-v">
            {a[k] ?? "–"}
          </span>
        ))}
      </div>
      <div className="sb-grid sb-shade" style={{ gridTemplateColumns: "repeat(5, minmax(0, 1fr))" }}>
        <span className="label">DEF</span>
        <span className="label">WND</span>
        <span className="label">SHK</span>
        <span className="label">RES</span>
        <span className="label">SPD</span>
        <span className="sb-v">{t.defence}</span>
        <span className="sb-v">{t.wounds}</span>
        <span className="sb-v">{t.shock ?? "–"}</span>
        <span className="sb-v">{t.resilience.value}</span>
        <span className="sb-v">{t.speed}</span>
      </div>
      {t.resilience.note && <div className="sb-body dim">Resilience: {t.resilience.note}</div>}
      <div className="sb-body">
        <span className="label">SKILLS </span>
        {t.skills.default !== null && `Default ${t.skills.default}, `}
        {t.skills.list.map((s) => `${s.name} ${s.dice}${s.passive ? ` (Passive ${s.passive})` : ""}`).join(", ")}
      </div>
      {t.bonuses.length > 0 && (
        <>
          <div className="sb-band">BONUSES</div>
          <div className="sb-body stack" style={{ gap: 4 }}>
            {t.bonuses.map((b) => (
              <div key={b.name}>
                <b>{b.name}.</b> {b.text}
              </div>
            ))}
          </div>
        </>
      )}
      {t.abilities.length > 0 && (
        <>
          <div className="sb-band">ABILITIES</div>
          <div className="sb-body stack" style={{ gap: 6 }}>
            {t.abilities.map((ab, i) => (
              <div key={i} className="stack" style={{ gap: 2 }}>
                <div>
                  {ab.type && (
                    <span className="accent" style={{ fontWeight: 700 }}>
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
                    <span className="dim">
                      <WeaponLine weapon={w} />
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </>
      )}
      {t.determination && (
        <>
          <div className="sb-band">DETERMINATION</div>
          <div className="sb-body">{t.determination}</div>
        </>
      )}
      <div className="sb-grid sb-shade" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
        <span className="label">CONVICTION</span>
        <span className="label">RESOLVE</span>
        <span className="label">SIZE</span>
        <span className="sb-v">{t.conviction ?? "–"}</span>
        <span className="sb-v">{t.resolve ?? "–"}</span>
        <span className="sb-v">{t.size}</span>
      </div>
      {t.personalRuin && <div className="sb-body">Personal Ruin {t.personalRuin}</div>}
      {(t.options.length > 0 || t.mobAbilities.length > 0) && (
        <>
          <div className="sb-band">OPTIONS</div>
          <div className="sb-body stack" style={{ gap: 6 }}>
            {t.options.map((o) => (
              <div key={o.name}>
                <span className="accent" style={{ fontWeight: 700 }}>
                  {o.kind === "mob" ? "MOB OPTION" : "VARIANT"}:{" "}
                </span>
                <b>{o.name}</b> {o.text}
                {o.weapons.map((w) => (
                  <div key={w.name} style={{ paddingLeft: 12 }}>
                    <b>{w.name}</b>{" "}
                    <span className="dim">
                      <WeaponLine weapon={w} />
                    </span>
                  </div>
                ))}
              </div>
            ))}
            {t.mobAbilities.map((m, i) => (
              <div key={i}>
                <span className="accent" style={{ fontWeight: 700 }}>
                  MOB{m.type ? ` ${m.type}` : ""}:{" "}
                </span>
                <b>{m.name}</b> {m.text}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
