// Page themes: vellum by day, vigil for dim tables. The choice is per device, in localStorage under THEME_KEY.
export const THEMES = ["vellum", "vigil"] as const;
export type Theme = (typeof THEMES)[number];
export const THEME_KEY = "wg-theme";

// Runs before first paint (layout.tsx) so a stored choice never flashes the other theme. With no stored choice the
// CSS follows prefers-color-scheme.
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_KEY}");if(t==="vellum"||t==="vigil")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;
