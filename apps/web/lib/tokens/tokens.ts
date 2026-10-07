// Raw colours for places CSS variables can't reach (QR canvas, viewport meta, web manifest, the printed PDF cards).
// Mirrors the vellum set in app/globals.css; change both together.
export const TOKENS = {
  vellum: "#f2ecdf",
  ink: "#1f1a16",
  ink3: "#665b4e",
  line: "#b7a785",
  red: "#8a1c1c",
  iron: "#2a2522",
  marker: {
    red: "#ff6b5e",
    amber: "#ffc266",
    green: "#9ef5b5",
    blue: "#7fb0ff",
    purple: "#c79bff",
    white: "#e8f5ec",
  },
} as const;
