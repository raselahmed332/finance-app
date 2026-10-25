// Generates the Amar Hisab launcher icon and splash artwork.
//
// Usage:  node scripts/generate-assets.mjs
// Output: assets/<icon-only|icon-background|icon-foreground|splash|splash-dark>.png
//
// The wallet outline and small gold clasp match the selected app mark. Artwork
// is drawn as SVG geometry and rasterized with sharp.

import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "assets");
mkdirSync(outDir, { recursive: true });

const TEAL_TOP = "#1d8b7f";
const TEAL_BOTTOM = "#12665f";
const GOLD = "#efc66f";
const SPLASH_BG = "#f5f7f4";
const SPLASH_BG_DARK = "#101b19";
const SPLASH_TEXT_DARK = "#e7f1ed";
const SPLASH_MUTED_DARK = "#a9bdb6";

function rasterize(svg, file) {
  return sharp(Buffer.from(svg))
    .png()
    .toFile(file)
    .then((info) =>
      console.log(`wrote ${file} (${info.width}x${info.height})`),
    );
}

function gradients() {
  return `<defs>
    <linearGradient id="tealGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${TEAL_TOP}"/>
      <stop offset="100%" stop-color="${TEAL_BOTTOM}"/>
    </linearGradient>
  </defs>`;
}

// The mark is intentionally a bold outline so its shape remains clear at
// launcher size. Keep it within the Android adaptive-icon safe area.
function walletMark(color, size, claspColor = GOLD) {
  const scale = size / 1000;
  return `<g transform="translate(512 512) scale(${scale}) translate(-500 -500)"
      fill="none" stroke="${color}" stroke-width="62"
      stroke-linecap="round" stroke-linejoin="round">
    <path d="M210 350v300q0 80 80 80h340q80 0 80-80V350q0-80-80-80H290q-80 0-80 80z"/>
    <path d="M790 370H660q-130 0-130 130t130 130h130"/>
    <circle cx="660" cy="500" r="20" fill="${claspColor}" stroke="none"/>
  </g>`;
}

const iconOnly = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  ${gradients()}
  <rect width="1024" height="1024" fill="url(#tealGrad)"/>
  ${walletMark("#fbfaf5", 760)}
</svg>`;

const iconBackground = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  ${gradients()}
  <rect width="1024" height="1024" fill="url(#tealGrad)"/>
</svg>`;

const iconForeground = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  ${walletMark("#fbfaf5", 650)}
</svg>`;

function splashSvg(backgroundColor, markColor, titleColor, subtitleColor) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="2732" height="2732" viewBox="0 0 2732 2732">
    <rect width="2732" height="2732" fill="${backgroundColor}"/>
    <g transform="translate(1366 1110) scale(1.05) translate(-512 -512)">
      ${walletMark(markColor, 820)}
    </g>
    <text x="1366" y="1850" text-anchor="middle" font-family="Arial, sans-serif"
      font-size="168" font-weight="700" fill="${titleColor}">Amar Hisab</text>
    <text x="1366" y="2020" text-anchor="middle" font-family="Arial, sans-serif"
      font-size="60" fill="${subtitleColor}" letter-spacing="6">PERSONAL FINANCE</text>
  </svg>`;
}

const splash = splashSvg(SPLASH_BG, TEAL_BOTTOM, TEAL_BOTTOM, "#637873");
const splashDark = splashSvg(SPLASH_BG_DARK, "#e7f1ed", SPLASH_TEXT_DARK, SPLASH_MUTED_DARK);

await Promise.all([
  rasterize(iconOnly, join(outDir, "icon-only.png")),
  rasterize(iconBackground, join(outDir, "icon-background.png")),
  rasterize(iconForeground, join(outDir, "icon-foreground.png")),
  rasterize(splash, join(outDir, "splash.png")),
  rasterize(splashDark, join(outDir, "splash-dark.png")),
]);
