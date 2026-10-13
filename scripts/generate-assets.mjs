// Generates the Capacitor launcher-icon and splash source images for the
// "Amar Hisab" branding (emerald gradient + a white wallet, matching the app's
// fa-wallet / emerald identity).
//
// Usage:  node scripts/generate-assets.mjs
// Output: assets/<icon-only|icon-background|icon-foreground|splash|splash-dark>.png
//
// No emojis or third-party artwork are used; everything is plain SVG geometry
// merged with libvips (via sharp).

import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "assets");
mkdirSync(outDir, { recursive: true });

const BG_TOP = "#34d399"; // emerald-400
const BG_BOTTOM = "#047857"; // emerald-700
const CLASP = "#065f46"; // emerald-800
const SPLASH_BG = "#0f172a"; // slate-900 (matches dark app chrome)

function rasterize(svg, file) {
  return sharp(Buffer.from(svg))
    .png()
    .toFile(file)
    .then((info) =>
      console.log(`wrote ${file} (${info.width}x${info.height})`),
    );
}

// The wallet mark in a 1000x1000 coordinate space, centered on (cx, cy),
// scaled by `s` (overall width in the same units). Returns an SVG fragment.
function walletMark(cx, cy, s) {
  const k = s / 1000; // unit scale
  const X = (u) => cx + (u - 500) * k;
  const Y = (u) => cy + (u - 500) * k;
  const w = (u) => u * k;
  const r = (rx, ry) => rx * k;
  const rx = r;
  const body = `<rect x="${X(150)}" y="${Y(330)}" width="${w(700)}" height="${w(340)}" rx="${rx(56)}" fill="#ffffff"/>`;
  const fold = `<rect x="${X(560)}" y="${Y(350)}" width="${w(8)}" height="${w(300)}" rx="${rx(4)}" fill="#d9e2ec"/>`;
  const pocket = `<rect x="${X(210)}" y="${Y(382)}" width="${w(220)}" height="${w(120)}" rx="${rx(40)}" fill="url(#claspGrad)"/>`;
  const clasp = `<rect x="${X(660)}" y="${Y(442)}" width="${w(220)}" height="${w(120)}" rx="${rx(50)}" fill="url(#claspGrad)"/>`;
  const dot = `<circle cx="${X(740)}" cy="${Y(502)}" r="${w(30)}" fill="#ffffff"/>`;
  return `${body}${fold}${pocket}${clasp}${dot}`;
}

function defs(gradientId, stops) {
  return `<defs>
    <linearGradient id="${gradientId}" x1="0" y1="0" x2="1" y2="1">
      ${stops
        .map(
          (s, i) =>
            `<stop offset="${i * 50}%" stop-color="${s}"/>`,
        )
        .join("")}
    </linearGradient>
  </defs>`;
}

// 1) Legacy full-bleed launcher icon (1024x1024).
const iconOnly = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  ${defs("bgGrad", [BG_TOP, BG_BOTTOM])}
  <rect width="1024" height="1024" fill="url(#bgGrad)"/>
  ${walletMark(512, 512, 760)}
</svg>`;

// 2) Adaptive background (1024x1024, flat color the safe zone shows).
const iconBackground = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  ${defs("bgGrad", [BG_TOP, BG_BOTTOM])}
  <rect width="1024" height="1024" fill="url(#bgGrad)"/>
</svg>`;

// 3) Adaptive foreground (1024x1024, transparent; logo kept inside the ~66%
//    center safe zone, so it is never clipped by the launcher mask).
const iconForeground = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  ${defs("claspGrad", [CLASP])}
  <g transform="translate(0 0)">${walletMark(512, 512, 620)}</g>
</svg>`;

// Splash shared elements (2732x2732) - centered mark + wordmark.
function splashBody() {
  const marks = `${defs("claspGrad", [CLASP])}
  <rect width="2732" height="2732" fill="${SPLASH_BG}"/>
  <g transform="translate(0 -90)">${walletMark(1366, 1260, 900)}</g>`;
  const text = `<text x="1366" y="2030" text-anchor="middle" font-family="Arial, sans-serif" font-size="168" font-weight="bold" fill="#ffffff">Amar Hisab</text>
  <text x="1366" y="2210" text-anchor="middle" font-family="Arial, sans-serif" font-size="60" fill="#94a3b8" letter-spacing="6">PERSONAL FINANCE</text>`;
  return `${marks}${text}`;
}

const splash = `<svg xmlns="http://www.w3.org/2000/svg" width="2732" height="2732" viewBox="0 0 2732 2732">
  ${splashBody()}
</svg>`;

// Dark-mode splash (same artwork; the canvas is already dark).
const splashDark = `<svg xmlns="http://www.w3.org/2000/svg" width="2732" height="2732" viewBox="0 0 2732 2732">
  ${splashBody()}
</svg>`;

await Promise.all([
  rasterize(iconOnly, join(outDir, "icon-only.png")),
  rasterize(iconBackground, join(outDir, "icon-background.png")),
  rasterize(iconForeground, join(outDir, "icon-foreground.png")),
  rasterize(splash, join(outDir, "splash.png")),
  rasterize(splashDark, join(outDir, "splash-dark.png")),
]);