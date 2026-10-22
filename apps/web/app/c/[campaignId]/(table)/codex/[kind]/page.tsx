import { notFound } from "next/navigation";

import { asCodexKind } from "@/lib/gm-path/gm-path";

// A kind's list (/codex/npcs); the entry and editor pages below reuse it to refuse an unknown kind. The layout above
// draws them all.
export default async function Page({ params }: { params: Promise<{ kind: string }> }) {
  if (!asCodexKind((await params).kind)) notFound();
  return null;
}
