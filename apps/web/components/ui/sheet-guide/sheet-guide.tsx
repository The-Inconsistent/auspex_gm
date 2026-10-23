"use client";
import { Term } from "@/components/ui/term/term";

// HOW TO READ THIS SHEET: the sheet in plain words for a first read, folded so it costs a regular nothing. Every term
// opens its meaning; the pages are the Core rulebook's.
export function SheetGuide() {
  return (
    <details className="sheet-guide">
      <summary>HOW TO READ THIS SHEET</summary>
      <ul>
        <li>
          <Term k="attributes" /> are your raw abilities; <Term k="skills" /> are your training. When something risky
          happens the GM calls a Test: roll <Term k="dice">the dice in a red badge</Term> (Attribute + Skill) and count
          your Icons. Reach the <Term k="dn">DN</Term> and you pass. <i>Core pp.119–121, 159–160</i>
        </li>
        <li>
          <Term k="defence" /> is how hard you are to hit, <Term k="resilience" /> how hard you are to hurt.{" "}
          <Term k="wounds" /> and <Term k="shock" /> are how much harm and strain you can take. <i>Core pp.36–37</i>
        </li>
        <li>
          A weapon&apos;s <Term k="dice">DICE</Term> is what you roll to attack with it. <Term k="damage">DMG</Term> is
          its damage, plus <Term k="ed">Extra Damage dice</Term> rolled on a hit; <Term k="ap">AP</Term> cuts through
          armour; <Term k="range" /> is in metres. <i>Core pp.207–208</i>
        </li>
        <li>
          <Term k="wrath" /> is yours to reroll a bad Test; <Term k="glory" /> belongs to the whole team.{" "}
          <i>Core p.164</i>
        </li>
        <li>
          <Term k="keywords" /> say who you belong to. <Term k="abilities" /> and <Term k="talents" /> are your special
          tricks, each with its book page. <i>Core pp.21, 128</i>
        </li>
      </ul>
      <span className="sheet-guide-tip">Tap any underlined word for what it means.</span>
    </details>
  );
}
