// One SVG path per segment of a clock's pie (issue #210), on a circle of radius 1 around 0,0, starting at twelve
// o'clock and running clockwise, as a clock face is read.
export function piePaths(segments: number): string[] {
  const at = (i: number) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / segments;
    return `${Math.cos(a).toFixed(4)} ${Math.sin(a).toFixed(4)}`;
  };
  return Array.from({ length: segments }, (_, i) => `M0 0 L${at(i)} A1 1 0 0 1 ${at(i + 1)} Z`);
}
