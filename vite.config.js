import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// IMPORTANT for GitHub Pages (project site, e.g. username.github.io/REPO_NAME):
// Set "base" to "/REPO_NAME/" (with slashes) — replace REPO_NAME with your
// actual GitHub repository name. If you're deploying to a USER/ORG page
// (a repo literally named "username.github.io"), set base back to "/".
export default defineConfig({
  plugins: [react()],
  base: "/amar-hisab/",
});
