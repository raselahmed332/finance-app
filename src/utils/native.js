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
    await StatusBar.setOverlaysWebView({ overlay: false });
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
