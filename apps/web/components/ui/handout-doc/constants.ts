import type { HandoutStyle } from "@wg/shared";

// How each style reads in the editor's STYLE select (issue #204).
export const HANDOUT_STYLE_LABEL: Record<HandoutStyle, string> = {
  plain: "PLAIN (COGITATOR TEXT)",
  slate: "DATA-SLATE",
  form: "ADMINISTRATUM FORM",
  vox: "VOX TRANSCRIPT",
  decree: "DECREE",
};

// The banner or reference line a style prints when the GM leaves HEADER empty. Shared with the printed page
// (components/print/handout-sheet), so the phone and the paper say the same.
export const DEFAULT_HEADER: Record<HandoutStyle, string> = {
  plain: "",
  slate: "++ TRANSMISSION ++",
  form: "FORM 77-B · FOR FILING",
  vox: "VOX LOG",
  decree: "BY ORDER OF THE GOVERNOR",
};

export const headerOf = ({ style, header }: { style: HandoutStyle; header: string }) =>
  header.trim() || DEFAULT_HEADER[style];
