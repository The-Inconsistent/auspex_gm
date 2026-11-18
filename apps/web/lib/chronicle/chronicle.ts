// The tracker's log as the chronicle draws it: one entry per Turn, newest first, its lines in the order they happened.
// `log` is newest first; lines next to each other with the same `who` are one entry.
export function chronicleTurns<T extends { who: string }>(log: T[]): { who: string; lines: T[] }[] {
  const turns: { who: string; lines: T[] }[] = [];
  for (const line of log) {
    const last = turns.at(-1);
    if (last?.who === line.who) last.lines.unshift(line);
    else turns.push({ who: line.who, lines: [line] });
  }
  return turns;
}
