import { QR_SIZE } from "../../constants";

export type JoinQr = { title: string; url: string; img: string };
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
        <button className="btn primary" onClick={onClose}>
          CLOSE
        </button>
      </div>
    </div>
  );
}
