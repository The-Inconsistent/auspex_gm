import { QR_SIZE, qrImage } from "@/lib/qr/qr";

export type JoinQr = { title: string; url: string; img: string };

// A join URL drawn as a code: the one place a QR for PARTY is made.
export const joinQr = async ({ title, url }: { title: string; url: string }): Promise<JoinQr> => ({
  title,
  url,
  img: await qrImage(url),
});

type QrDialogProps = { qr: JoinQr; onClose: () => void };

// Full-screen join code (a guest QR, a character invite or the room invite) for phones to scan.
export function QrDialog({ qr, onClose }: QrDialogProps) {
  return (
    <div role="dialog" aria-label={`Join code: ${qr.title}`} className="center overlay">
      <div className="stack" style={{ alignItems: "center" }}>
        <div className="display" style={{ fontSize: 36 }}>
          {qr.title.toUpperCase()}: SCAN TO JOIN
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element -- a data: URL, next/image has nothing to optimise */}
        <img src={qr.img} alt={`QR code: ${qr.title}`} width={QR_SIZE} height={QR_SIZE} />
        <div className="dim" style={{ fontSize: 12, wordBreak: "break-all", maxWidth: 360 }}>
          {qr.url}
        </div>
        {/* The code dies with this dialog (only its hash is kept), so a player who closes their tab returns via the lobby. */}
        <div className="dim">Lost the page? Open {new URL(qr.url).host} and tap RETURN.</div>
        <button className="btn" onClick={onClose}>
          CLOSE
        </button>
      </div>
    </div>
  );
}
