"use strict";

// Phase 3 coverage: Loans / Savings / Reports / Backup no longer treat the
// account as the hardcoded "Cash"|"Bank" pair. The loan and savings validators
// now scope the account to the wallet, the period report builds its account
// breakdown from the wallet's real accounts, and a backup carries (and restores)
// the account registry its rows depend on.

const test = require("node:test");
const assert = require("node:assert");
const { loadBackend } = require("./load-backend.js");

function setup() {
  const ctx = loadBackend();
  ctx.setupDatabase();
  const ss = ctx.ss_();
  ss.getSheetByName("Users").appendRow([
    "admin", "Admin", "x", "Admin", "Active", "[]", "[]", "", "", "", "", "", 0,
  ]);
  ss.getSheetByName("Wallets").appendRow([
    "W001", "Main", "BDT", "Wallet_W001", "Active", "now", "now", 1000, 5000,
  ]);
  ss.getSheetByName("Wallets").appendRow([
    "W002", "Second", "BDT", "Wallet_W002", "Active", "now", "now", 0, 0,
  ]);
  ctx.cacheClear_("wallets");
  ctx.cacheClear_("user");
  return ctx;
}

// ---------------- loan / savings account scoping ----------------

test("loanWalletCurrency_ accepts an account that belongs to the wallet", () => {
  const ctx = setup();
  const custom = ctx.addFinancialAccount(
    { walletId: "W001", accountTypeId: "AT-BANK", name: "IBBL" },
    "admin",
  );
  assert.equal(custom.status, "SUCCESS", custom.message);

  const ok = ctx.loanWalletCurrency_("admin", "W001", custom.accountId, null);
  assert.ok(ok.wallet, "custom account in its own wallet must resolve");
  assert.equal(ok.wallet.WalletID, "W001");
});

test("loanWalletCurrency_ refuses an account from another wallet", () => {
  const ctx = setup();
  const other = ctx.addFinancialAccount(
    { walletId: "W002", accountTypeId: "AT-CASH", name: "W2 Cash" },
    "admin",
  );
  const res = ctx.loanWalletCurrency_("admin", "W001", other.accountId, null);
  assert.ok(res.error, "foreign-wallet account must be refused");
  assert.equal(res.error.code, "INVALID_ACCOUNT");
});

test("loanWalletCurrency_ allows a deactivated account only when unchanged", () => {
  const ctx = setup();
  ctx.updateFinancialAccount("Bank", { walletId: "W001", status: "Inactive" }, "admin");

  const fresh = ctx.loanWalletCurrency_("admin", "W001", "Bank", null);
  assert.ok(fresh.error, "a NEW use of a retired account is refused");
  assert.equal(fresh.error.code, "INVALID_ACCOUNT");

  // The same account on an edit (previousAccount === account) is allowed, so an
  // existing loan stays editable after its account is retired.
  const kept = ctx.loanWalletCurrency_("admin", "W001", "Bank", null, "Bank");
  assert.ok(kept.wallet, "unchanged retired account must be allowed on edit");
});

test("savingsWalletCurrency_ echoes the loan rules", () => {
  const ctx = setup();
  const custom = ctx.addFinancialAccount(
    { walletId: "W001", accountTypeId: "AT-BANK", name: "Sonali" },
    "admin",
  );
  assert.ok(ctx.savingsWalletCurrency_("admin", "W001", custom.accountId, null).wallet);

  const other = ctx.addFinancialAccount(
    { walletId: "W002", accountTypeId: "AT-CASH", name: "W2 Cash" },
    "admin",
  );
  assert.equal(ctx.savingsWalletCurrency_("admin", "W001", other.accountId, null).error.code, "INVALID_ACCOUNT");

  ctx.updateFinancialAccount("Bank", { walletId: "W001", status: "Inactive" }, "admin");
  assert.equal(ctx.savingsWalletCurrency_("admin", "W001", "Bank", null).error.code, "INVALID_ACCOUNT");
  assert.ok(ctx.savingsWalletCurrency_("admin", "W001", "Bank", null, "Bank").wallet);
});

test("a savings plan can be created on a custom wallet account", () => {
  const ctx = setup();
  const custom = ctx.addFinancialAccount(
    { walletId: "W001", accountTypeId: "AT-BANK", name: "City Bank", openingBalance: 2000 },
    "admin",
  );
  const created = ctx.createSavingsPlan({
    user: "admin", type: "FLEXIBLE", name: "Custom", walletId: "W001",
    account: custom.accountId, startDate: "2026-01-01",
  });
  assert.equal(created.status, "SUCCESS", created.message);

  const dep = ctx.addSavingsFlexDeposit({
    user: "admin", planId: created.plan.PlanID, amount: 300, date: "2026-01-10",
    account: custom.accountId,
  });
  assert.equal(dep.status, "SUCCESS", dep.message);
  assert.equal(ctx.getAccountBalance_("W001", custom.accountId), 1700);
});

// ---------------- report account breakdown ----------------

test("getReport builds its account breakdown from the wallet's real accounts", () => {
  const ctx = setup();
  const custom = ctx.addFinancialAccount(
    { walletId: "W001", accountTypeId: "AT-CASH", name: "Pocket" },
    "admin",
  );
  ctx.addTransaction({
    user: "admin", type: "Income", walletId: "W001", account: custom.accountId,
    amount: 250, date: "2026-01-05", description: "Gift",
  });
  ctx.addTransaction({
    user: "admin", type: "Expense", walletId: "W001", account: "Bank",
    amount: 40, date: "2026-01-06", description: "Fee",
  });

  const report = ctx.getReport("admin", "W001", "monthly", "2026-01");
  assert.equal(report.status, "SUCCESS");
  // The legacy keys survive (the UI still shows them)...
  assert.equal(report.accountBreakdown.Cash, 0);
  assert.equal(report.accountBreakdown.Bank, -40);
  // ...and a custom account shows up without any hardcoding.
  assert.equal(report.accountBreakdown[custom.accountId], 250);
  assert.ok(report.accounts.some((a) => a.accountId === custom.accountId && a.name === "Pocket"));
});

// ---------------- backup carries the account registry ----------------

test("backup exports the account registry and restore brings a custom account back", () => {
  const ctx = setup();
  const custom = ctx.addFinancialAccount(
    { walletId: "W001", accountTypeId: "AT-BANK", name: "IBBL", openingBalance: 500 },
    "admin",
  );
  ctx.addTransaction({
    user: "admin", type: "Income", walletId: "W001", account: custom.accountId,
    amount: 100, date: "2026-01-05", description: "Deposit",
  });

  const backup = ctx.getBackupData("admin");
  assert.equal(backup.status, "SUCCESS");
  assert.ok(backup.accountTypes.some((t) => t[0] === "AT-CASH"));
  assert.ok(backup.financialAccounts.some((r) => r[0] === custom.accountId && r[1] === "W001"));

  // Simulate data loss: wipe the account registry (types + accounts).
  const ss = ctx.ss_();
  ss.getSheetByName("FinancialAccounts")._setRows([ctx.FINANCIAL_ACCOUNT_HEADERS]);
  ss.getSheetByName("AccountTypes")._setRows([ctx.ACCOUNT_TYPE_HEADERS]);
  ctx.cacheClear_("financialAccounts");
  ctx.cacheClear_("accountTypes");

  const restored = ctx.importBackup(backup, "admin");
  assert.equal(restored.status, "SUCCESS", restored.message);

  const walletAccounts = ctx.getFinancialAccounts("admin", "W001");
  assert.equal(walletAccounts.status, "SUCCESS");
  const back = walletAccounts.accounts.find((a) => a.AccountID === custom.accountId);
  assert.ok(back, "custom account must be restored");
  assert.equal(back.Name, "IBBL");
  assert.equal(ctx.getAccountBalance_("W001", custom.accountId), 600);
});
