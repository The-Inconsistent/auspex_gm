import QRCode from "qrcode";

import { TOKENS } from "@/lib/tokens/tokens";

// Join QR code edge, in CSS px.
export const QR_SIZE = 320;

// A join link as a QR code image (a data: URL), ink on vellum like the rest of the app.
export const qrImage = (url: string) =>
  QRCode.toDataURL(url, { margin: 1, width: QR_SIZE, color: { dark: TOKENS.ink, light: TOKENS.vellum } });
