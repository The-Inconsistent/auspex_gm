import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, VT323 } from "next/font/google";

import { AuthProvider } from "@wg/auth/react";

import { TOKENS } from "@/lib/tokens/tokens";

import "./globals.css";

const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "700"], variable: "--font-mono" });
const display = VT323({ subsets: ["latin"], weight: "400", variable: "--font-display" });

const title = "Auspex — W&G Table";
const description = "Wrath & Glory table companion";

// metadataBase makes the opengraph-image URL absolute; without it Next falls back to localhost (docs/deploy.md URL).
export const metadata: Metadata = {
  metadataBase: new URL("https://auspex.ydothien.work"),
  title,
  description,
  openGraph: { title, description, siteName: "Auspex", type: "website" },
  twitter: { card: "summary_large_image", title, description },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: TOKENS.bg };

type RootLayoutProps = { children: React.ReactNode };

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en" className={`${mono.variable} ${display.variable}`}>
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
