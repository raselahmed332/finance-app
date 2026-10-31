// Capacitor native-shell glue: status bar, splash screen, keyboard and the
// Android hardware Back button.
//
// Everything here is a NO-OP on the plain web build. The Capacitor plugins
// ship web implementations, `Capacitor.isNativePlatform()` is false in the
// browser, and every native call is guarded, so importing this module never
// changes GitHub Pages behaviour.

import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";
import { StatusBar, Style } from "@capacitor/status-bar";
import { SplashScreen } from "@capacitor/splash-screen";
import { Keyboard, KeyboardResize } from "@capacitor/keyboard";

export const isNative = () => Capacitor.isNativePlatform();

let pageScrollLockCount = 0;
let savedPageScrollY = 0;
let savedPageStyles = null;

export function lockPageScroll() {
  if (typeof document === "undefined") return () => {};

  pageScrollLockCount += 1;
  if (pageScrollLockCount === 1) {
    const body = document.body;
    const html = document.documentElement;
    savedPageScrollY = window.scrollY;
    savedPageStyles = {
      bodyPosition: body.style.position,
      bodyTop: body.style.top,
      bodyLeft: body.style.left,
      bodyRight: body.style.right,
      bodyWidth: body.style.width,
      bodyOverflow: body.style.overflow,
      bodyPaddingRight: body.style.paddingRight,
      htmlOverflow: html.style.overflow,
    };

    const scrollbarWidth = window.innerWidth - html.clientWidth;
    const bodyPaddingRight = parseFloat(window.getComputedStyle(body).paddingRight) || 0;

    body.style.position = "fixed";
    body.style.top = `-${savedPageScrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      body.style.paddingRight = `${bodyPaddingRight + scrollbarWidth}px`;
    }
    html.style.overflow = "hidden";
  }

  let released = false;
  return () => {
    if (released) return;
    released = true;
    pageScrollLockCount = Math.max(0, pageScrollLockCount - 1);
    if (pageScrollLockCount !== 0 || !savedPageStyles) return;

    const body = document.body;
    const html = document.documentElement;
    body.style.position = savedPageStyles.bodyPosition;
    body.style.top = savedPageStyles.bodyTop;
    body.style.left = savedPageStyles.bodyLeft;
    body.style.right = savedPageStyles.bodyRight;
    body.style.width = savedPageStyles.bodyWidth;
    body.style.overflow = savedPageStyles.bodyOverflow;
    body.style.paddingRight = savedPageStyles.bodyPaddingRight;
    html.style.overflow = savedPageStyles.htmlOverflow;

    savedPageStyles = null;
    window.scrollTo(0, savedPageScrollY);
  };
}

// ---------------------------------------------------------------------------
// Back-press overlay stack.
//
// A modal/dialog registers a handler while it is open. The Android Back button
// closes the topmost overlay first, then falls through to in-app navigation.
// Handlers are stored as a LIFO stack so "close the thing the user is looking
// at" is the default.
// ---------------------------------------------------------------------------
const backStack = [];

export function pushBackHandler(handler) {
  backStack.push(handler);
  return () => {
    const index = backStack.lastIndexOf(handler);
    if (index >= 0) backStack.splice(index, 1);
  };
}

export function handleOverlayBack() {
  const handler = backStack[backStack.length - 1];
  if (!handler) return false;
  try {
    handler();
  } catch {
    /* a broken overlay handler must not swallow the Back press */
  }
  return true;
}

// ---------------------------------------------------------------------------
// One-time native UI setup (status bar, keyboard resize).
// Safe to call on web and safe to call more than once.
// ---------------------------------------------------------------------------
let uiReady = false;

export async function initNativeUi() {
  if (!isNative() || uiReady) return;
  uiReady = true;

  try {
    // The app header is always dark (gray-900), so the status bar uses light
    // content on a matching dark background. This matches both themes.
    await StatusBar.setStyle({ style: Style.Light });
    await StatusBar.setBackgroundColor({ color: "#111827" });
    // Overlay mode comes from capacitor.config.json (overlaysWebView: false).
    // Re-applying it here would reset the Android decor flags AFTER MainActivity
    // hides the navigation bar, making the bar reappear at startup.
  } catch {
    /* plugin unavailable - non-fatal */
  }

  try {
    // Resize the webview when the soft keyboard opens so focused form fields
    // stay visible.
    await Keyboard.setResizeMode({ mode: KeyboardResize.Body });
  } catch {
    /* plugin unavailable - non-fatal */
  }
}

export async function hideNativeSplash() {
  if (!isNative()) return;

  try {
    await SplashScreen.hide();
  } catch {
    /* plugin unavailable - non-fatal */
  }

  try {
    // A full-screen launch splash can hide the status bar on older Android
    // versions; restore it as soon as the splash is gone.
    await StatusBar.show();
  } catch {
    /* plugin unavailable - non-fatal */
  }
}

// ---------------------------------------------------------------------------
// Hardware Back button. `rootHandler` returns true when it consumed the press
// (in-app navigation happened) and false when the app is already at its root.
// ---------------------------------------------------------------------------
export async function registerNativeBackButton(rootHandler) {
  if (!isNative()) return () => {};

  const listener = await CapApp.addListener("backButton", () => {
    // 1) An open modal/dialog owns the press.
    if (handleOverlayBack()) return;
    // 2) In-app navigation.
    if (rootHandler && rootHandler()) return;
    // 3) Already at the app root: minimize rather than kill the app, so a
    //    half-finished entry is not lost and re-opening is instant.
    CapApp.minimizeApp();
  });

  return () => {
    listener.remove();
  };
}
