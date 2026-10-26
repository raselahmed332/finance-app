"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadBackend } = require("./load-backend.js");

test("PINs use a keyed hash and verify without storing the credential", () => {
  const ctx = loadBackend();
  const stored = ctx.hashPin_("word1234");

  assert.match(stored, /^hmac-sha256:[^:]+:[a-f0-9]{64}$/);
  assert.equal(stored.includes("word1234"), false);
  assert.equal(ctx.verifyPin_(stored, "word1234"), true);
  assert.equal(ctx.verifyPin_(stored, "wrong123"), false);
});

test("legacy SHA-256 hashes remain verifiable and upgrade after authentication", () => {
  const ctx = loadBackend();
  const salt = "legacy-salt";
  const digest = ctx.Utilities.computeDigest(
    ctx.Utilities.DigestAlgorithm.SHA_256,
    salt + ":1234word",
  ).map((byte) => (byte + 256).toString(16).slice(-2)).join("");
  const legacyHash = `sha256:${salt}:${digest}`;
  let writtenHash = null;

  assert.equal(ctx.verifyPin_(legacyHash, "1234word"), true);
  assert.equal(ctx.verifyPin_(legacyHash, "wrong"), false);

  ctx.getUsersSheet_ = () => ({
    getRange: () => ({ setValue: (value) => { writtenHash = value; } }),
  });
  ctx.cacheRemove_ = () => {};
  ctx.logAudit = () => {};
  const user = { _row: 2, Username: "test-user", PIN: legacyHash };

  assert.equal(ctx.migrateLegacyPin_(user, "1234word"), true);
  assert.equal(user.PIN, writtenHash);
  assert.match(writtenHash, /^hmac-sha256:/);
  assert.equal(ctx.verifyPin_(writtenHash, "1234word"), true);
});
