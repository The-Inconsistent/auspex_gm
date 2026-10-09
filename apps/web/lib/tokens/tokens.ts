// Raw colours for places CSS variables can't reach (QR canvas, viewport meta, web manifest, the printed PDF cards).
// Mirrors the day (vellum) set in app/globals.css; change both together.
export const TOKENS = {
  vellum: "#e7e5e0",
  ink: "#1c1b1a",
  ink3: "#5c5953",
  line: "#a9a69f",
  red: "#8b2a2a",
  iron: "#1b1b1d",
  marker: {
    red: "#ff6b5e",
    amber: "#ffc266",
    green: "#9ef5b5",
    blue: "#7fb0ff",
    purple: "#c79bff",
    white: "#e8f5ec",
  },
} as const;
