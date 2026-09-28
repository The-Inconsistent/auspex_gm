import { LIBRARY_CAP } from "@wg/shared";

// Server-side only: where Next reaches the api directly (the browser goes through the rewrites in next.config.ts).
export const API_ORIGIN = process.env.API_ORIGIN ?? "http://localhost:4000";

// The httpOnly guest cookie the api sets on /api/join and guest invites (COOKIE in apps/api/src/auth/auth.service.ts).
export const TOKEN_COOKIE = "wg_token";

// Why /join/<token> bounced the caller back home, keyed by the `?join=` value.
export const JOIN_ERRORS = {
  invalid: "LINK INVALID OR REVOKED. ASK YOUR GM FOR A NEW QR CODE.",
  nosignal: "NO SIGNAL. CHECK THE CONNECTION AND RETRY.",
} as const;
export type JoinError = keyof typeof JOIN_ERRORS;

export const NO_ACCESS = "NO ACCESS. ASK YOUR GM FOR AN INVITE.";

// Why /library/new bounced back to the lobby, keyed by the `?library=` value (issue #14).
export const LIBRARY_ERRORS = {
  full: `YOUR LIBRARY IS FULL (${LIBRARY_CAP} CHARACTERS). DELETE ONE FIRST.`,
  nosignal: "COULDN'T START A CHARACTER. TRY AGAIN.",
} as const;
export type LibraryError = keyof typeof LIBRARY_ERRORS;
export const isLibraryError = (v: unknown): v is LibraryError =>
  typeof v === "string" && Object.hasOwn(LIBRARY_ERRORS, v);
