"use strict";

// Phase 2 coverage: the money-entry flows (income/expense, wallet-to-wallet
// transfer, and the "Bank Operation" account-to-account move) now validate the
// account AGAINST THE WALLET instead of the global Cash/Bank pair, and a Bank
// Operation can move money between any two accounts of one wallet.

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

function walletSheet(ctx, id) {
  const resolved = ctx.resolveWalletSheet_(id);
  return resolved.sheet;
}

test("transaction text is stored as literal text when it starts with spreadsheet syntax", () => {
  const ctx = setup();
  const res = ctx.addTransaction({
    user: "admin", type: "Income", walletId: "W001", account: "Cash",
    amount: 25, date: "2026-01-05",
    sourceCategory: "=IMPORTXML(\"https://example.invalid\", \"//x\")",
    whereVendor: "\t=1+1",
    description: "+SUM(1,2)",
    note: "-not a formula",
  });

  assert.equal(res.status, "SUCCESS", res.message);
  const row = walletSheet(ctx, "W001")._rows().at(-1);
  assert.equal(row[5], "'=IMPORTXML(\"https://example.invalid\", \"//x\")");
  assert.equal(row[6], "'\t=1+1");
  assert.equal(row[7], "'+SUM(1,2)");
  assert.equal(row[9], "'-not a formula");
});

test("income/expense validate the account against the wallet", () => {
  const ctx = setup();

  const custom = ctx.addFinancialAccount(
    { walletId: "W001", accountTypeId: "AT-CASH", name: "Mobile Wallet", openingBalance: 300 },
    "admin",
  );
  assert.equal(custom.status, "SUCCESS", custom.message);

  const ok = ctx.addTransaction({
    user: "admin", type: "Expense", walletId: "W001", account: custom.accountId,
    amount: 100, date: "2026-01-05", description: "Spend",
  });
  assert.equal(ok.status, "SUCCESS", ok.message);
  assert.equal(ctx.getAccountBalance_("W001", custom.accountId), 200);

  const unknown = ctx.addTransaction({
    user: "admin", type: "Income", walletId: "W001", account: "Nope",
    amount: 100, date: "2026-01-05",
  });
  assert.equal(unknown.status, "ERROR");
  assert.equal(unknown.code, "ACCOUNT_NOT_FOUND");

  // An account that belongs to ANOTHER wallet must not be postable here.
  const other = ctx.addFinancialAccount(
    { walletId: "W002", accountTypeId: "AT-CASH", name: "Other Cash" },
    "admin",
  );
  assert.equal(other.status, "SUCCESS", other.message);
  const crossWallet = ctx.addTransaction({
    user: "admin", type: "Income", walletId: "W001", account: other.accountId,
    amount: 100, date: "2026-01-05",
  });
  assert.equal(crossWallet.code, "ACCOUNT_NOT_FOUND");
});

test("a deactivated account cannot receive new transactions", () => {
  const ctx = setup();
  // Retire Bank (Cash stays active, so the last-account guard does not fire).
  const retired = ctx.updateFinancialAccount("Bank", { walletId: "W001", status: "Inactive" }, "admin");
  assert.equal(retired.status, "SUCCESS", retired.message);

  const res = ctx.addTransaction({
    user: "admin", type: "Expense", walletId: "W001", account: "Bank",
    amount: 100, date: "2026-01-05",
  });
  assert.equal(res.status, "ERROR");
  assert.equal(res.code, "ACCOUNT_INACTIVE");

  // Cash is still fine.
  const cash = ctx.addTransaction({
    user: "admin", type: "Expense", walletId: "W001", account: "Cash",
    amount: 100, date: "2026-01-05",
  });
  assert.equal(cash.status, "SUCCESS", cash.message);
});

test("Bank Operation moves money between any two accounts of one wallet", () => {
  const ctx = setup();
  const custom = ctx.addFinancialAccount(
    { walletId: "W001", accountTypeId: "AT-BANK", name: "IBBL", openingBalance: 0 },
    "admin",
  );
  const acc = custom.accountId;

  const before = {
    bank: ctx.getAccountBalance_("W001", "Bank"),
    custom: ctx.getAccountBalance_("W001", acc),
  };

  const res = ctx.addTransaction({
    user: "admin", type: "Bank Operation", walletId: "W001",
    fromAccount: "Bank", toAccount: acc, amount: 250, date: "2026-01-05",
  });
  assert.equal(res.status, "SUCCESS", res.message);
  assert.equal(res.transactions.length, 2);
  assert.equal(res.transactions[0].Type, "Transfer Out");
  assert.equal(res.transactions[0].Account, "Bank");
  assert.equal(res.transactions[1].Type, "Transfer In");
  assert.equal(res.transactions[1].Account, acc);

  assert.equal(ctx.getAccountBalance_("W001", "Bank"), before.bank - 250);
  assert.equal(ctx.getAccountBalance_("W001", acc), before.custom + 250);
});

test("Bank Operation rejects the same account on both sides", () => {
  const ctx = setup();
  const same = ctx.addTransaction({
    user: "admin", type: "Bank Operation", walletId: "W001",
    fromAccount: "Cash", toAccount: "Cash", amount: 50, date: "2026-01-05",
  });
  assert.equal(same.status, "ERROR");
  assert.equal(same.code, "SAME_ACCOUNT");

  const bad = ctx.addTransaction({
    user: "admin", type: "Bank Operation", walletId: "W001",
    fromAccount: "Cash", toAccount: "Ghost", amount: 50, date: "2026-01-05",
  });
  assert.equal(bad.code, "ACCOUNT_NOT_FOUND");
});

test("the legacy Bank Withdraw / Bank Deposit shorthand still works", () => {
  const ctx = setup();

  const withdraw = ctx.addTransaction({
    user: "admin", type: "Bank Withdraw", walletId: "W001",
    amount: 400, date: "2026-01-05",
  });
  assert.equal(withdraw.status, "SUCCESS", withdraw.message);
  // Bank Withdraw = Bank -> Cash.
  assert.equal(withdraw.transactions[0].Account, "Bank");
  assert.equal(withdraw.transactions[1].Account, "Cash");
  assert.equal(ctx.getAccountBalance_("W001", "Bank"), 4600);
  assert.equal(ctx.getAccountBalance_("W001", "Cash"), 1400);
});

test("a retried Bank Operation is idempotent", () => {
  const ctx = setup();
  const payload = {
    user: "admin", type: "Bank Operation", walletId: "W001",
    fromAccount: "Bank", toAccount: "Cash", amount: 300, date: "2026-01-05",
    clientId: "op-once",
  };
  const first = ctx.addTransaction(payload);
  assert.equal(first.status, "SUCCESS", first.message);

  const sheet = walletSheet(ctx, "W001");
  const rowsAfterFirst = sheet.getLastRow();

  const second = ctx.addTransaction(payload);
  assert.equal(second.status, "SUCCESS", second.message);
  assert.equal(sheet.getLastRow(), rowsAfterFirst, "retry must not write a second pair");
  assert.equal(ctx.getAccountBalance_("W001", "Bank"), 4700);

  const conflict = ctx.addTransaction(Object.assign({}, payload, { amount: 999 }));
  assert.equal(conflict.status, "ERROR");
  assert.equal(conflict.code, "DUPLICATE_REQUEST");
});

test("wallet-to-wallet transfer validates both wallet-scoped accounts", () => {
  const ctx = setup();
  const w2account = ctx.addFinancialAccount(
    { walletId: "W002", accountTypeId: "AT-CASH", name: "W2 Cash" },
    "admin",
  );
  assert.equal(w2account.status, "SUCCESS", w2account.message);

  const ok = ctx.addTransaction({
    user: "admin", type: "Transfer", fromWalletId: "W001", toWalletId: "W002",
    fromAccount: "Bank", toAccount: w2account.accountId,
    fromAmount: 500, date: "2026-01-05",
  });
  assert.equal(ok.status, "SUCCESS", ok.message);
  assert.equal(ctx.getAccountBalance_("W001", "Bank"), 4500);
  assert.equal(ctx.getAccountBalance_("W002", w2account.accountId), 500);

  // A source account that does not exist in the SOURCE wallet is refused.
  const bad = ctx.addTransaction({
    user: "admin", type: "Transfer", fromWalletId: "W001", toWalletId: "W002",
    fromAccount: w2account.accountId, toAccount: w2account.accountId,
    fromAmount: 10, date: "2026-01-05",
  });
  assert.equal(bad.status, "ERROR");
  assert.equal(bad.code, "ACCOUNT_NOT_FOUND");
});
