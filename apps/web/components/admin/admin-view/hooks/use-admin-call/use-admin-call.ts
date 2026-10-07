"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type { ActionResult } from "@wg/shared";

// One admin call at a time. The tapped button pulses (`isBusy(key)`) until the page is current again, the result's
// line (a refusal, or what happened plus the server's notices) lands in `msg`, and a success reloads the page's data
// from the server: the admin page reads everything on the server, so there is no client copy to patch.
export function useAdminCall() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // Runs `work` unless another call is in flight; `ok` is the success line.
  const run = ({ key, ok, work }: { key: string; ok: string; work: () => Promise<ActionResult> }) => {
    if (pending) return;
    setBusy(key);
    setMsg(null);
    startTransition(async () => {
      const r = await work();
      setMsg(r.ok ? [ok, ...(r.notices ?? [])].join(" · ") : `! ${r.error}`);
      if (r.ok) startTransition(() => router.refresh());
    });
  };

  return { msg, run, isBusy: (key: string) => pending && busy === key, pending };
}
