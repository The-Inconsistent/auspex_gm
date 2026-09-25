// Scaled to ≤10 cells so a 16-Wound Agent fits a tracker column or phone card; the number shown beside it is the
// real value. Any damage fills at least one cell, and short of max at least one stays empty.
export const MAX_CELLS = 10;

export function blocks({ value, max }: { value: number; max: number }) {
  const cells = Math.max(0, Math.min(max, MAX_CELLS));
  const filled =
    value <= 0 ? 0 : value >= max ? cells : Math.min(cells - 1, Math.max(1, Math.round((value / max) * cells)));
  return { filled, cells };
}
