import { QR_SIZE } from "../../constants";

export type JoinQr = { name: string; url: string; img: string };
type QrDialogProps = { qr: JoinQr; onClose: () => void };

// Full-screen join code for one character's phone to scan.
export function QrDialog({ qr, onClose }: QrDialogProps) {
  return (
    <div role="dialog" aria-label={`Join code for ${qr.name}`} className="center overlay">
      <div className="stack" style={{ alignItems: "center" }}>
        <div className="display" style={{ fontSize: 36 }}>{qr.name.toUpperCase()}: SCAN TO JOIN</div>
        <img src={qr.img} alt={`QR code for ${qr.name}`} width={QR_SIZE} height={QR_SIZE} />
        <div className="dim" style={{ fontSize: 12, wordBreak: "break-all", maxWidth: 360 }}>{qr.url}</div>
        <button className="btn primary" onClick={onClose}>CLOSE</button>
      </div>
    </div>
  );
}
