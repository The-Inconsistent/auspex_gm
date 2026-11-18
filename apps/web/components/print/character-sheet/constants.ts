// Kept apart from the react-pdf files, so the EXPORT SHEET button doesn't pull the renderer into a page's bundle.

// The two looks of Cubicle 7's sheet (its free PDFs, kept locally in the gitignored character_sheet/): line art on
// white, or the full-art page on grey parchment inside the iron frame. Same boxes, same places.
export const SHEET_STYLES = ["print", "art"] as const;
export type SheetStyle = (typeof SHEET_STYLES)[number];
export const SHEET_STYLE_LABELS: Record<SheetStyle, string> = { print: "PRINT-FRIENDLY", art: "FULL ART" };

// localStorage: this browser's last picks for a character sheet, apart from the GM's card and handout paper.
export const SHEET_STYLE_KEY = "auspex.print.sheet-style";
export const SHEET_PAPER_KEY = "auspex.print.sheet-paper";
