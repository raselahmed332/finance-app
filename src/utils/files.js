// Cross-platform file delivery.
//
// Web downloads use a blob URL and an anchor. Native sharing stages the file in
// the app cache for the OS share sheet; Android downloads use the system
// document picker because a WebView cannot download a `blob:` URL directly.

import { Capacitor, registerPlugin } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

export const isNative = () => Capacitor.isNativePlatform();
const PdfSaver = registerPlugin("PdfSaver");

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

// Android's WebView cannot download blob URLs directly. Use Android's document
// picker so the user can save the PDF in Downloads or another chosen location.
export async function downloadBlob(filename, blob) {
  if (!isNative() || Capacitor.getPlatform() !== "android") {
    await saveBlob(filename, blob);
    return;
  }

  const safeFilename = filename.replace(/[\\/:*?"<>|]/g, "_");
  const tempPath = `download-${Date.now()}-${safeFilename}`;
  const base64 = await blobToBase64(blob);
  const { uri } = await Filesystem.writeFile({
    path: tempPath,
    data: base64,
    directory: Directory.Cache,
  });

  try {
    await PdfSaver.savePdf({ fileUri: uri, fileName: safeFilename });
  } finally {
    try {
      await Filesystem.deleteFile({ path: tempPath, directory: Directory.Cache });
    } catch (error) {
      console.error("Could not remove temporary downloaded file", error);
    }
  }
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
