"use client";
import { useState } from "react";

type DnInputProps = { value: number | null; label: string; onChange: (dn: number | null) => void };

// The DN as typed. While editing, the field holds the digits as typed, so clearing it to type "5" gives 5, not 15. A
// DN from 1 to 20 counts at once; on leaving the field, a bigger one becomes 20, and an empty one leaves the DN for the
// GM to set at the table (rules-flow.md §11.75).
export function DnInput({ value, label, onChange }: DnInputProps) {
  const [text, setText] = useState<string | null>(null); // null: not editing, so the field shows `value`

  // Typing: digits only; a DN the schema takes (1 to 20) counts straight away.
  const handleChange = (digits: string) => {
    setText(digits);
    const n = Number(digits);
    if (n >= 1 && n <= 20) onChange(n);
  };

  // Leaving the field: clamp anything over 20, clear an emptied DN, then show the DN the Test holds.
  const handleBlur = () => {
    if (Number(text) > 20) onChange(20);
    if (text === "") onChange(null);
    setText(null);
  };

  return (
    <input
      className="input"
      style={{ width: 70 }}
      aria-label={label}
      inputMode="numeric"
      value={text ?? value ?? ""}
      onChange={(e) => handleChange(e.target.value.replace(/\D/g, "").slice(0, 2))}
      onBlur={handleBlur}
    />
  );
}
