"use client";
import { useRouter } from "next/navigation";
import { use, useEffect } from "react";

import { asGmTab, TAB_PARAM } from "@/components/gm/gm-app/constants";
import { useGm } from "@/components/gm/gm-app/gm-context";
import { gmPath } from "@/lib/gm-path/gm-path";

type HomeProps = { searchParams: Promise<{ [key: string]: string | string[] | undefined }> };

// /c/<id> itself: SCENE while a session is open, STORY otherwise. An old `?tab=` link opens that tab instead.
export default function TableHome({ searchParams }: HomeProps) {
  const asked = asGmTab(use(searchParams)[TAB_PARAM]);
  const { campaignId, state, codex } = useGm();
  const router = useRouter();
  const tab = asked ?? (codex.sessions.some((s) => !s.endedAt) ? "SCENE" : "STORY");
  // SCENE opens on the fight while one is live, as it did before the layer had a URL.
  const to = tab === "SCENE" ? gmPath.scene(campaignId, !!state.encounter) : gmPath.tab(campaignId, tab);
  // External system: the browser's URL, through Next's router.
  useEffect(() => router.replace(to), [router, to]);
  return null;
}
