import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, VT323 } from "next/font/google";

import { AuthProvider } from "@wg/auth/react";

import { TOKENS } from "@/lib/tokens/tokens";

import "./globals.css";

const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "700"], variable: "--font-mono" });
const display = VT323({ subsets: ["latin"], weight: "400", variable: "--font-display" });

export const metadata: Metadata = { title: "Auspex — W&G Table", description: "Wrath & Glory table companion" };
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
