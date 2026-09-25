import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ImageResponse } from "next/og";

// Link-preview card. Colours mirror the vellum set in globals.css (ImageResponse can't read CSS variables).
export const alt = "Auspex: Wrath & Glory table companion";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Static cuts of the app's faces (SIL OFL 1.1, via Fontsource; licences beside them in assets/*-OFL.txt):
// ImageResponse needs TTF/OTF/WOFF files, not next/font.
const [display, serif] = await Promise.all([
  readFile(join(process.cwd(), "assets/Cinzel-Bold.woff")),
  readFile(join(process.cwd(), "assets/CrimsonPro-Italic.woff")),
]);

const C = { vellum: "#f2ecdf", ink: "#1f1a16", ink3: "#665b4e", red: "#8a1c1c", iron: "#2a2522", line: "#b7a785" };

export default function Image() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        padding: 24,
        background: C.iron,
      }}
    >
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "44px 60px",
          background: C.vellum,
          backgroundImage:
            "radial-gradient(ellipse at 15% 10%, rgba(140, 106, 47, 0.16), transparent 60%), radial-gradient(ellipse at 50% 50%, transparent 55%, rgba(70, 45, 20, 0.22) 100%)",
          border: `2px solid ${C.line}`,
          fontFamily: "Cinzel",
          color: C.ink,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 24, letterSpacing: 6, color: C.red }}>
          <span>WRATH &amp; GLORY</span>
          <span style={{ color: C.ink3 }}>TABLE COMPANION</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 176, lineHeight: 1, letterSpacing: 10 }}>AUSPEX</div>
          <div style={{ display: "flex", alignItems: "center", marginTop: 10 }}>
            <div style={{ flex: 1, height: 10, borderTop: `6px solid ${C.red}`, borderBottom: `2px solid ${C.red}` }} />
          </div>
          <div style={{ fontFamily: "Crimson", fontStyle: "italic", fontSize: 38, color: C.ink3, marginTop: 18 }}>
            The GM&apos;s tablet and the players&apos; phones, for in-person play.
          </div>
        </div>

        <div style={{ display: "flex", fontSize: 24, letterSpacing: 4, color: C.ink3 }}>
          COMBAT TRACKER · PLAY SHEETS · CODEX
        </div>
      </div>
    </div>,
    {
      ...size,
      fonts: [
        { name: "Cinzel", data: display, style: "normal", weight: 700 },
        { name: "Crimson", data: serif, style: "italic", weight: 400 },
      ],
    },
  );
}
