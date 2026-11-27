// The ruleset's labels in Vietnamese (InconsisTable's house decision #211; rules-flow §11.205): the words a player
// reads on the sheet, the phone's fight and a called Test, written for this port (this app is English only). Each
// English label here becomes `{ en, vi }` wherever the ruleset uses it; every other label stays English, which the
// platform shows in Vietnamese too. A W&G term keeps a capital on its first word, as this app writes it in English.
// ponytail: the sheet's, the fight's and the Tests' words only; the GM's codex, tables and generators stay English
// until a Vietnamese table asks for them.
export const VI: Readonly<Record<string, string>> = {
  // the pools and tracks (Core pp.20-21, 188-196, 286)
  Wounds: "Vết thương",
  Shock: "Sốc",
  Wrath: "Phẫn nộ",
  Glory: "Vinh quang",
  Ruin: "Tai ương",
  Corruption: "Tha hóa",
  Wealth: "Của cải",
  "Mob members": "Thành viên Đám đông",
  // the Attributes (Core p.28)
  Strength: "Sức mạnh",
  Toughness: "Sức bền",
  Agility: "Nhanh nhẹn",
  Initiative: "Phản xạ",
  Willpower: "Ý chí",
  Intellect: "Trí tuệ",
  Fellowship: "Sức hút",
  // the Skills (Core p.29)
  Athletics: "Thể lực",
  Awareness: "Quan sát",
  "Ballistic Skill": "Xạ kích",
  Cunning: "Mưu mẹo",
  Deception: "Lừa gạt",
  Insight: "Thấu hiểu",
  Intimidation: "Đe dọa",
  Investigation: "Điều tra",
  Leadership: "Lãnh đạo",
  Medicae: "Y thuật",
  Persuasion: "Thuyết phục",
  Pilot: "Lái tàu xe",
  "Psychic Mastery": "Thuật tâm linh",
  Scholar: "Học thức",
  Stealth: "Ẩn nấp",
  Survival: "Sinh tồn",
  Tech: "Kỹ thuật",
  "Weapon Skill": "Cận chiến",
  // the Traits and the sheet's other numbers (Core pp.36-37)
  Defence: "Phòng thủ",
  Resilience: "Chống chịu",
  "Resilience before armour": "Chống chịu chưa tính giáp",
  Speed: "Tốc độ",
  Conviction: "Niềm tin",
  Resolve: "Bản lĩnh",
  Determination: "Kiên cường",
  Influence: "Ảnh hưởng",
  "Passive Awareness": "Quan sát thụ động",
  "Max Wounds": "Vết thương tối đa",
  "Max Shock": "Sốc tối đa",
  "Traumatic Injuries": "Chấn thương nặng",
  "Max Traumatic Injuries": "Chấn thương nặng tối đa",
  Rank: "Cấp bậc",
  Name: "Tên",
  Species: "Chủng loài",
  Archetype: "Hình mẫu",
  Keywords: "Từ khóa",
  "XP earned": "XP đã nhận",
  "Armour Rating": "Chỉ số giáp",
  Mutations: "Đột biến",
  Annihilated: "Bị hủy diệt",
  Sustaining: "Đang duy trì",
  // the sheet's sections and the Corruption track's levels (Core p.286)
  Attributes: "Thuộc tính",
  Skills: "Kỹ năng",
  "In play": "Khi chơi",
  "Talents and Abilities": "Thiên phú và Năng lực",
  "Who you are": "Bạn là ai",
  Pure: "Thuần khiết",
  Tarnished: "Vấy bẩn",
  Tainted: "Nhiễm bẩn",
  Contaminated: "Ô uế",
  Defiled: "Sa đọa",
  "Chaos Spawn": "Quái thai Hỗn mang",
  // the Conditions (Core pp.198-201)
  Bleeding: "Chảy máu",
  Blinded: "Mù lòa",
  Exhausted: "Kiệt sức",
  Fear: "Sợ hãi",
  Frenzied: "Cuồng loạn",
  Hindered: "Bị cản trở",
  "On Fire": "Bốc cháy",
  Pinned: "Bị áp chế",
  Poisoned: "Trúng độc",
  Prone: "Ngã sấp",
  Restrained: "Bị khống chế",
  Staggered: "Choáng váng",
  Terror: "Kinh hoàng",
  Vulnerable: "Sơ hở",
  // the fight: its sides, health states, spends and the phone's panels (Core pp.176-197)
  Agents: "Đặc vụ",
  Threats: "Mối đe dọa",
  Wounded: "Bị thương",
  Dying: "Hấp hối",
  Dead: "Đã chết",
  Slain: "Bị hạ",
  "Seize the Initiative": "Giành thế chủ động",
  "Reroll failures": "Gieo lại xúc xắc trượt",
  "Restore Shock": "Hồi Sốc",
  "Glory dice": "Xúc xắc Vinh quang",
  "Glory damage": "Sát thương Vinh quang",
  "Aware of the ambush": "Phát hiện phục kích",
  "Manifest a power": "Thi triển quyền năng",
  Dice: "Xúc xắc",
  "Icons rolled": "Số Biểu tượng gieo được",
  Ambushed: "Bị phục kích",
  Incoming: "Đòn đang tới",
  "You're hit": "Bạn trúng đòn",
  "Combat options": "Lựa chọn chiến đấu",
  "Determination dice": "Xúc xắc Kiên cường",
  "Most you survive": "Mức tối đa còn trụ được",
  // a called Test (Core pp.30-31)
  "Skill Test": "Test kỹ năng",
  "Attribute Test": "Test thuộc tính",
  "Opposed Test": "Test đối kháng",
  "Corruption Test": "Test Tha hóa",
  "Influence or Resolve Test": "Test Ảnh hưởng hoặc Bản lĩnh",
  "Requisition Test": "Test trưng dụng",
  DN: "DN",
  "Bonus dice": "Xúc xắc thưởng",
  "Not Wounded (no +1 DN)": "Không bị thương (không +1 DN)",
  "Skill or Attribute": "Kỹ năng hoặc thuộc tính",
  Won: "Thắng",
  // the opposed Test's outcome; the ledger's Lost health state (Chaos Spawn) is written in place, "Sa ngã"
  Lost: "Thua",
  "Wrath Die": "Xúc xắc Phẫn nộ",
  "Wrath Dice": "Xúc xắc Phẫn nộ",
  "Complication: +1 Ruin": "Biến chứng: +1 Tai ương",
  "Wrath Critical: +1 Glory": "Chí mạng Phẫn nộ: +1 Vinh quang",
  "Failed Fear: +1 Ruin": "Thua Sợ hãi: +1 Tai ương",
  "Gain the Corruption, +1 Ruin": "Nhận Tha hóa, +1 Tai ương",
};

// The keys whose strings are labels a ruleset may give per language. `build` is left alone: the ledger builder's
// labels are one string (InconsisTable's house decision #211).
const LABEL = new Set(["label"]);
const LABELS = new Set(["labels", "inputLabels"]);

/** The ruleset with each label `VI` names given in English and Vietnamese. */
export function withVietnamese<T>(ruleset: T): T {
  const both = (en: unknown) => (typeof en === "string" && VI[en] !== undefined ? { en, vi: VI[en] } : en);
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (typeof v !== "object" || v === null) return v;
    return Object.fromEntries(
      Object.entries(v).map(([k, x]) => {
        if (k === "build") return [k, x];
        if (LABEL.has(k)) return [k, both(x)];
        if (LABELS.has(k) && typeof x === "object" && x !== null && !Array.isArray(x))
          return [k, Object.fromEntries(Object.entries(x).map(([id, l]) => [id, both(l)]))];
        return [k, walk(x)];
      }),
    );
  };
  // Typed as the English document it was: code here reads a label only after the platform reads it in one language.
  return walk(ruleset) as T;
}

/** A ruleset read in English, as the platform reads it in its own language: each `{ en, vi }` label its English. */
export function english<T>(ruleset: T): T {
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (typeof v !== "object" || v === null) return v;
    const keys = Object.keys(v);
    if (keys.length === 2 && "en" in v && "vi" in v) return v.en;
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
  };
  return walk(ruleset) as T;
}
