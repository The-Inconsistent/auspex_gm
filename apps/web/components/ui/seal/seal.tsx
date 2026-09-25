import type { Pool } from "@wg/shared";

type SealProps = { value: number; pool: Pool; size?: number };

// A party pool as a wax seal: brass for Glory, crimson for Ruin.
export function Seal({ value, pool, size = 44 }: SealProps) {
  return (
    <svg
      className={`seal ${pool}`}
      width={size}
      height={size}
      viewBox="0 0 52 52"
      role="img"
      aria-label={`${value} ${pool}`}
    >
      <circle cx="26" cy="26" r="21" strokeWidth="6" strokeDasharray="3 2.2" />
      <circle cx="26" cy="26" r="16" className="seal-ring" />
      <text x="26" y="33" textAnchor="middle">
        {value}
      </text>
    </svg>
  );
}
