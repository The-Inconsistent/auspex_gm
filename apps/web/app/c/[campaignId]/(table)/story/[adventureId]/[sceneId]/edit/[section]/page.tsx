import { notFound } from "next/navigation";

import { asBeatSection } from "@/lib/gm-path/gm-path";

// One section of a scene's editor (goal, tests, fight…); the layout above draws it.
export default async function Page({ params }: { params: Promise<{ section: string }> }) {
  if (!asBeatSection((await params).section)) notFound();
  return null;
}
