import { notFound } from "next/navigation";

import { asDossierTab } from "@/lib/gm-path/gm-path";

// One tab of an Agent's dossier (gear, advance, seat); the layout above draws it.
export default async function Page({ params }: { params: Promise<{ tab: string }> }) {
  if (!asDossierTab((await params).tab)) notFound();
  return null;
}
