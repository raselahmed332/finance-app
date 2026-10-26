"use strict";

// Coverage for the dynamic account model (Accounts.gs):
//
//   AccountTypes      - the kinds of account that exist (Cash, Bank, ...)
//   FinancialAccounts - one real account inside one wallet, carrying its own
//                       opening balance and the ID stored on money rows.
//
// The two behaviours that keep this migration invisible are pinned here: a
// brand-new spreadsheet seeds Cash/Bank types, and every wallet is lazily
// back-filled with a "Cash" and a "Bank" financial account whose opening balance
// is copied from the legacy OpeningCash/OpeningBank columns, so old rows and
// getAccountBalance_ keep working unchanged.

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
  // A plain user scoped to W001 with no MANAGE_ACCOUNTS grant.
  ss.getSheetByName("Users").appendRow([
    "clerk", "Clerk", "x", "User", "Active", "[]", '["W001"]', "", "", "", "", "", 0,
  ]);
  ss.getSheetByName("Wallets").appendRow([
    "W001", "Main", "BDT", "BDT_Main", "Active", "now", "now", 1000, 2000,
  ]);
  ctx.cacheClear_("wallets");
  ctx.cacheClear_("user");
  return ctx;
}

test("a fresh database seeds the Cash and Bank account types", () => {
  const ctx = loadBackend();
  ctx.setupDatabase();
  const res = ctx.getAccountTypes("admin");
  assert.equal(res.status, "SUCCESS");
  const ids = res.accountTypes.map((t) => t.AccountTypeID).sort();
  assert.deepEqual(ids, ["AT-BANK", "AT-CASH"]);
  assert.equal(res.accountTypes.find((t) => t.AccountTypeID === "AT-CASH").Name, "Cash");
});

test("every wallet is lazily back-filled with Cash and Bank carrying the legacy openings", () => {
  const ctx = setup();

  const accounts = ctx.financialAccountsForWallet_("W001");
  assert.equal(accounts.length, 2);
  const cash = accounts.find((a) => a.AccountID === "Cash");
  const bank = accounts.find((a) => a.AccountID === "Bank");
  assert.equal(cash.OpeningBalance, 1000);
  assert.equal(bank.OpeningBalance, 2000);
  assert.equal(cash.AccountTypeID, "AT-CASH");

  // Idempotent: a second read (and the balance path) must not duplicate rows.
  ctx.financialAccountsForWallet_("W001");
  assert.equal(ctx.financialAccountsForWallet_("W001").length, 2);
});

test("getAccountBalance_ still reports the legacy opening plus ledger movement", () => {
  const ctx = setup();
  assert.equal(ctx.getAccountBalance_("W001", "Cash"), 1000);
  assert.equal(ctx.getAccountBalance_("W001", "Bank"), 2000);

  // The opening is read from the financial account row, not the wallet column,
  // so editing the row in place changes the balance without touching the wallet.
  const w = ctx.ss_();
  w.getSheetByName("FinancialAccounts")._rows().forEach((r) => {
    if (r[0] === "Cash") r[5] = 1500;
  });
  ctx.cacheClear_("financialAccounts");
  assert.equal(ctx.getAccountBalance_("W001", "Cash"), 1500);
});

test("isValidAccount_ accepts registered accounts and the legacy pair, but not unknowns", () => {
  const ctx = setup();
  assert.equal(ctx.isValidAccount_("Cash"), true);
  assert.equal(ctx.isValidAccount_("Bank"), true);
  const added = ctx.addFinancialAccount(
    { walletId: "W001", accountTypeId: "AT-CASH", name: "Pocket", openingBalance: 50 },
    "admin",
  );
  assert.equal(added.status, "SUCCESS", added.message);
  assert.equal(ctx.isValidAccount_(added.accountId), true);
  assert.equal(ctx.isValidAccount_("Nope"), false);
});

test("addAccountType enforces the Admin-only permission and uniqueness", () => {
  const ctx = setup();

  const denied = ctx.addAccountType({ name: "Mobile", code: "MOBILE" }, "clerk");
  assert.equal(denied.status, "ERROR");
  assert.equal(denied.code, "PERMISSION_DENIED");

  const ok = ctx.addAccountType({ name: "Mobile Wallet", code: "MOBILE" }, "admin");
  assert.equal(ok.status, "SUCCESS", ok.message);
  assert.match(ok.accountTypeId, /^AT\d+$/);

  const dup = ctx.addAccountType({ name: "Mobile Wallet", code: "MOBILE2" }, "admin");
  assert.equal(dup.code, "ACCOUNT_TYPE_EXISTS");

  const badCode = ctx.addAccountType({ name: "X", code: "no spaces" }, "admin");
  assert.equal(badCode.code, "INVALID_ACCOUNT_CODE");

  // The new type is visible to every signed-in user.
  const list = ctx.getAccountTypes("clerk");
  assert.ok(list.accountTypes.some((t) => t.AccountTypeID === ok.accountTypeId));
});

test("MANAGE_ACCOUNTS is Admin-only and never grantable", () => {
  const ctx = loadBackend();
  assert.ok(ctx.ADMIN_ONLY_ACTIONS.indexOf("MANAGE_ACCOUNTS") !== -1);
  assert.equal(ctx.GRANTABLE_PERMISSIONS.indexOf("MANAGE_ACCOUNTS"), -1);
  assert.equal(ctx.ALL_PERMISSIONS.indexOf("MANAGE_ACCOUNTS") !== -1, true);
});

test("addFinancialAccount validates wallet, type, currency eligibility and opening", () => {
  const ctx = setup();

  const noWallet = ctx.addFinancialAccount({ accountTypeId: "AT-CASH", name: "X" }, "admin");
  assert.equal(noWallet.status, "ERROR");

  const badType = ctx.addFinancialAccount({ walletId: "W001", accountTypeId: "AT-GHOST", name: "X" }, "admin");
  assert.equal(badType.code, "ACCOUNT_TYPE_NOT_FOUND");

  // A currency-restricted type cannot be used in a wallet of another currency.
  const sarType = ctx.addAccountType(
    { name: "Saudi Bank", code: "SARBANK", applicableCurrencies: ["SAR"] },
    "admin",
  );
  const mismatch = ctx.addFinancialAccount(
    { walletId: "W001", accountTypeId: sarType.accountTypeId, name: "Mismatch" },
    "admin",
  );
  assert.equal(mismatch.code, "ACCOUNT_TYPE_CURRENCY_MISMATCH");

  const badOpening = ctx.addFinancialAccount(
    { walletId: "W001", accountTypeId: "AT-CASH", name: "Bad", openingBalance: "1e3" },
    "admin",
  );
  assert.equal(badOpening.code, "INVALID_AMOUNT");

  const dupName = ctx.addFinancialAccount(
    { walletId: "W001", accountTypeId: "AT-CASH", name: "Cash" },
    "admin",
  );
  assert.equal(dupName.code, "ACCOUNT_EXISTS");

  // A permitted, correctly-scoped account is created with a generated ID and an
  // opening balance that the balance path honours.
  const ok = ctx.addFinancialAccount(
    { walletId: "W001", accountTypeId: "AT-CASH", name: "Wallet Cash", openingBalance: 125 },
    "admin",
  );
  assert.equal(ok.status, "SUCCESS", ok.message);
  assert.match(ok.accountId, /^FA\d+$/);
  assert.equal(ctx.getAccountBalance_("W001", ok.accountId), 125);
});

test("getFinancialAccounts is wallet-scoped", () => {
  const ctx = setup();
  const ss = ctx.ss_();
  ss.getSheetByName("Wallets").appendRow(["W002", "Second", "BDT", "BDT_Second", "Active", "now", "now", 0, 0]);
  ctx.cacheClear_("wallets");

  const denied = ctx.getFinancialAccounts("clerk", "W002");
  assert.equal(denied.status, "ERROR");
  assert.equal(denied.code, "WALLET_ACCESS_DENIED");

  const own = ctx.getFinancialAccounts("clerk", "W001");
  assert.equal(own.status, "SUCCESS");
  assert.equal(own.accounts.length, 2);
});

test("an account cannot be retired below one active account per wallet", () => {
  const ctx = setup();

  const offBank = ctx.updateFinancialAccount("Bank", { walletId: "W001", status: "Inactive" }, "admin");
  assert.equal(offBank.status, "SUCCESS", offBank.message);

  const offLast = ctx.deleteFinancialAccount("Cash", { walletId: "W001" }, "admin");
  assert.equal(offLast.status, "ERROR");
  assert.equal(offLast.code, "LAST_ACCOUNT");

  // Renaming an account is independent of the active-count rule.
  const rename = ctx.updateFinancialAccount("Cash", { walletId: "W001", name: "হাতের টাকা" }, "admin");
  assert.equal(rename.status, "SUCCESS", rename.message);
  const accounts = ctx.financialAccountsForWallet_("W001", { includeInactive: true });
  assert.ok(accounts.some((a) => a.AccountID === "Cash" && a.Name === "হাতের টাকা"));
});

test("renaming requires EDIT_WALLET and a non-duplicate name", () => {
  const ctx = setup();
  const denied = ctx.updateFinancialAccount("Cash", { walletId: "W001", name: "X" }, "clerk");
  assert.equal(denied.status, "ERROR");
  assert.equal(denied.code, "PERMISSION_DENIED");

  const clash = ctx.updateFinancialAccount("Cash", { walletId: "W001", name: "Bank" }, "admin");
  assert.equal(clash.code, "ACCOUNT_EXISTS");
});

test("deleteAccountType refuses a type still referenced by a wallet account", () => {
  const ctx = setup();

  const inUse = ctx.deleteAccountType("AT-CASH", "admin");
  assert.equal(inUse.status, "ERROR");
  assert.equal(inUse.code, "ACCOUNT_TYPE_IN_USE");

  const spare = ctx.addAccountType({ name: "Spare", code: "SPARE" }, "admin");
  const removed = ctx.deleteAccountType(spare.accountTypeId, "admin");
  assert.equal(removed.status, "SUCCESS", removed.message);
  assert.ok(!ctx.getAccountTypes("admin").accountTypes.some((t) => t.AccountTypeID === spare.accountTypeId));
});

test("backup import accepts registered financial account IDs", () => {
  const ctx = setup();
  const added = ctx.addFinancialAccount(
    { walletId: "W001", accountTypeId: "AT-BANK", name: "IBBL", openingBalance: 0 },
    "admin",
  );
  assert.equal(added.status, "SUCCESS", added.message);
  assert.equal(ctx.isValidAccount_(added.accountId), true);
});
