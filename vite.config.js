import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { visualizer } from "rollup-plugin-visualizer";

// Asset base path.
//
// - Web / GitHub Pages (default `vite build`): the app is served from a project
//   subpath, so it keeps the existing "/finance-app/" base. GitHub Pages
//   deployment must not change.
// - Android / Capacitor (`vite build --mode android`): the built files are
//   loaded from the app's local WebView, not from GitHub Pages. A relative base
//   makes index.html, JS, CSS, fonts, icons and images resolve inside the APK
//   regardless of the local server path.
//
// IMPORTANT: Set "/REPO_NAME/" below to your actual GitHub repository name if
// it differs from "finance-app". If you deploy to a user/org page (a repo named
// "username.github.io"), set it to "/".
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    tailwindcss(),
    mode === "analyze" &&
      visualizer({ open: true, filename: "dist/bundle-report.html" }),
  ].filter(Boolean),
  base: mode === "android" ? "./" : "/finance-app/",
}));
