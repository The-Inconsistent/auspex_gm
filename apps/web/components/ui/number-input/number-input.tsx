"use client";
import { useState } from "react";

type NumberInputProps = { value: number | null; label: string; max: number; onChange: (n: number | null) => void };

// A number from 1 to `max`, as typed. While editing, the field holds the digits as typed, so clearing it to type "5"
// gives 5, not 15. A number in range counts at once; on leaving the field, a bigger one becomes `max`, and an empty one
// leaves it unset: a DN the GM sets at the table (rules-flow.md §11.75), or a cost the GM hasn't set yet.
export function NumberInput({ value, label, max, onChange }: NumberInputProps) {
  const [text, setText] = useState<string | null>(null); // null: not editing, so the field shows `value`

  // Typing: digits only; a number in range counts straight away.
  const handleChange = (digits: string) => {
    setText(digits);
    const n = Number(digits);
    if (n >= 1 && n <= max) onChange(n);
  };

  // Leaving the field: clamp anything over `max`, clear an emptied one, then show the number the field holds.
  const handleBlur = () => {
    if (Number(text) > max) onChange(max);
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
      onChange={(e) => handleChange(e.target.value.replace(/\D/g, "").slice(0, String(max).length))}
      onBlur={handleBlur}
    />
  );
}
