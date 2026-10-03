import { StatusScreen } from "@/components/ui/status-screen/status-screen";

// Shown the moment a link is tapped: every page fetches from the api first, so without it the tap looks ignored. The
// same line the GM app and builder show while their socket connects, so the screen holds steady into them.
export default function Loading() {
  return <StatusScreen text="SYNCING COGITATOR…" />;
}
