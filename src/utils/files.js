// Cross-platform file delivery.
//
// On the web we trigger a normal browser download (blob URL + <a download>).
// Inside the Capacitor shell the WebView cannot start a `blob:` download, so we
// write the bytes to the app cache with the Filesystem plugin and hand the file
// to the OS share/save sheet via the Share plugin. Both paths never throw at the
// call site — they fall back to the other method if a plugin is unavailable.

import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

export const isNative = () => Capacitor.isNativePlatform();

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error || new Error("Could not read file"));
    reader.readAsDataURL(blob);
  });
}

// Web: trigger an ordinary browser download of the blob.
function webDownload(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Give the browser time to start the download before releasing the URL.
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

// Native: write the file to cache, then hand it to the OS share/save sheet so it
// can be saved to Files/Drive or opened by another app.
async function nativeDeliver(filename, blob) {
  const base64 = await blobToBase64(blob);
  const { uri } = await Filesystem.writeFile({
    path: filename,
    data: base64,
    directory: Directory.Cache,
  });
  await Share.share({ files: [uri], title: filename });
}

// Save/share a blob. Works in the browser and in the Android/iOS shell.
export async function saveBlob(filename, blob) {
  if (isNative()) {
    try {
      await nativeDeliver(filename, blob);
      return;
    } catch {
      /* fall through to a normal download attempt */
    }
  }
  webDownload(filename, blob);
}

// Share a blob: native share sheet on the shell, Web Share API on supported
// browsers, plain download as the last resort.
export async function shareBlob(filename, blob, title) {
  if (isNative()) {
    await saveBlob(filename, blob);
    return;
  }
  try {
    const file = new File([blob], filename, { type: blob.type || "application/octet-stream" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: title || filename });
      return;
    }
  } catch (e) {
    if (e && e.name === "AbortError") return; // user dismissed the share sheet
  }
  webDownload(filename, blob);
}
