// ---------------- THEME ENGINE ----------------
//
// The app supports three theme modes: "light", "dark" and "system".
// "system" follows the OS preference and keeps following it while the app is
// open. The resolved theme is applied by toggling the `dark` class on <html>,
// which is what the Tailwind `dark:` variant and every CSS variable key off.
//
// The chosen mode is persisted in localStorage. The previous boolean
// preference ("hisab_dark") is still read on first launch so an existing
// user's choice is not lost, and is kept in sync for anything that reads it.
//
// A tiny inline script in index.html applies the class BEFORE the first paint,
// so the app never flashes the wrong theme on startup.

export const THEME_KEY = "hisab_theme";
export const LEGACY_DARK_KEY = "hisab_dark";
export const THEME_MODES = ["system", "light", "dark"];

export function readThemeMode() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark" || saved === "system") return saved;
    const legacy = localStorage.getItem(LEGACY_DARK_KEY);
    if (legacy !== null) return legacy === "true" ? "dark" : "light";
  } catch (e) {
    /* storage may be unavailable (private mode) - fall through */
  }
  return "system";
}

// "system" -> whatever the OS says right now.
export function resolveTheme(mode) {
  if (mode === "light" || mode === "dark") return mode;
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  } catch (e) {
    return "light";
  }
}

// Applies the resolved theme to the document. Returns the resolved theme.
const subscribers = new Set();

export function subscribeTheme(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

function notify() {
  const resolved = resolveTheme(readThemeMode());
  subscribers.forEach((fn) => {
    try {
      fn(resolved);
    } catch (e) {
      /* a broken subscriber must not break theming */
    }
  });
  return resolved;
}

export function applyTheme(mode) {
  const resolved = resolveTheme(mode);
  try {
    const root = document.documentElement;
    root.classList.toggle("dark", resolved === "dark");
    root.style.colorScheme = resolved;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute("content", resolved === "dark" ? "#0a2a21" : "#0b3a2c");
    }
  } catch (e) {
    /* never let a theme failure break the app */
  }
  notify();
  return resolved;
}

// Persists the user's choice and applies it immediately.
export function saveThemeMode(mode) {
  const safe = THEME_MODES.includes(mode) ? mode : "system";
  try {
    localStorage.setItem(THEME_KEY, safe);
    // Keep the legacy flag in sync so an older build (or an older web bundle
    // still cached by the WebView) reads the same preference.
    localStorage.setItem(
      LEGACY_DARK_KEY,
      String(resolveTheme(safe) === "dark"),
    );
  } catch (e) {
    /* ignore storage failures */
  }
  return applyTheme(safe);
}

// Called once from main.jsx before the first render. Reads the stored mode,
// applies it and keeps "system" mode in sync with the OS.
export function initTheme() {
  const mode = readThemeMode();
  applyTheme(mode);
  try {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (readThemeMode() === "system") applyTheme("system");
    };
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else if (mq.addListener) mq.addListener(onChange);
  } catch (e) {
    /* matchMedia unsupported - the mode still applies on next launch */
  }
  return mode;
}
