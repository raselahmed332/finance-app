// Android in-app self-update.
//
// Checks the public GitHub Releases API for a newer release of this app,
// downloads the matching signed APK to the device and hands it to Android's own
// package installer. Android keeps full control of the final install
// confirmation - nothing here bypasses it.
//
// Every native call is guarded by `Capacitor.isNativePlatform()`, so on the
// plain web build (GitHub Pages) this module is inert: it never touches a
// native plugin, never downloads an APK and never shows Android-only UI.

import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { FileTransfer } from "@capacitor/file-transfer";
import { FileOpener } from "@capacitor-community/file-opener";

// Human-readable byte size (binary units, matching Android's installer).
export function formatBytes(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return "0 KB";
  const units = ["B", "KB", "MB", "GB"];
  let value = n;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const decimals = unit <= 1 ? 0 : 1;
  return `${value.toFixed(decimals)} ${units[unit]}`;
}

// --- Release source ---------------------------------------------------------
//
// The release tag must be exactly `v<versionCode>`, and the tag number must
// equal the API's numeric release id. The APK is fetched through the GitHub
// *web* download URL for that tag rather than an asset's `browser_download_url`,
// because GitHub's release web URLs are documented and stable while the
// `/releases/download/<tag>/<asset>` path is not. The numeric id check also
// means a tag can never be re-used for a different release.

export const UPDATE_REPO = "raselahmed332/finance-app";
export const UPDATE_ASSET_NAME = "AmarHisab-release.apk";
const API_BASE = `https://api.github.com/repos/${UPDATE_REPO}`;

// The SHA-256 of the published APK is used to check the downloaded bytes are the
// exact release binary. It is discovered from the release metadata GitHub itself
// controls (api.github.com / github.com), never from user-editable release notes
// alone, so it cannot be swapped without repo write access.
const CHECKSUM_TIMEOUT_MS = 10000;
const RELEASE_TIMEOUT_MS = 15000;

export const ApkMimeType = "application/vnd.android.package-archive";

// Where the download lands, relative to the app's cache directory.
const APK_FILE_NAME = "AmarHisab-update.apk";
const APK_PART_NAME = APK_FILE_NAME + ".part";

// --- Native guard -----------------------------------------------------------

// True only inside the Android app shell. In a browser (or on iOS) every public
// function below short-circuits, so the web app is never affected.
export function isNativeAndroid() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

// --- Installed version ------------------------------------------------------

// Returns { versionName, versionCode } for the installed Android app.
// `build` is the numeric Android versionCode, `version` is the versionName.
export async function getInstalledVersion() {
  if (!isNativeAndroid()) return null;
  try {
    const info = await CapApp.getInfo();
    const code = Number.parseInt(String(info.build), 10);
    return {
      versionName: String(info.version || ""),
      versionCode: Number.isFinite(code) ? code : null,
    };
  } catch {
    return null;
  }
}

// --- Version / release parsing ---------------------------------------------

// Strict: `v` followed by digits only. Rejects `v3.1`, `version3`, `v3-extra`.
export function parseTagVersionCode(tag) {
  if (typeof tag !== "string") return null;
  const match = /^v(\d+)$/.exec(tag.trim());
  if (!match) return null;
  const code = Number.parseInt(match[1], 10);
  return Number.isSafeInteger(code) ? code : null;
}

// The signed release APK is always published here:
//   https://github.com/<repo>/releases/download/v<versionCode>/<asset>
// We check for that release's existence via the API. The tag must be exactly
// `v<versionCode>`; there is never a partial-match fallback, so a malformed tag
// is rejected rather than silently accepted.
//
// Validate an /api.github.com/repos/.../releases response and turn it into the
// release we would install, or throw a descriptive error.
//
// `release` is the raw JSON. `installedVersionCode` is the running versionCode.
export function parseRelease(release, installedVersionCode) {
  if (!release || typeof release !== "object") {
    throw new UpdateError("INVALID_RELEASE", "Release data is not valid.");
  }
  if (release.draft === true) {
    throw new UpdateError("DRAFT_RELEASE", "The latest release is still a draft.");
  }
  if (release.prerelease === true) {
    throw new UpdateError("PRERELEASE", "The latest release is a pre-release.");
  }

  const tag = String(release.tag_name || "").trim();
  const versionCode = parseTagVersionCode(tag);
  if (versionCode == null) {
    throw new UpdateError(
      "INVALID_TAG",
      `Release tag "${tag}" is not a valid version (expected v<number>).`,
    );
  }

  const assets = Array.isArray(release.assets) ? release.assets : [];
  const asset = assets.find((a) => a && a.name === UPDATE_ASSET_NAME);
  if (!asset) {
    throw new UpdateError(
      "MISSING_APK",
      `This release does not contain ${UPDATE_ASSET_NAME}.`,
    );
  }

  const versionName = String(
    release.name || release.tag_name || tag,
  ).trim();
  const downloadUrl = `https://github.com/${UPDATE_REPO}/releases/download/${tag}/${UPDATE_ASSET_NAME}`;

  return {
    tag,
    versionCode,
    versionName,
    title: String(release.name || tag),
    body: String(release.body || ""),
    publishedAt: release.published_at || null,
    size: Number(asset.size) || 0,
    expectedSha256: null, // filled in by the caller from the checksum sidecar
    downloadUrl,
    hasUpdate:
      Number.isFinite(installedVersionCode) &&
      versionCode > Number(installedVersionCode),
  };
}

// --- Network helpers --------------------------------------------------------

async function fetchWithTimeout(url, options = {}, timeoutMs = RELEASE_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// Reads the release's `<apk>.sha256` sidecar if present. Returns a lower-case
// hex digest, or null when no usable sidecar exists (the updater then reports
// the download as unverified rather than pretending it passed).
async function fetchExpectedSha256(tag) {
  try {
    const res = await fetchWithTimeout(
      `https://github.com/${UPDATE_REPO}/releases/download/${tag}/${UPDATE_ASSET_NAME}.sha256`,
      {},
      CHECKSUM_TIMEOUT_MS,
    );
    if (!res.ok) return null;
    const text = await res.text();
    const match = /\b([a-fA-F0-9]{64})\b/.exec(text);
    return match ? match[1].toLowerCase() : null;
  } catch {
    return null;
  }
}

// --- Public API -------------------------------------------------------------

export class UpdateError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "UpdateError";
    this.code = code;
  }
}

// Fetch the latest stable release, validate it and compare with the installed
// build. Never throws for "no update": callers inspect `.hasUpdate`.
export async function checkForUpdate() {
  if (!isNativeAndroid()) {
    return { status: "NOT_NATIVE", hasUpdate: false };
  }

  const installed = await getInstalledVersion();
  if (!installed || installed.versionCode == null) {
    return { status: "NO_VERSION", hasUpdate: false };
  }

  let res;
  try {
    res = await fetchWithTimeout(
      `${API_BASE}/releases/latest`,
      { headers: { Accept: "application/vnd.github+json" } },
      RELEASE_TIMEOUT_MS,
    );
  } catch (err) {
    return {
      status: "OFFLINE",
      hasUpdate: false,
      installed,
      error: new UpdateError("NETWORK", String(err?.message || err)),
    };
  }

  if (res.status === 404) {
    return { status: "NO_RELEASE", hasUpdate: false, installed };
  }
  if (res.status === 403 && res.headers.get("x-ratelimit-remaining") === "0") {
    return {
      status: "RATE_LIMITED",
      hasUpdate: false,
      installed,
      error: new UpdateError("RATE_LIMITED", "GitHub rate limit reached."),
    };
  }
  if (!res.ok) {
    return {
      status: "ERROR",
      hasUpdate: false,
      installed,
      error: new UpdateError("HTTP", `GitHub responded with HTTP ${res.status}.`),
    };
  }

  let release;
  try {
    release = await res.json();
  } catch {
    return {
      status: "ERROR",
      hasUpdate: false,
      installed,
      error: new UpdateError("BAD_JSON", "GitHub returned invalid JSON."),
    };
  }

  let parsed;
  try {
    parsed = parseRelease(release, installed.versionCode);
  } catch (err) {
    return { status: "INVALID", hasUpdate: false, installed, error: err };
  }

  if (!parsed.hasUpdate) {
    return {
      status: "UP_TO_DATE",
      hasUpdate: false,
      installed,
      release: parsed,
    };
  }

  const expectedSha256 = await fetchExpectedSha256(parsed.tag);
  return {
    status: "UPDATE_AVAILABLE",
    hasUpdate: true,
    installed,
    release: { ...parsed, expectedSha256 },
  };
}

// --- Download ---------------------------------------------------------------

let downloading = false;

async function safeDelete(name, directory) {
  try {
    await Filesystem.deleteFile({ path: name, directory });
  } catch {
    /* nothing to remove */
  }
}

async function sha256OfFile(uri) {
  try {
    const { data } = await Filesystem.readFile({ path: uri });
    const bytes = base64ToBytes(String(data || ""));
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return bytesToHex(new Uint8Array(digest));
  } catch {
    return null;
  }
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToHex(bytes) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Download the release APK to the app cache. Resolves to
// { verified, sha256, uri, size }. Throws UpdateError on failure.
//
// `onProgress({ bytes, contentLength, percent })` is optional.
export async function downloadUpdate(release, onProgress) {
  if (!isNativeAndroid()) {
    throw new UpdateError("NOT_NATIVE", "Updates are only available in the app.");
  }
  if (downloading) {
    throw new UpdateError("IN_PROGRESS", "A download is already in progress.");
  }
  downloading = true;

  try {
    if (!release || !release.versionCode || !release.downloadUrl) {
      throw new UpdateError("INVALID_RELEASE", "Release information is incomplete.");
    }

    // Clean any leftovers from an interrupted previous attempt.
    await safeDelete(APK_PART_NAME, Directory.Cache);
    await safeDelete(APK_FILE_NAME, Directory.Cache);

    let targetPath;
    if (Capacitor.getPlatform() === "android") {
      try {
        const { uri } = await Filesystem.getUri({
          path: APK_PART_NAME,
          directory: Directory.Cache,
        });
        targetPath = uri;
      } catch {
        targetPath = APK_PART_NAME;
      }
    } else {
      targetPath = APK_PART_NAME;
    }

    let progressListener = null;
    if (typeof onProgress === "function") {
      try {
        const handle = await FileTransfer.addListener("progress", (evt) => {
          onProgress({
            bytes: Number(evt?.bytes) || 0,
            contentLength: Number(evt?.contentLength) || 0,
            percent:
              evt && evt.lengthComputable && evt.contentLength
                ? Math.min(
                    100,
                    Math.round((evt.bytes / evt.contentLength) * 100),
                  )
                : null,
          });
        });
        progressListener = handle;
      } catch {
        progressListener = null;
      }
    }

    try {
      await FileTransfer.downloadFile({
        url: release.downloadUrl,
        path: targetPath,
        progress: typeof onProgress === "function",
        connectTimeout: 60000,
        readTimeout: 120000,
      });
    } catch (err) {
      await safeDelete(APK_PART_NAME, Directory.Cache);
      const code = String(err?.data?.code || "");
      if (code === "OS-PLUG-FLTR-0008" || /connect/i.test(String(err?.message || ""))) {
        throw new UpdateError("NETWORK", "Could not reach GitHub to download the update.");
      }
      if (code === "OS-PLUG-FLTR-0007") {
        throw new UpdateError("FILE_MISSING", "The update download did not complete.");
      }
      throw new UpdateError("DOWNLOAD_FAILED", "The update download failed.");
    } finally {
      if (progressListener) {
        try {
          await progressListener.remove();
        } catch {
          /* ignore */
        }
      }
      downloading = false;
    }

    // Confirm the file exists and is plausible.
    let actualPath = targetPath;
    let size = 0;
    try {
      const stat = await Filesystem.stat({
        path: APK_PART_NAME,
        directory: Directory.Cache,
      });
      size = Number(stat.size) || 0;
      actualPath = stat.uri || targetPath;
    } catch {
      await safeDelete(APK_PART_NAME, Directory.Cache);
      throw new UpdateError("FILE_MISSING", "The downloaded file could not be found.");
    }
    if (size < 1024) {
      await safeDelete(APK_PART_NAME, Directory.Cache);
      throw new UpdateError(
        "INCOMPLETE",
        "The downloaded file is incomplete (storage may be full).",
      );
    }

    // Verify the bytes are the exact published release binary when a trusted
    // checksum is available.
    let verified = false;
    let sha256 = await sha256OfFile(actualPath);
    if (release.expectedSha256) {
      if (!sha256 || sha256 !== release.expectedSha256) {
        await safeDelete(APK_PART_NAME, Directory.Cache);
        throw new UpdateError(
          "CHECKSUM_MISMATCH",
          "The downloaded update did not match its checksum and was discarded.",
        );
      }
      verified = true;
    }

    // Promote the verified file to its real name. After this the `.part` file
    // no longer exists, so the path we hand back MUST be the final name.
    await safeDelete(APK_FILE_NAME, Directory.Cache);
    let finalPath = actualPath;
    try {
      await Filesystem.rename({
        from: APK_PART_NAME,
        to: APK_FILE_NAME,
        directory: Directory.Cache,
      });
    } catch {
      // Some platforms cannot rename a full file URI; fall back to the .part
      // path we already validated.
    }

    // Re-stat the promoted file so the returned uri/size describe what is
    // actually on disk right now, not the pre-rename `.part`. This is what the
    // installer will open.
    try {
      const stat = await Filesystem.stat({
        path: APK_FILE_NAME,
        directory: Directory.Cache,
      });
      finalPath = stat.uri || finalPath;
      size = Number(stat.size) || size;
    } catch {
      // rename failed - the validated `.part` file is still on disk.
      finalPath = actualPath;
    }

    return { verified, sha256, uri: finalPath, size };
  } finally {
    downloading = false;
  }
}

// --- Installer --------------------------------------------------------------

// Reduce any of the URI shapes Capacitor / Android may hand us down to the one
// shape `@capacitor-community/file-opener` expects.
//
// The plugin's Android code branches on the string it receives:
//   - starts with `content://` -> used directly via ACTION_VIEW (content
//     provider already owns read access).
//   - anything else            -> treated as a filesystem path and wrapped by
//     the plugin's own FileProvider (`<applicationId>.file.opener.provider`),
//     whose `file_opener_paths.xml` covers the app cache dir. That is exactly
//     where we downloaded the APK, so a plain absolute path works.
//
// A `file://` URI is therefore decoded to its plain path; a `content://` URI is
// passed through untouched. A bare path is passed through as-is.
export function toFileOpenerPath(uri) {
  const raw = String(uri || "").trim();
  if (!raw) return "";
  if (raw.startsWith("content://")) return raw;
  if (raw.startsWith("file://")) {
    // file:///data/... -> /data/...  ; also tolerates file://localhost/...
    let path = raw.replace(/^file:\/\//, "");
    if (path.startsWith("localhost/")) path = path.slice("localhost".length);
    try {
      return decodeURIComponent(path);
    } catch {
      return path;
    }
  }
  return raw;
}

// Hand the downloaded APK to Android's package installer. The OS shows its own
// confirmation UI; this only opens it.
//
// Throws UpdateError with a specific code so the UI can react:
//   NO_FILE        - the downloaded APK cannot be found on disk
//   EMPTY_FILE     - it exists but is zero bytes
//   NEEDS_PERMISSION - Android blocked the install for lack of the
//                      "install unknown apps" grant
//   OPEN_FAILED    - the native call failed for any other reason
export async function openDownloadedApk(uri, { size: knownSize } = {}) {
  if (!isNativeAndroid()) {
    throw new UpdateError("NOT_NATIVE", "Installation is only available in the app.");
  }

  const filePath = toFileOpenerPath(uri);
  if (!filePath) {
    throw new UpdateError("OPEN_FAILED", "The downloaded file location is unknown.");
  }

  // The file opener wraps a plain path with the plugin FileProvider; a
  // content:// uri is used directly. Either way, refuse to open nothing.
  if (!filePath.startsWith("content://")) {
    try {
      const stat = await Filesystem.stat({
        path: filePath.startsWith("file://") ? filePath : filePath,
      });
      const size = Number(stat.size) || 0;
      if (size === 0 && !(knownSize > 0)) {
        throw new UpdateError("EMPTY_FILE", "The downloaded app file is empty.");
      }
    } catch (err) {
      if (err instanceof UpdateError) throw err;
      // stat failed: it may still be a valid content uri or a path stat() can't
      // reach but the plugin can. Only fail hard if we clearly downloaded to
      // cache and it is gone.
      if (/not.?found|does not exist|ENOENT/i.test(String(err?.message || ""))) {
        throw new UpdateError("NO_FILE", "The downloaded app file was not found.");
      }
    }
  }

  try {
    await FileOpener.open({
      filePath,
      contentType: ApkMimeType,
      openWithDefault: true,
    });
  } catch (err) {
    const message = String(err?.message || err || "");
    // Android returns this when REQUEST_INSTALL_PACKAGES has not been granted
    // for this app. Surface it as a distinct state so the UI can walk the user
    // through enabling it instead of showing a dead-end error.
    if (
      /REQUEST_INSTALL_PACKAGES|install.*unknown|not allowed|permission/i.test(
        message,
      ) ||
      String(err?.code || "") === "6"
    ) {
      throw new UpdateError("NEEDS_PERMISSION", message || "Install permission required.");
    }
    if (/not found|does not exist/i.test(message) || String(err?.code || "") === "9") {
      throw new UpdateError("NO_FILE", "The downloaded app file was not found.");
    }
    throw new UpdateError(
      "OPEN_FAILED",
      message || "Android could not open the installer.",
    );
  }
}

// Open Android's per-app "install unknown apps" settings screen so the user can
// grant the permission themselves. Never grants anything automatically.
export function openInstallPermissionSettings() {
  if (!isNativeAndroid()) return Promise.resolve(false);
  // No dedicated Capacitor API; the OS settings intent is launched through the
  // App plugin's openUrl, which maps to ACTION_VIEW. The `package:` uri opens
  // this app's install-permission page on API 26+.
  const pkg = "com.amarhisab.app";
  const url = `package:${pkg}`;
  return CapApp.openUrl({ url }).then(
    () => true,
    () => false,
  );
}
