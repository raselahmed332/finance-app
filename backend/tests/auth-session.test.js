"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadBackend } = require("./load-backend.js");
const { createCache } = require("./stubs.js");

test("alphanumeric login creates a session that is invalidated by a security version change", () => {
  const ctx = loadBackend();
  const cache = createCache();
  ctx.CacheService.getScriptCache = () => cache;
  ctx.setupDatabase();

  const users = ctx.getUsersSheet_();
  users.appendRow([
    "casey", "Casey", ctx.hashPin_("word1234"), "Admin", "Active",
    "[]", "[]", "", "", "", "now", "now", 0,
  ]);
  ctx.cacheClear_("user");

  const login = ctx.loginUser("casey", "word1234");
  assert.equal(login.status, "SUCCESS", login.message);

  const validSession = ctx.validateSession(login.token);
  assert.equal(validSession.status, "SUCCESS", validSession.message);

  const user = ctx.getUserRecord_("casey");
  assert.equal(ctx.bumpSessionVersion_(user.Username, user), 1);
  const revokedSession = ctx.validateSession(login.token);
  assert.equal(revokedSession.status, "ERROR");
  assert.equal(revokedSession.code, "SESSION_EXPIRED");
});
