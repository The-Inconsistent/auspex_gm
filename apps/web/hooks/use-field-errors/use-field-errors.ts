"use client";
import { useState } from "react";

// What a failed zod parse says about one field (zod's own issue, read structurally: the web app has no zod import).
type Issue = {
  path: PropertyKey[];
  code?: string;
  origin?: string;
  minimum?: unknown;
  maximum?: unknown;
  message: string;
};
type Schema<T> = {
  safeParse: (value: unknown) => { success: true; data: T } | { success: false; error: { issues: Issue[] } };
};

// The reason in the app's words: zod's own are written for developers ("Too small: expected string to have >=1…").
export function sayIssue(i: Issue): string {
  const n = Number(i.code === "too_small" ? i.minimum : i.maximum);
  if (i.code === "too_small" && i.origin === "string") return n <= 1 ? "Required." : `At least ${n} characters.`;
  if (i.code === "too_big" && i.origin === "string") return `At most ${n} characters.`;
  if (i.code === "too_small" && i.origin === "array") return n <= 1 ? "Add at least one." : `Add at least ${n}.`;
  if (i.code === "too_big" && i.origin === "array") return `At most ${n}.`;
  return i.message;
}

// CREATE, ADD and SAVE check their form with the same zod schema the server parses, before sending. Each refused field
// gets a red border (aria-invalid, globals.css) and its reason under it (FieldError), and the first one takes the
// focus; typing in a field clears its mark. Errors are keyed by the field's top-level key ("" for a bare value), and
// each input's id is `idPrefix + key`.
export function useFieldErrors(idPrefix: string) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const idOf = (key: string) => idPrefix + key;

  // The parsed value, or null after marking every field the schema refused.
  const check = <T>(schema: Schema<T>, value: unknown): T | null => {
    const r = schema.safeParse(value);
    if (r.success) {
      setErrors({});
      return r.data;
    }
    const next: Record<string, string> = {};
    for (const i of r.error.issues) next[String(i.path[0] ?? "")] ??= sayIssue(i);
    setErrors(next);
    document.getElementById(idOf(Object.keys(next)[0] ?? ""))?.focus(); // the input is there already, marked or not
    return null;
  };

  return {
    check,
    // An input's marks: aria-invalid (the red border) and the reason it points to.
    marks: (key = "") =>
      errors[key] !== undefined ? { "aria-invalid": true, "aria-describedby": `${idOf(key)}-error` } : {},
    // FieldError's props: the reason, under the field.
    reason: (key = "") => ({ id: `${idOf(key)}-error`, error: errors[key] }),
    // Typing in a field clears its mark.
    clear: (key = "") =>
      setErrors((e) => (key in e ? Object.fromEntries(Object.entries(e).filter(([k]) => k !== key)) : e)),
    // A refusal on a field the form doesn't show by itself (a nested list), as one line for its error banner.
    elsewhere: (shown: readonly string[]) => {
      const key = Object.keys(errors).find((k) => !shown.includes(k));
      return key === undefined ? null : `${key.toUpperCase()}: ${errors[key]}`;
    },
  };
}
export type FieldErrors = ReturnType<typeof useFieldErrors>;
