import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ImageResponse } from "next/og";

// Link-preview card. Colours mirror :root in globals.css (ImageResponse can't read CSS variables).
export const alt = "Auspex: Wrath & Glory table companion";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const [display, mono] = await Promise.all([
  readFile(join(process.cwd(), "assets/VT323-Regular.ttf")),
  readFile(join(process.cwd(), "assets/IBMPlexMono-Medium.ttf")),
]);

const C = { bg: "#06110b", panel: "#0b1c13", line: "#1f4d33", fg: "#9ef5b5", dim: "#5fa878", amber: "#ffc266" };

const LINES = [
  "COMBAT TRACKER .......... ONLINE",
  "PLAY SHEETS ............. SYNCED",
  "CODEX ................... SEALED",
];

export default function Image() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        padding: 40,
        background: C.bg,
        backgroundImage:
          "repeating-linear-gradient(0deg, rgba(158, 245, 181, 0.06) 0px, rgba(158, 245, 181, 0.06) 1px, transparent 1px, transparent 4px)",
        fontFamily: "Plex",
        color: C.fg,
      }}
    >
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "36px 48px",
          border: `2px solid ${C.line}`,
          background: "rgba(11, 28, 19, 0.7)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 22, color: C.dim, letterSpacing: 2 }}>
          <span>++ COGITATOR LINK ESTABLISHED ++</span>
          <span style={{ color: C.amber }}>WRATH &amp; GLORY</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              fontFamily: "VT323",
              fontSize: 220,
              lineHeight: 0.9,
              letterSpacing: 8,
            }}
          >
            AUSPEX
            <div style={{ width: 70, height: 150, marginLeft: 24, marginBottom: 22, background: C.fg }} />
          </div>
          <div style={{ fontSize: 30, color: C.dim, marginTop: 8 }}>&gt; table companion for in-person play</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", fontSize: 22, color: C.dim, gap: 6 }}>
          {LINES.map((l) => (
            <span key={l}>{l}</span>
          ))}
        </div>
      </div>
    </div>,
    {
      ...size,
      fonts: [
        { name: "VT323", data: display, style: "normal", weight: 400 },
        { name: "Plex", data: mono, style: "normal", weight: 500 },
      ],
    },
  );
}
