import { Image as PdfImage, Text, View } from "@react-pdf/renderer";

import { ATTRIBUTES, attributeTotals, effectiveStrength, withMutations, type DerivedStats } from "@wg/shared";

import { skillRows, weaponPool } from "@/lib/sheet-pools/sheet-pools";

import type { SheetInput } from "../../sheet-input";
import { st, type SheetStyle } from "../../styles";
import { Field, padTo, Row, SheetBox, Stat } from "../sheet-parts/sheet-parts";

type PageOneProps = { sheet: SheetInput; d: DerivedStats; style: SheetStyle; art: string };

const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "");
const WEAPON_FLEX = [3.2, 1, 1, 0.8, 0.8, 0.8, 0.7, 0.7, 0.7, 3];

// Printed as the official sheet does (Core p.164's uses, in the sheet's words).
const WRATH_USES = ["Reroll all failed dice", "Make a narrative declaration", "Action to restore (Rank + Tier) Shock"];

// The sheet's first page (Core p.40): the head, Attributes and Skills beside Wrath, Objective and Survival, then
// Wargear. Current Wrath, Wounds and Shock are left for pencil.
export function PageOne({ sheet, d, style, art }: PageOneProps) {
  const s = sheet.stats;
  const total = attributeTotals(s);
  const rating = withMutations(s).skills;
  const skills = skillRows(s);
  const strength = effectiveStrength(s);
  const armourNote = [
    s.armour.invulnerable ? "Invulnerable" : null,
    s.armour.powered ? `Powered (${s.armour.powered})` : null,
    ...s.armour.traits,
  ].filter(Boolean);

  return (
    <>
      <View style={[st.row, { marginBottom: 6 }]}>
        <View style={{ flex: 1, paddingTop: 6, paddingRight: 10 }}>
          <Field label="Player Name:" style={{ width: "70%" }} />
          <Field label="Character Name:" value={sheet.name} style={{ width: "70%" }} />
          <View style={st.row}>
            <Field label="Tier:" value={sheet.tier} style={{ width: 55, marginRight: 8 }} />
            <Field label="Species:" value={s.species} style={{ flex: 1, marginRight: 8 }} />
            <Field label="Archetype:" value={s.archetype} style={{ flex: 2 }} />
          </View>
          <View style={st.row}>
            <Field label="Rank:" value={sheet.rank} style={{ width: 55, marginRight: 8 }} />
            <Field label="Faction:" style={{ flex: 1 }} />
          </View>
          <Field label="Background:" value={sheet.background} />
          <Field label="Keywords:" value={s.keywords.join(", ")} />
        </View>
        <PdfImage
          src={`${art}/sheet/${style === "art" ? "logo-art" : "logo-print"}.png`}
          style={{ width: 150, height: 70, objectFit: "contain" }}
        />
      </View>

      <View style={st.row}>
        <View style={{ flex: 1.45, borderRightWidth: 2.4, borderRightColor: "#1c1b1a" }}>
          <SheetBox title="ATTRIBUTES" art={art}>
            <Row head cells={["", ...ATTRIBUTES]} flex={[1.3, 1, 1, 1, 1, 1, 1, 1]} />
            <Row cells={["Rating", ...ATTRIBUTES.map((a) => s.attributes[a])]} flex={[1.3, 1, 1, 1, 1, 1, 1, 1]} />
            <Row
              cells={["Bonus", ...ATTRIBUTES.map((a) => signed(total[a] - s.attributes[a]))]}
              flex={[1.3, 1, 1, 1, 1, 1, 1, 1]}
            />
            <Row cells={["Total", ...ATTRIBUTES.map((a) => total[a])]} flex={[1.3, 1, 1, 1, 1, 1, 1, 1]} />
          </SheetBox>
          <SheetBox title="SKILLS" art={art}>
            <View style={st.row}>
              {[skills.slice(0, 9), skills.slice(9)].map((col, c) => (
                <View key={c} style={{ flex: 1, marginLeft: c ? 6 : 0 }}>
                  <Row head cells={["", "", "Rating", "Total"]} flex={[2.4, 0.7, 1, 1]} />
                  {col.map((r) => (
                    <Row
                      key={r.skill}
                      height={15}
                      cells={[r.skill, r.attribute, rating[r.skill] ?? 0, r.total]}
                      flex={[2.4, 0.7, 1, 1]}
                    />
                  ))}
                </View>
              ))}
            </View>
          </SheetBox>
        </View>

        <View style={{ flex: 1 }}>
          <SheetBox title="WRATH" art={art}>
            <View style={[st.rule, { height: 22, marginHorizontal: 20 }]} />
            <View style={[st.row, { marginTop: 4, alignItems: "center" }]}>
              <Text style={[st.labelBold, { width: 54, textAlign: "center" }]}>USES FOR WRATH</Text>
              <View style={{ flex: 1, borderLeftWidth: 0.5, paddingLeft: 5 }}>
                {WRATH_USES.map((u) => (
                  <Text key={u} style={[st.label, { marginVertical: 1.5 }]}>
                    {u}
                  </Text>
                ))}
              </View>
            </View>
          </SheetBox>
          <SheetBox title="OBJECTIVE" art={art}>
            <Text style={[st.text, { minHeight: 20 }]}>{sheet.objective}</Text>
            <View style={[st.row, { borderTopWidth: 0.5 }]}>
              <Stat label="CONVICTION" value={d.conviction} cap="= Wil" />
              <Stat label="SIZE" style={{ borderLeftWidth: 0.5 }} />
            </View>
            <View style={[st.row, { borderTopWidth: 0.5 }]}>
              <Stat label="RESOLVE" value={d.resolve} cap="= Wil − 1" />
              <Stat label="SPEED" value={d.speed} style={{ borderLeftWidth: 0.5 }} />
            </View>
          </SheetBox>
          <SheetBox title="SURVIVAL" art={art}>
            <View style={st.row}>
              <Stat label="DEFENCE" value={d.defence} cap="= I − 1" style={{ flexGrow: 0.8 }} />
              <View style={{ flexGrow: 2.2, flexBasis: 0, borderLeftWidth: 0.5 }}>
                <Text style={[st.labelBold, { textAlign: "center", marginTop: 2 }]}>RESILIENCE</Text>
                <View style={st.row}>
                  <Stat label="BASE +" value={d.resilience - s.armour.ar} cap="T + 1" />
                  <Stat label="ARMOUR =" value={s.armour.ar} />
                  <Stat label="TOTAL" value={d.resilience} />
                </View>
              </View>
            </View>
            <View style={[st.row, { borderTopWidth: 0.5, paddingTop: 2 }]}>
              <Text style={[st.labelBold, { flex: 1, textAlign: "center" }]}>WOUNDS</Text>
              <Text style={[st.labelBold, { flex: 1, textAlign: "center" }]}>SHOCK</Text>
            </View>
            {/* The blank cell beside each Max is the pencil box for the current count, as on the sheet. */}
            <View style={st.row}>
              <View style={{ flexGrow: 0.7, flexBasis: 0 }} />
              <Stat label="Max" value={d.maxWounds} cap="= T + (2× Tier)" style={{ borderLeftWidth: 0.5 }} />
              <View style={{ flexGrow: 0.7, flexBasis: 0, borderLeftWidth: 0.5 }} />
              <Stat label="Max" value={d.maxShock} cap="= Wil + Tier" style={{ borderLeftWidth: 0.5 }} />
            </View>
            <View style={st.row}>
              <View style={{ flexGrow: 2.4, flexBasis: 0 }} />
              <Stat
                label="Determination"
                value={d.determination}
                cap="= T"
                style={{ borderLeftWidth: 0.5, borderTopWidth: 0.5 }}
              />
            </View>
          </SheetBox>
        </View>
      </View>

      <SheetBox title="WARGEAR" art={art} wrap>
        <Row
          head
          cells={["Weapons", "Dice Pool", "Damage", "ED", "AP", "Salvo", "Range", "", "", "Traits"]}
          flex={WEAPON_FLEX}
        />
        {padTo(s.weapons, 4).map((w, i) =>
          w ? (
            <Row
              key={i}
              height={17}
              flex={WEAPON_FLEX}
              cells={[
                w.count ? `${w.name} (${w.count})` : w.name,
                weaponPool(s, w),
                w.addStrength ? strength + w.damage : w.damage,
                w.ed,
                w.ap ?? "–",
                w.salvo === undefined ? "" : (w.salvo ?? "–"),
                ...(w.range.length === 3 ? w.range : [w.range[0], "", ""]),
                [...w.traits, ...(w.upgradeNames ?? []), ...(w.effects ?? [])].join(", "),
              ]}
            />
          ) : (
            <Row key={i} height={17} flex={WEAPON_FLEX} cells={[]} />
          ),
        )}
        <View style={{ height: 6 }} />
        <Row head cells={["Armour", "AR", "Traits"]} flex={[3, 0.8, 6.2]} />
        <Row
          height={20}
          flex={[3, 0.8, 6.2]}
          cells={[
            s.armour.name,
            s.armour.name ? `${s.armour.ar}${s.armour.invulnerable ? "*" : ""}` : "",
            armourNote.join(", "),
          ]}
        />
        <View style={[st.row, { marginTop: 6 }]} wrap={false}>
          <View style={{ flex: 1, paddingRight: 6 }}>
            <Text style={st.label}>Gear:</Text>
            <Text style={[st.text, { minHeight: 26 }]}>{s.gear.join("; ")}</Text>
          </View>
          <Stat
            label="Influence"
            value={d.influence}
            cap="= Fel − 1"
            style={{ flexGrow: 0, flexBasis: 62, borderLeftWidth: 0.5 }}
          />
          <Stat
            label="Wealth"
            value={s.wealth}
            cap="= Tier"
            style={{ flexGrow: 0, flexBasis: 62, borderLeftWidth: 0.5 }}
          />
        </View>
      </SheetBox>
    </>
  );
}
