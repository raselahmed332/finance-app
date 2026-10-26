"use strict";

// Regression coverage for cross-execution cache invalidation in the account
// namespaces.
//
// The default test stub hands out a FRESH script cache per getScriptCache()
// call, so cross-execution staleness is invisible there. In real Apps Script the
// script cache is shared and out-of-process, while _userCache/_cacheKeys are
// rebuilt per execution. Accounts.gs used cacheClear_() alone, which can only
// reach script-cache keys written earlier in the SAME execution, so a just-added
// account stayed hidden in every dropdown for up to CACHE_TTL. These tests use a
// persistent cache and reset the per-execution globals to reproduce that.

const { test } = require("node:test");
const assert = require("node:assert");
const { loadBackend } = require("./load-backend");

function persistentCache() {
  const data = new Map();
  return {
    get: (k) => (data.has(k) ? data.get(k) : null),
    put: (k, v) => {
      data.set(k, v);
    },
    remove: (k) => {
      data.delete(k);
    },
    removeAll: () => {
      data.clear();
    },
  };
}

// A fresh Apps Script execution: the per-execution memory caches start empty
// while the out-of-process script cache keeps its contents.
function coldStart(ctx) {
  ctx._userCache = {};
  ctx._cacheKeys = {};
}

function setup() {
  const cache = persistentCache();
  const ctx = loadBackend({ globals: { CacheService: { getScriptCache: () => cache } } });
  ctx.setupDatabase();
  const ss = ctx.ss_();
  ss.getSheetByName("Users").appendRow([
    "admin", "Admin", "x", "Admin", "Active", "[]", "[]", "", "", "", "", "", 0,
  ]);
  ss.getSheetByName("Wallets").appendRow([
    "W001", "Main", "BDT", "BDT_Main", "Active", "now", "now", 0, 0,
  ]);
  ctx.cacheClear_("wallets");
  ctx.cacheClear_("user");
  return ctx;
}

test("an account added on a cold execution shows up on the next cold read", () => {
  const ctx = setup();

  // Execution 1: a read primes the shared script cache with the two seeds.
  const before = ctx.getFinancialAccounts("admin", "W001");
  assert.equal(before.accounts.length, 2);

  // Execution 2 (cold): add a third account.
  coldStart(ctx);
  const added = ctx.addFinancialAccount(
    { walletId: "W001", accountTypeId: "AT-CASH", name: "Pocket", openingBalance: 0 },
    "admin",
  );
  assert.equal(added.status, "SUCCESS", added.message);

  // Execution 3 (cold): the new account must already be visible - before the fix
  // the stale script-cache entry hid it for up to CACHE_TTL.
  coldStart(ctx);
  const after = ctx.getFinancialAccounts("admin", "W001");
  assert.equal(after.accounts.length, 3);
  assert.ok(after.accounts.some((a) => a.AccountID === added.accountId));
});

test("an account edit and a retire also survive a cold execution", () => {
  const ctx = setup();
  const initial = ctx.getFinancialAccounts("admin", "W001");
  const bank = initial.accounts.find((a) => a.AccountID === "Bank");

  coldStart(ctx);
  const renamed = ctx.updateFinancialAccount(bank.AccountID, { walletId: "W001", name: "Islami", status: "Active" }, "admin");
  assert.equal(renamed.status, "SUCCESS", renamed.message);

  coldStart(ctx);
  const afterRename = ctx.getFinancialAccounts("admin", "W001");
  assert.ok(afterRename.accounts.some((a) => a.AccountID === "Bank" && a.Name === "Islami"));

  coldStart(ctx);
  const retired = ctx.deleteFinancialAccount("Bank", { walletId: "W001" }, "admin");
  assert.equal(retired.status, "SUCCESS", retired.message);

  coldStart(ctx);
  const active = ctx.financialAccountsForWallet_("W001");
  assert.ok(!active.some((a) => a.AccountID === "Bank"));
});

test("an account type added on a cold execution shows up on the next cold read", () => {
  const ctx = setup();
  ctx.getAccountTypes("admin"); // prime the shared cache

  coldStart(ctx);
  const added = ctx.addAccountType({ name: "Mobile Wallet", code: "MOBILE" }, "admin");
  assert.equal(added.status, "SUCCESS", added.message);

  coldStart(ctx);
  const after = ctx.getAccountTypes("admin");
  assert.ok(after.accountTypes.some((t) => t.Code === "MOBILE"));
});
