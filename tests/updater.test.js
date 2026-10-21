import test from "node:test";
import assert from "node:assert/strict";

import {
  formatBytes,
  toFileOpenerPath,
  parseTagVersionCode,
  parseRelease,
  UpdateError,
} from "../src/utils/updater.js";

// --- formatBytes -------------------------------------------------------------

test("formatBytes renders KB/MB with sensible precision", () => {
  assert.equal(formatBytes(0), "0 KB");
  assert.equal(formatBytes(-5), "0 KB");
  assert.equal(formatBytes(512), "512 B");
  assert.equal(formatBytes(2048), "2 KB");
  assert.equal(formatBytes(1024 * 1024), "1.0 MB");
  assert.equal(formatBytes(8 * 1024 * 1024), "8.0 MB");
});

// --- toFileOpenerPath --------------------------------------------------------
//
// The file-opener plugin wraps anything that is not a content:// uri in its own
// FileProvider, so a file:// uri must be reduced to a plain filesystem path and
// a content:// uri must pass through untouched. This is the fix for the failed
// installer launch: the previous code handed the plugin a stale `.part` path.

test("toFileOpenerPath strips file:// to a plain path", () => {
  assert.equal(
    toFileOpenerPath("file:///data/user/0/com.amarhisab.app/cache/AmarHisab-update.apk"),
    "/data/user/0/com.amarhisab.app/cache/AmarHisab-update.apk",
  );
});

test("toFileOpenerPath decodes percent-encoding in a file:// uri", () => {
  assert.equal(
    toFileOpenerPath("file:///data/user/0/com.amarhisab.app/cache/Amar%20Hisab.apk"),
    "/data/user/0/com.amarhisab.app/cache/Amar Hisab.apk",
  );
});

test("toFileOpenerPath passes content:// and bare paths through", () => {
  const content = "content://com.amarhisab.app.file.opener.provider/cache/x.apk";
  assert.equal(toFileOpenerPath(content), content);
  assert.equal(toFileOpenerPath("/data/local/x.apk"), "/data/local/x.apk");
});

test("toFileOpenerPath tolerates empty input", () => {
  assert.equal(toFileOpenerPath(""), "");
  assert.equal(toFileOpenerPath(null), "");
});

// --- parseTagVersionCode -----------------------------------------------------

test("parseTagVersionCode accepts only v<digits>", () => {
  assert.equal(parseTagVersionCode("v3"), 3);
  assert.equal(parseTagVersionCode("  v12 "), 12);
  assert.equal(parseTagVersionCode("v3.1"), null);
  assert.equal(parseTagVersionCode("version3"), null);
  assert.equal(parseTagVersionCode("v3-extra"), null);
  assert.equal(parseTagVersionCode(3), null);
});

// --- parseRelease ------------------------------------------------------------

const apkAsset = { name: "AmarHisab-release.apk", size: 8 * 1024 * 1024 };

function release(overrides = {}) {
  return {
    tag_name: "v4",
    name: "Amar Hisab 1.3",
    body: "Fixes",
    assets: [apkAsset],
    ...overrides,
  };
}

test("parseRelease resolves download url, size and hasUpdate", () => {
  const parsed = parseRelease(release(), 3);
  assert.equal(parsed.versionCode, 4);
  assert.equal(parsed.hasUpdate, true);
  assert.equal(parsed.size, 8 * 1024 * 1024);
  assert.equal(
    parsed.downloadUrl,
    "https://github.com/raselahmed332/finance-app/releases/download/v4/AmarHisab-release.apk",
  );
});

test("parseRelease reports no update for equal/newer installed build", () => {
  assert.equal(parseRelease(release(), 4).hasUpdate, false);
  assert.equal(parseRelease(release(), 5).hasUpdate, false);
});

test("parseRelease rejects missing APK asset and bad tags", () => {
  assert.throws(
    () => parseRelease(release({ assets: [] }), 3),
    (e) => e instanceof UpdateError && e.code === "MISSING_APK",
  );
  assert.throws(
    () => parseRelease(release({ tag_name: "vX" }), 3),
    (e) => e instanceof UpdateError && e.code === "INVALID_TAG",
  );
  assert.throws(
    () => parseRelease(release({ draft: true }), 3),
    (e) => e instanceof UpdateError && e.code === "DRAFT_RELEASE",
  );
  assert.throws(
    () => parseRelease(release({ prerelease: true }), 3),
    (e) => e instanceof UpdateError && e.code === "PRERELEASE",
  );
});
