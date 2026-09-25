"use client";

import { THEME_KEY, type Theme } from "./constants";

type ThemeToggleProps = { className?: string };

// The theme on screen: a stored choice on <html>, else the system preference (the CSS default).
function currentTheme(): Theme {
  const set = document.documentElement.dataset.theme;
  if (set === "vellum" || set === "vigil") return set;
  return matchMedia("(prefers-color-scheme: dark)").matches ? "vigil" : "vellum";
}

// Day/night switch. The label is swapped by CSS (.theme-to-*), so server and client render the same markup.
export function ThemeToggle({ className = "btn sm" }: ThemeToggleProps) {
  // Flips the theme and remembers it on this device; a blocked localStorage just means it won't persist.
  const handleToggle = () => {
    const next: Theme = currentTheme() === "vigil" ? "vellum" : "vigil";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // private mode or storage disabled: the switch still applies for this page
    }
  };

  return (
    <button type="button" className={className} aria-label="Switch between day and night theme" onClick={handleToggle}>
      <span className="theme-to-night">NIGHT</span>
      <span className="theme-to-day">DAY</span>
    </button>
  );
}
