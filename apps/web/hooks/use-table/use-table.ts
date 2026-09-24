"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";

import type { ActionInput, ActionResult, Codex, LiveState } from "@wg/shared";

const ACK_TIMEOUT_MS = 5000;

export type Send = (a: ActionInput) => Promise<ActionResult>;

// One socket per tab. The httpOnly cookie authenticates it; the server sends a full snapshot on connect and after
// every change, so reconnecting needs no extra logic.
export function useTable() {
  const socket = useRef<Socket | null>(null);
  const [state, setState] = useState<LiveState | null>(null);
  const [codex, setCodex] = useState<Codex | null>(null);
  const [online, setOnline] = useState(false);

  // External system: the Socket.IO connection to the api.
  useEffect(() => {
    const s = io({ withCredentials: true });
    socket.current = s;
    s.on("connect", () => setOnline(true));
    s.on("disconnect", () => setOnline(false));
    s.on("state", setState);
    s.on("codex", setCodex);
    return () => void s.close();
  }, []);

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

  const send: Send = useCallback(async (a) => {
    const s = socket.current;
    if (!s?.connected) return { ok: false, error: "No signal" };
    try {
      const result: ActionResult = await s.timeout(ACK_TIMEOUT_MS).emitWithAck("action", a);
      return result;
    } catch {
      return { ok: false, error: "No reply from server" };
    }
  }, []);

  return { state, codex, online, send };
}
