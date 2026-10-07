import { Rect, Svg } from "@react-pdf/renderer";

import { TOKENS } from "@/lib/tokens/tokens";

// Bars of every width at fixed steps: the vox log's static, the same on every print (no randomness to reshuffle).
const BARS = Array.from({ length: 96 }, (_, i) => ({ x: i * 4.2, w: [0.6, 1.4, 0.4, 2, 0.9][i % 5]! }));

export function NoiseStrip() {
  return (
    <Svg viewBox="0 0 400 6" style={{ width: "100%", height: "2mm", marginVertical: "1.5mm" }}>
      {BARS.map((b, i) => (
        <Rect key={i} x={b.x} y={0} width={b.w} height={6} fill={i % 3 ? TOKENS.ink3 : TOKENS.ink} />
      ))}
    </Svg>
  );
}
