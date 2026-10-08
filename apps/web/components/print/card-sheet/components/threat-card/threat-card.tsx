import { Text, View } from "@react-pdf/renderer";

import { ATTRIBUTES, THREAT_CLASS_LABEL, threatCite, threatClassAt } from "@wg/shared";

import type { Card } from "@/lib/print-cards/print-cards";
import { weaponLine } from "@/lib/weapon-line/weapon-line";
import { TOKENS } from "@/lib/tokens/tokens";

import { s } from "../../styles";

type ThreatCardProps = { card: Extract<Card, { kind: "threat" }> };

// The stat block in the printed order (Core p.323), compacted to a card: class and Tier instead of the Tier grid, then
// keywords, attributes, the combat row, skills and the sub-bands. The numbers are the prepared ones, so a Profile or
// scaling prints as played, and the footer names them (Decision 3 on #203).
export function ThreatCard({ card }: ThreatCardProps) {
  const { t, tier, title, note, size } = card;
  const text = { ...s.body, fontSize: size };
  const band = (label: string) => (
    <Text
      style={{ ...s.rubric, fontSize: size - 0.5, marginTop: "1mm", borderBottomWidth: 0.4, borderColor: TOKENS.red }}
    >
      {label}
    </Text>
  );
  const cells = (row: [string, string | number | null][]) => (
    <View
      style={{
        flexDirection: "row",
        borderTopWidth: 0.4,
        borderBottomWidth: 0.4,
        borderColor: TOKENS.line,
        marginTop: "0.8mm",
      }}
    >
      {row.map(([label, v]) => (
        <View key={label} style={{ flex: 1, alignItems: "center", paddingVertical: "0.5mm" }}>
          <Text style={{ ...s.rubric, fontSize: size - 1.5 }}>{label}</Text>
          <Text style={{ ...text, fontWeight: 700 }}>{v ?? "–"}</Text>
        </View>
      ))}
    </View>
  );
  // flexShrink 0: in a fixed-height card react-pdf would squeeze each paragraph to fit, and the lines overlap. Let the
  // text run its length instead; `fitFontSize` sized the card for it.
  return (
    <>
      <View style={{ ...s.pad, flexShrink: 0, width: "100%" }}>
        <View style={{ ...s.rule, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
          <Text style={{ ...s.head, fontSize: size + 2.5, flex: 1 }}>{title.toUpperCase()}</Text>
          <Text style={{ ...text, ...s.dim, fontStyle: "italic" }}>{threatCite(t)}</Text>
        </View>
        <Text style={text}>
          <Text style={{ ...s.rubric, fontSize: size - 0.5 }}>{THREAT_CLASS_LABEL[threatClassAt(t, tier)]} </Text>
          at Tier {tier} · Threat {t.threat.map((c) => c ?? "–").join(" ")}
        </Text>
        <Text style={{ ...text, ...s.dim }}>{t.keywords.join(", ")}</Text>
        {cells(ATTRIBUTES.map((k) => [k.toUpperCase(), t.attributes[k]]))}
        {cells([
          ["DEF", t.defence],
          ["WND", t.wounds],
          ["SHK", t.shock],
          ["RES", t.resilience.value],
          ["SPD", t.speed],
          ["CONV", t.conviction],
          ["RESOLVE", t.resolve],
        ])}
        {t.resilience.note && <Text style={{ ...text, ...s.dim }}>Resilience: {t.resilience.note}</Text>}
        <Text style={{ ...text, marginTop: "0.6mm" }}>
          <Text style={{ fontWeight: 700 }}>Skills </Text>
          {t.skills.default !== null && `Default ${t.skills.default}, `}
          {t.skills.list.map((k) => `${k.name} ${k.dice}${k.passive ? ` (Passive ${k.passive})` : ""}`).join(", ")}
        </Text>
        {t.bonuses.length > 0 && band("BONUSES")}
        {t.bonuses.map((b) => (
          <Text key={b.name} style={text}>
            <Text style={{ fontWeight: 700 }}>{b.name}.</Text> {b.text}
          </Text>
        ))}
        {t.abilities.length > 0 && band("ABILITIES")}
        {t.abilities.map((ab, i) => (
          <View key={i}>
            <Text style={text}>
              {ab.type && (
                <Text style={{ color: TOKENS.red, fontWeight: 700 }}>
                  {ab.type}
                  {ab.name ? ": " : ""}
                </Text>
              )}
              <Text style={{ fontWeight: 700 }}>{ab.name}</Text>
              {ab.text && ` ${ab.text}`}
            </Text>
            {ab.weapons.map((w) => (
              <Text key={w.name} style={{ ...text, paddingLeft: "2mm" }}>
                <Text style={{ fontWeight: 700 }}>
                  {w.name}
                  {w.count ? ` (${w.count})` : ""}
                </Text>{" "}
                {weaponLine({ weapon: w })}
              </Text>
            ))}
          </View>
        ))}
        {t.determination && (
          <Text style={text}>
            <Text style={{ fontWeight: 700 }}>Determination </Text>
            {t.determination}
          </Text>
        )}
        <Text style={text}>
          Size {t.size}
          {t.personalRuin ? ` · Personal Ruin ${t.personalRuin}` : ""}
        </Text>
        {(t.options.length > 0 || t.mobAbilities.length > 0) && band("OPTIONS")}
        {t.options.map((o) => (
          <Text key={o.name} style={text}>
            <Text style={{ color: TOKENS.red, fontWeight: 700 }}>{o.kind === "mob" ? "MOB OPTION" : "VARIANT"}: </Text>
            <Text style={{ fontWeight: 700 }}>{o.name}</Text> {o.text}
            {o.weapons.map((w) => ` ${w.name}: ${weaponLine({ weapon: w })}.`).join("")}
          </Text>
        ))}
        {t.mobAbilities.map((m, i) => (
          <Text key={i} style={text}>
            <Text style={{ color: TOKENS.red, fontWeight: 700 }}>MOB{m.type ? ` ${m.type}` : ""}: </Text>
            <Text style={{ fontWeight: 700 }}>{m.name}</Text> {m.text}
          </Text>
        ))}
      </View>
      {note && (
        <Text
          style={{
            ...text,
            ...s.dim,
            fontStyle: "italic",
            position: "absolute",
            bottom: "2mm",
            left: "3mm",
            right: "3mm",
          }}
        >
          Prepared: {note}
        </Text>
      )}
    </>
  );
}
