import type { Metadata, Viewport } from "next";
import { Cinzel, Crimson_Pro, IBM_Plex_Mono } from "next/font/google";

import { AuthProvider } from "@wg/auth/react";

import { THEME_SCRIPT } from "@/components/ui/theme-toggle/constants";
import { TOKENS } from "@/lib/tokens/tokens";

import "./globals.css";
// The scene-first redesign, one file per screen, after the base so a rule there wins a tie.
import "./css/fight.css";
import "./css/header.css";
import "./css/party.css";
import "./css/player.css";
import "./css/player-fight.css";
import "./css/player-intel.css";
import "./css/player-sheet.css";
import "./css/player-test.css";
import "./css/scene.css";
import "./css/story.css";
import "./css/editor.css";

// Cinzel stands in for the books' Priori Serif, Crimson Pro for Caxton; Plex Mono is for in-world print-outs and the
// player phone's dataslate readouts (docs/frontend.md §7).
const display = Cinzel({ subsets: ["latin"], variable: "--font-display" });
const serif = Crimson_Pro({ subsets: ["latin"], style: ["normal", "italic"], variable: "--font-serif" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "700"], variable: "--font-mono" });

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
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: TOKENS.iron,
};

type RootLayoutProps = { children: React.ReactNode };

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    // suppressHydrationWarning: THEME_SCRIPT may set data-theme on <html> before React hydrates.
    <html lang="en" className={`${display.variable} ${serif.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
