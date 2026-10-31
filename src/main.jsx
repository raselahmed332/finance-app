import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { ToastProvider } from "./components/Toast.jsx";
import { ConfirmProvider } from "./components/ConfirmDialog.jsx";
import { initNativeUi } from "./utils/native.js";
import { initTheme } from "./utils/theme.js";

// Everything below replaces what used to be CDN <script>/<link> tags in
// index.html — same fonts, same Tailwind version, now bundled locally by Vite
// instead of fetched from a CDN at runtime.
// Font weights: only load what the UI actually uses (400 body, 600 semibold, 700 bold)
import "@fontsource/hind-siliguri/400.css";
import "@fontsource/hind-siliguri/600.css";
import "@fontsource/hind-siliguri/700.css";
import "./index.css";

// A redeploy replaces every hashed asset. If the browser still runs an old
// index.html, Vite fires this when a route's chunk 404s; reloading fetches the
// new index. The sessionStorage guard prevents a reload loop when a chunk is
// truly missing. Cleared shortly after a successful load so a later deploy in
// the same session can recover too.
window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault();
  if (!sessionStorage.getItem("hisab_chunk_reload")) {
    sessionStorage.setItem("hisab_chunk_reload", "1");
    window.location.reload();
  }
});
setTimeout(() => sessionStorage.removeItem("hisab_chunk_reload"), 15000);

// Theme: apply the stored theme (and the OS preference in "system" mode) before
// the first render. index.html already set the class for the very first paint,
// so this only keeps the two in sync and wires up the OS-change listener.
initTheme();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ToastProvider>
      <ConfirmProvider>
        <App />
      </ConfirmProvider>
    </ToastProvider>
  </React.StrictMode>,
);

// Native shell (Android): status bar and keyboard resize.
// No-op on the web build.
initNativeUi();
