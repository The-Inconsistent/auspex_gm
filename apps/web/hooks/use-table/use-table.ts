"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";

import type {
  ActionInput,
  ActionResult,
  BookAvailable,
  BookPage,
  BookReply,
  Codex,
  LiveState,
  ThreatSource,
} from "@wg/shared";

const ACK_TIMEOUT_MS = 5000;
const REFUSED_RETRY_MS = 3000;
const TAP_WINDOW_MS = 1000;
const SENT_MS = 600;
// The GM's tablet renders the page (books.ts), then the api relays it; the api gives up after 15 s.
const PAGE_TIMEOUT_MS = 20_000;

export type Send = (a: ActionInput) => Promise<ActionResult>;
export type RequestPage = (p: BookPage) => Promise<BookReply>;
export type RenderPage = (p: BookPage) => Promise<BookReply>;

// One socket per tab, for one table. The browser's cookies authenticate it (Clerk's `__session`, or a guest's QR
// cookie); the server sends a full snapshot on connect and after every change, so reconnecting needs no extra logic.
export function useTable(campaignId: string) {
  const socket = useRef<Socket | null>(null);
  const [state, setState] = useState<LiveState | null>(null);
  const [codex, setCodex] = useState<Codex | null>(null);
  const [online, setOnline] = useState(false);
  // Books a GM tablet is serving right now (book:available); a cite in one of them opens its page.
  const [books, setBooks] = useState<ThreatSource[]>([]);
  // GM only: what this tab serves, re-announced on every reconnect (the server forgets it with the old socket).
  const serving = useRef<{ sources: ThreatSource[]; render: RenderPage } | null>(null);

  // External system: the Socket.IO connection to the api.
  useEffect(() => {
    const s = io({ withCredentials: true, auth: { campaignId } });
    socket.current = s;
    let retry: ReturnType<typeof setTimeout> | undefined;
    s.on("connect", () => {
      setOnline(true);
      if (serving.current) s.emit("book:serving", { sources: serving.current.sources });
    });
    s.on("disconnect", () => {
      setOnline(false);
      setBooks([]);
    });
    // socket.io doesn't retry a refusal from the server's auth middleware. A dead token reloads into the NO ACCESS
    // screen; anything else (DB blip) retries.
    s.on("connect_error", (err) => {
      if (s.active) return; // transport error: socket.io is already reconnecting
      if (err.message === "unauthorized") location.reload();
      else retry = setTimeout(() => s.connect(), REFUSED_RETRY_MS);
    });
    s.on("state", setState);
    s.on("codex", setCodex);
    s.on("book:available", (a: BookAvailable) => setBooks(a.sources));
    s.on("book:request", (p: BookPage, ack: (r: BookReply) => void) => {
      const render = serving.current?.render;
      if (!render) return ack({ ok: false, error: "The GM isn't serving that book." });
      render(p).then(ack, () => ack({ ok: false, error: "The GM's tablet couldn't render it." }));
    });
    return () => {
      clearTimeout(retry);
      s.close();
    };
  }, [campaignId]);

  // External system: the Screen Wake Lock API. Phones and tablets shouldn't dim mid-combat; re-acquired when the tab
  // comes back.
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    const acquire = async () => {
      try {
        lock = (await navigator.wakeLock?.request("screen")) ?? null;
      } catch {
        // Denied (battery saver, unsupported, tab hidden): the screen may dim, nothing else breaks.
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void acquire();
    };
    void acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release();
    };
  }, []);

  // External system: the DOM. Remembers the last tapped button so `send` can mark it: iOS doesn't focus a tapped
  // button, so document.activeElement alone would miss phone taps.
  const tapped = useRef<{ el: HTMLButtonElement; at: number } | null>(null);
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const el = e.target instanceof Element ? e.target.closest("button") : null;
      tapped.current = el && { el, at: performance.now() };
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, []);

  // Tap feedback (globals.css): the tapped button pulses until the server answers, then rings once, applied or
  // refused. A send with no recent tap (the command line's Enter) marks nothing.
  const send: Send = useCallback(async (a) => {
    const t = tapped.current;
    const focused = document.activeElement instanceof HTMLButtonElement ? document.activeElement : null;
    const btn = focused ?? (t && performance.now() - t.at < TAP_WINDOW_MS ? t.el : null);
    btn?.setAttribute("aria-busy", "true");
    const result = await emit(socket.current, a);
    if (btn) {
      btn.removeAttribute("aria-busy");
      btn.setAttribute("data-sent", result.ok ? "ok" : "no");
      setTimeout(() => btn.removeAttribute("data-sent"), SENT_MS);
    }
    return result;
  }, []);

  const requestPage: RequestPage = useCallback(async (p) => {
    const s = socket.current;
    if (!s?.connected) return { ok: false, error: "No signal" };
    try {
      return await s.timeout(PAGE_TIMEOUT_MS).emitWithAck("book:request", p);
    } catch {
      return { ok: false, error: "No reply. Try again" };
    }
  }, []);

  // GM: serve these books with `render`, or stop (null or no sources).
  const serveBooks = useCallback((next: { sources: ThreatSource[]; render: RenderPage } | null) => {
    serving.current = next?.sources.length ? next : null;
    socket.current?.emit("book:serving", { sources: next?.sources ?? [] });
  }, []);

  return { state, codex, online, send, books, requestPage, serveBooks };
}

async function emit(s: Socket | null, a: ActionInput): Promise<ActionResult> {
  if (!s?.connected) return { ok: false, error: "No signal" };
  try {
    return await s.timeout(ACK_TIMEOUT_MS).emitWithAck("action", a);
  } catch {
    // It may still have applied: counters are deltas, so check the screen before tapping again.
    return { ok: false, error: "No reply from server. Check before retrying" };
  }
}
