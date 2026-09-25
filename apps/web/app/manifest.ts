import type { MetadataRoute } from "next";

import { TOKENS } from "@/lib/tokens/tokens";

// "Add to home screen" opens full-screen, no browser chrome.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Auspex — W&G Table",
    short_name: "Auspex",
    start_url: "/",
    display: "standalone",
    background_color: TOKENS.vellum,
    theme_color: TOKENS.iron,
  };
}
