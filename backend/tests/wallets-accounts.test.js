"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { loadBackend } = require("./load-backend.js");

function setup() {
  const ctx = loadBackend();
  ctx.setupDatabase();
  ctx.ss_().getSheetByName("Users").appendRow([
    "admin", "Admin", "x", "Admin", "Active", "[]", "[]", "", "", "", "", "", 0,
  ]);
  ctx.cacheClear_("user");
  return ctx;
}

function createAccount(name, accountTypeId, openingBalance) {
  return { name, accountTypeId, openingBalance };
}

function accountsFor(ctx, walletId) {
  return ctx.financialAccountsForWallet_(walletId, { includeInactive: true });
}

test("creates a wallet with one custom account and stores its opening balance once", () => {
  const ctx = setup();
  const result = ctx.addWallet("Travel", "BDT", null, null, "admin", [
    createAccount("Pocket Cash", "AT-CASH", "125.50"),
  ]);

  assert.equal(result.status, "SUCCESS", result.message);
  const wallet = ctx.getWalletById_(result.walletId);
  const accounts = accountsFor(ctx, result.walletId);
  assert.equal(accounts.length, 1);
  assert.equal(accounts[0].Name, "Pocket Cash");
  assert.equal(accounts[0].OpeningBalance, 125.5);
  assert.equal(ctx.getAccountBalance_(result.walletId, accounts[0].AccountID), 125.5);
  assert.equal(wallet.OpeningCash, 0);
  assert.equal(wallet.OpeningBank, 0);
});

test("creates exactly the submitted custom accounts and calculates the opening total", () => {
  const ctx = setup();
  const result = ctx.addWallet("Multi", "BDT", null, null, "admin", [
    createAccount("Al Rajhi Bank", "AT-BANK", "200.25"),
    createAccount("bKash", "AT-CASH", "49.75"),
    createAccount("Nagad", "AT-CASH", "0"),
  ]);

  assert.equal(result.status, "SUCCESS", result.message);
  const accounts = accountsFor(ctx, result.walletId);
  assert.deepEqual(accounts.map((account) => account.Name), ["Al Rajhi Bank", "bKash", "Nagad"]);
  const total = accounts.reduce((sum, account) => sum + ctx.getAccountBalance_(result.walletId, account.AccountID), 0);
  assert.equal(total, 250);
  assert.equal(ctx.getAccountBalance_(result.walletId, accounts[2].AccountID), 0);
});

test("rejects malformed, empty, blank, duplicate and invalid opening account data before writing", () => {
  const ctx = setup();
  const invalidCases = [
    { accounts: [], code: "INVALID_ACCOUNTS" },
    { accounts: "not-an-array", code: "INVALID_ACCOUNTS" },
    { accounts: [null], code: "INVALID_ACCOUNTS" },
    { accounts: [createAccount(42, "AT-CASH", 0)], code: "INVALID_ACCOUNTS" },
    { accounts: [{ name: "Missing balance", accountTypeId: "AT-CASH" }], code: "INVALID_ACCOUNTS" },
    { accounts: [createAccount("  ", "AT-CASH", 0)], code: "INVALID_ACCOUNT_NAME" },
    { accounts: [createAccount("x".repeat(61), "AT-CASH", 0)], code: "INVALID_ACCOUNT_NAME" },
    {
      accounts: [createAccount("  Pocket ", "AT-CASH", 0), createAccount("pOcKeT", "AT-BANK", 1)],
      code: "ACCOUNT_EXISTS",
    },
    { accounts: [createAccount("Negative", "AT-CASH", -1)], code: "INVALID_AMOUNT" },
    { accounts: [createAccount("Non-numeric", "AT-CASH", "abc")], code: "INVALID_AMOUNT" },
    { accounts: [createAccount("Infinite", "AT-CASH", Infinity)], code: "INVALID_AMOUNT" },
    { accounts: [createAccount("Over limit", "AT-CASH", "1000000000")], code: "INVALID_AMOUNT" },
    { accounts: [createAccount("Exponent", "AT-CASH", "1e3")], code: "INVALID_AMOUNT" },
    { accounts: [createAccount("Precision", "AT-CASH", "1.001")], code: "INVALID_AMOUNT" },
    { accounts: [createAccount("Unknown type", "AT-GHOST", 0)], code: "ACCOUNT_TYPE_NOT_FOUND" },
  ];

  invalidCases.forEach(({ accounts, code }, index) => {
    const result = ctx.addWallet("Rejected " + index, "BDT", null, null, "admin", accounts);
    assert.equal(result.status, "ERROR");
    assert.equal(result.code, code);
  });
  assert.equal(ctx.ss_().getSheetByName("Wallets").getLastRow(), 1);
  assert.equal(ctx.ss_().getSheetByName("FinancialAccounts").getLastRow(), 1);
});

test("rejects initial account types that are invalid for the wallet currency", () => {
  const ctx = setup();
  const type = ctx.addAccountType({
    name: "Saudi Only",
    code: "SAUDI",
    applicableCurrencies: ["SAR"],
  }, "admin");
  assert.equal(type.status, "SUCCESS");

  const result = ctx.addWallet("Wrong currency", "BDT", null, null, "admin", [
    createAccount("Saudi Account", type.accountTypeId, 0),
  ]);
  assert.equal(result.code, "ACCOUNT_TYPE_CURRENCY_MISMATCH");
  assert.equal(ctx.ss_().getSheetByName("Wallets").getLastRow(), 1);
});

test("rolls back only newly created wallet records when initial account writing fails", () => {
  const ctx = setup();
  const accountsSheet = ctx.getFinancialAccountsSheet_();
  const appendRow = accountsSheet.appendRow;
  let writes = 0;
  accountsSheet.appendRow = function (row) {
    writes++;
    if (writes === 2) throw new Error("simulated account write failure");
    return appendRow.call(this, row);
  };

  const result = ctx.addWallet("Rollback", "BDT", null, null, "admin", [
    createAccount("First", "AT-CASH", 10),
    createAccount("Second", "AT-BANK", 20),
  ]);

  assert.equal(result.status, "ERROR");
  assert.equal(result.code, "WALLET_CREATE_FAILED");
  assert.match(result.message, /simulated account write failure/);
  assert.equal(ctx.getWalletById_("W001"), null);
  assert.equal(accountsFor(ctx, "W001").length, 0);
  assert.equal(ctx.ss_().getSheetByName("Wallet_W001"), null);
});

test("repeated wallet creation requests cannot duplicate a wallet with the same active name and currency", () => {
  const ctx = setup();
  const initial = [createAccount("Main Cash", "AT-CASH", 0)];
  const first = ctx.addWallet("Repeat", "BDT", null, null, "admin", initial);
  const second = ctx.addWallet("Repeat", "BDT", null, null, "admin", initial);

  assert.equal(first.status, "SUCCESS");
  assert.equal(second.status, "ERROR");
  assert.equal(ctx.ss_().getSheetByName("Wallets").getLastRow(), 2);
  assert.equal(accountsFor(ctx, first.walletId).length, 1);
});

test("existing custom, inactive and one-account wallets are preserved without fallback rows", () => {
  const ctx = setup();
  const walletsSheet = ctx.ss_().getSheetByName("Wallets");
  walletsSheet.appendRow(["W010", "Custom", "BDT", "BDT_Custom", "Active", "created", "updated", 3, 4]);
  walletsSheet.appendRow(["W011", "Inactive only", "BDT", "BDT_Inactive", "Active", "created", "updated", 5, 6]);
  const accountsSheet = ctx.getFinancialAccountsSheet_();
  accountsSheet.appendRow(["FA010", "W010", "AT-BANK", "User bank", "BDT", 17.25, "Active", "created", "updated"]);
  accountsSheet.appendRow(["Cash", "W011", "AT-CASH", "Cash", "BDT", 5, "Inactive", "created", "updated"]);
  ctx.cacheClear_("wallets");
  ctx.invalidateAccounts_();

  ctx.ensureWalletDefaultAccounts_("W010");
  ctx.ensureWalletDefaultAccounts_("W011");
  const custom = accountsFor(ctx, "W010");
  const inactive = accountsFor(ctx, "W011");
  assert.deepEqual(custom.map((account) => [account.AccountID, account.Name, account.OpeningBalance]), [
    ["FA010", "User bank", 17.25],
  ]);
  assert.deepEqual(inactive.map((account) => [account.AccountID, account.Name, account.Status, account.OpeningBalance]), [
    ["Cash", "Cash", "Inactive", 5],
  ]);
});

test("adding an account later preserves existing accounts and their balances", () => {
  const ctx = setup();
  const created = ctx.addWallet("Settings", "BDT", null, null, "admin", [
    createAccount("Existing", "AT-CASH", 80),
  ]);
  const existing = accountsFor(ctx, created.walletId)[0];

  const added = ctx.addFinancialAccount({
    walletId: created.walletId,
    accountTypeId: "AT-BANK",
    name: "Added later",
    openingBalance: "20.25",
  }, "admin");

  assert.equal(added.status, "SUCCESS", added.message);
  const accounts = accountsFor(ctx, created.walletId);
  assert.equal(accounts.length, 2);
  assert.deepEqual(
    [accounts[0].AccountID, accounts[0].Name, accounts[0].OpeningBalance, accounts[0].Status],
    [existing.AccountID, "Existing", 80, "Active"],
  );
  assert.equal(ctx.getAccountBalance_(created.walletId, existing.AccountID), 80);
  assert.equal(ctx.getAccountBalance_(created.walletId, added.accountId), 20.25);
});

test("account names are unique within a wallet after trim and case normalization only", () => {
  const ctx = setup();
  const first = ctx.addWallet("Name one", "BDT", null, null, "admin", [
    createAccount("Pocket", "AT-CASH", 0),
  ]);
  const second = ctx.addWallet("Name two", "BDT", null, null, "admin", [
    createAccount("Pocket", "AT-CASH", 0),
  ]);

  assert.equal(first.status, "SUCCESS");
  assert.equal(second.status, "SUCCESS");
  const duplicate = ctx.addFinancialAccount({
    walletId: first.walletId,
    accountTypeId: "AT-BANK",
    name: "  pOcKeT  ",
    openingBalance: 0,
  }, "admin");
  assert.equal(duplicate.code, "ACCOUNT_EXISTS");
  assert.equal(accountsFor(ctx, first.walletId).length, 1);
  assert.equal(accountsFor(ctx, second.walletId).length, 1);
});

test("legacy addWallet callers still receive the Cash and Bank fallback", () => {
  const ctx = setup();
  const result = ctx.addWallet("Legacy caller", "BDT", 12.5, 7, "admin");

  assert.equal(result.status, "SUCCESS", result.message);
  const accounts = accountsFor(ctx, result.walletId);
  assert.deepEqual(accounts.map((account) => [account.AccountID, account.OpeningBalance]), [
    ["Cash", 12.5],
    ["Bank", 7],
  ]);
});
