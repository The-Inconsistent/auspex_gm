// Poker cards, 3 × 3 to a sheet: 189 × 264 mm fits inside both A4 (210 × 297) and US Letter (216 × 279) with a margin
// a home printer can reach, so one layout serves both paper sizes (issue #203).
export const CARD_W_MM = 63;
export const CARD_H_MM = 88;
export const CARD_COLS = 3;
export const CARD_ROWS = 3;

export const PAPERS = ["A4", "LETTER"] as const;
export type Paper = (typeof PAPERS)[number];
export const PAPER_KEY = "auspex.print.paper"; // localStorage: the GM's last pick, per browser
// Sheet sizes in mm, to centre the card grid on the page.
export const PAPER_MM: Record<Paper, { w: number; h: number }> = {
  A4: { w: 210, h: 297 },
  LETTER: { w: 215.9, h: 279.4 },
};
