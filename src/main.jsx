import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { ToastProvider } from "./components/Toast.jsx";
import { ConfirmProvider } from "./components/ConfirmDialog.jsx";

// Everything below replaces what used to be CDN <script>/<link> tags in
// index.html — same fonts, same icons, same Tailwind version, now bundled
// locally by Vite instead of fetched from a CDN at runtime.
// Font weights: only load what the UI actually uses (400 body, 600 semibold, 700 bold)
import "@fontsource/hind-siliguri/400.css";
import "@fontsource/hind-siliguri/600.css";
import "@fontsource/hind-siliguri/700.css";
// FontAwesome: base styles + solid font (skips brands/regular font files)
import "@fortawesome/fontawesome-free/css/fontawesome.min.css";
import "@fortawesome/fontawesome-free/css/solid.min.css";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ToastProvider>
      <ConfirmProvider>
        <App />
      </ConfirmProvider>
    </ToastProvider>
  </React.StrictMode>,
);
