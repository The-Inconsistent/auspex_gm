import type { ReactNode } from "react";

type ArchivedBannerProps = { text: string; children?: ReactNode };

// A game the GM archived: read-only for everyone until it's unarchived (campaign.archive). The server refuses the
// taps; this says why before anyone tries.
export function ArchivedBanner({ text, children }: ArchivedBannerProps) {
  return (
    <div className="archived-banner" role="status">
      <span>ARCHIVED · {text}</span>
      {children}
    </div>
  );
}
