"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadBackend } = require("./load-backend");
const { createSheet } = require("./stubs");

function createLedgerContext(overrides) {
  const context = loadBackend();
  const actualGetAccountBalance = context.getAccountBalance_;
  const sheetMap = new Map();
  const walletTransactions = createSheet("Wallet_Main", [context.TRANSACTION_HEADERS]);
  const wallet = {
    WalletID: "W001",
    WalletName: "Main Wallet",
    Currency: "BDT",
    Status: "Active",
    SheetName: "Wallet_Main",
  };
  const accounts = [
    { AccountID: "A_CASH", WalletID: "W001", Name: "Cash", Status: "Active" },
    { AccountID: "A_BANK", WalletID: "W001", Name: "Bank", Status: "Active" },
  ];

  context.setupDatabase = () => {};
  context.getOrCreateSheet_ = (name, headers) => {
    if (!sheetMap.has(name)) sheetMap.set(name, createSheet(name, [headers]));
    return sheetMap.get(name);
  };
  context.getWalletById_ = (id) => (String(id) === wallet.WalletID ? wallet : null);
  context.authorize_ = () => null;
  context.financialAccountsForWallet_ = (_walletId, options) =>
    accounts.filter((account) => options?.includeInactive || account.Status === "Active");
  context.resolveWalletSheet_ = (id) =>
    String(id) === wallet.WalletID ? { wallet, sheet: walletTransactions } : null;
  context.getAccountBalance_ = () => 1000;
  context.logAudit = () => {};
  context.cacheRemove_ = () => {};
  context.nowStr = () => "2025-04-15 12:00:00";
  context.__test = { sheetMap, walletTransactions, wallet, accounts, actualGetAccountBalance };
  Object.assign(context, overrides || {});
  return context;
}

test("shop ledger computes outstanding and monthly balances and replays idempotent operations", () => {
  const context = createLedgerContext();
  const created = context.createShopLedger({
    name: "Rafiq Store",
    address: "Dhaka",
    mobile: "",
    walletId: "W001",
    openingBalance: "20.00",
    requestId: "shop-create-1",
  }, "admin");
  assert.equal(created.status, "SUCCESS");

  const createReplay = context.createShopLedger({
    name: "Rafiq Store",
    address: "Dhaka",
    mobile: "",
    walletId: "W001",
    openingBalance: "20.00",
    requestId: "shop-create-1",
  }, "admin");
  assert.deepEqual(JSON.parse(JSON.stringify(createReplay)), JSON.parse(JSON.stringify(created)));

  const market = context.addShopMarket(created.shopId, {
    date: "2025-04-10",
    products: [{ name: "Rice", quantity: "2", unit: "kg", total: "10.00" }],
    payment: {
      date: "2025-04-10",
      allocations: [{ accountId: "A_CASH", amount: "5.00" }],
      requestId: "payment-child-1",
    },
    requestId: "market-create-1",
  }, "admin");
  assert.equal(market.status, "SUCCESS");

  const marketReplay = context.addShopMarket(created.shopId, {
    date: "2025-04-10",
    products: [{ name: "Rice", quantity: "2", unit: "kg", total: "10.00" }],
    payment: {
      date: "2025-04-10",
      allocations: [{ accountId: "A_CASH", amount: "5.00" }],
      requestId: "payment-child-1",
    },
    requestId: "market-create-1",
  }, "admin");
  assert.deepEqual(JSON.parse(JSON.stringify(marketReplay)), JSON.parse(JSON.stringify(market)));

  context.getUserRecord_ = (username) => username === "admin" ? { FullName: "Admin User" } : null;
  const list = context.getShopLedgers("admin");
  assert.equal(list.status, "SUCCESS");
  assert.equal(list.shops.length, 1);
  assert.equal(list.shops[0].CreatedBy, "admin");
  assert.equal(list.shops[0].CreatedByName, "Admin User");
  assert.equal(list.shops[0].OutstandingBalance, 25);
  assert.equal(list.shops[0].TotalMarketPurchases, 10);
  assert.equal(list.shops[0].TotalPayments, 5);
  assert.deepEqual(JSON.parse(JSON.stringify(list.shops[0].MostRecentPayment.Allocations)), [
    { AccountID: "A_CASH", AccountName: "Cash", Amount: 5 },
  ]);

  const report = context.getShopLedgerReport(created.shopId, "2025-04", "admin");
  assert.equal(report.status, "SUCCESS");
  assert.equal(report.report.BeginningOutstanding, 20);
  assert.equal(report.report.TotalMarketPurchases, 10);
  assert.equal(report.report.TotalPayments, 5);
  assert.equal(report.report.EndingOutstanding, 25);
  assert.deepEqual(JSON.parse(JSON.stringify(report.report.Markets[0].Products)), [
    { Name: "Rice", Quantity: "2", Unit: "kg", Total: 10 },
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(report.report.Payments[0].Allocations)), [
    { AccountID: "A_CASH", AccountName: "Cash", Amount: 5 },
  ]);

  const effects = context.__test.walletTransactions._rows().slice(1);
  assert.equal(effects.length, 1);
  assert.equal(effects[0][2], "Shop Credit Payment");
  assert.equal(effects[0][4], "A_CASH");
});

test("shop report includes records whose date cells are spreadsheet Date objects", () => {
  const context = createLedgerContext();
  const shop = context.createShopLedger({
    name: "October Shop",
    address: "Dhaka",
    walletId: "W001",
    openingBalance: "20.00",
    requestId: "date-cell-shop",
  }, "admin");
  const market = context.addShopMarket(shop.shopId, {
    date: "2025-10-05",
    products: [{ name: "Rice", quantity: "1", unit: "kg", total: "10.00" }],
    payment: {
      date: "2025-10-06",
      allocations: [{ accountId: "A_CASH", amount: "5.00" }],
      requestId: "date-cell-payment",
    },
    requestId: "date-cell-market",
  }, "admin");
  assert.equal(market.status, "SUCCESS");

  const marketRows = context.__test.sheetMap.get("ShopMarkets")._rows();
  const paymentRows = context.__test.sheetMap.get("ShopPayments")._rows();
  marketRows[1][context.SHOP_MARKET_HEADERS.indexOf("Date")] = new Date(2025, 9, 5);
  paymentRows[1][context.SHOP_PAYMENT_HEADERS.indexOf("Date")] = new Date(2025, 9, 6);

  const report = context.getShopLedgerReport(shop.shopId, "2025-10", "admin");
  assert.equal(report.status, "SUCCESS");
  assert.equal(report.report.BeginningOutstanding, 20);
  assert.equal(report.report.TotalMarketPurchases, 10);
  assert.equal(report.report.TotalPayments, 5);
  assert.equal(report.report.EndingOutstanding, 25);
  assert.equal(report.report.Markets.length, 1);
  assert.equal(report.report.Markets[0].Date, "2025-10-05");
  assert.equal(report.report.Payments.length, 1);
  assert.equal(report.report.Payments[0].Date, "2025-10-06");
});

test("shop payment deletion soft-deletes the entry and reverses its account effect", () => {
  const context = createLedgerContext();
  const shop = context.createShopLedger({
    name: "Corner Shop",
    address: "Dhaka",
    walletId: "W001",
    openingBalance: "0",
    requestId: "shop-create-2",
  }, "admin");
  context.addShopMarket(shop.shopId, {
    date: "2025-04-01",
    products: [{ name: "Oil", quantity: "1", unit: "ltr", total: "30" }],
    requestId: "market-create-2",
  }, "admin");
  const payment = context.addShopPayment(shop.shopId, {
    date: "2025-04-02",
    allocations: [{ accountId: "A_BANK", amount: "10" }],
    requestId: "payment-create-2",
  }, "admin");
  assert.equal(payment.status, "SUCCESS");

  const deleted = context.deleteShopPayment(payment.paymentId, { requestId: "payment-delete-2" }, "admin");
  assert.equal(deleted.status, "SUCCESS");
  assert.equal(context.getShopLedgers("admin").shops[0].OutstandingBalance, 30);

  const rows = context.__test.walletTransactions._rows().slice(1);
  assert.deepEqual(rows.map((row) => row[2]), [
    "Shop Credit Payment",
    "Shop Credit Payment Reversal",
  ]);
  const detail = context.getShopLedgerDetails(shop.shopId, "admin");
  assert.equal(detail.payments.length, 0);
});

test("market and payment edits preserve balances, reversible effects, and status lifecycle", () => {
  const context = createLedgerContext();
  const shop = context.createShopLedger({
    name: "Lifecycle Shop",
    address: "Dhaka",
    walletId: "W001",
    openingBalance: "10",
    requestId: "lifecycle-shop-create",
  }, "admin");
  const market = context.addShopMarket(shop.shopId, {
    date: "2025-04-03",
    products: [{ name: "Sugar", quantity: "1", unit: "kg", total: "20" }],
    requestId: "lifecycle-market-create",
  }, "admin");
  context.updateShopMarket(market.marketId, {
    date: "2025-04-03",
    products: [{ name: "Sugar", quantity: "1", unit: "kg", total: "25" }],
    requestId: "lifecycle-market-update",
  }, "admin");
  assert.equal(context.getShopLedgers("admin").shops[0].OutstandingBalance, 35);

  const payment = context.addShopPayment(shop.shopId, {
    date: "2025-04-04",
    allocations: [{ accountId: "A_CASH", amount: "5" }],
    requestId: "lifecycle-payment-create",
  }, "admin");
  context.updateShopPayment(payment.paymentId, {
    date: "2025-04-04",
    allocations: [{ accountId: "A_BANK", amount: "7" }],
    requestId: "lifecycle-payment-update",
  }, "admin");
  assert.equal(context.getShopLedgers("admin").shops[0].OutstandingBalance, 28);

  const deleted = context.deleteShopPayment(payment.paymentId, { requestId: "lifecycle-payment-delete" }, "admin");
  assert.equal(deleted.status, "SUCCESS");
  const deletionReplay = context.deleteShopPayment(payment.paymentId, { requestId: "lifecycle-payment-delete" }, "admin");
  assert.deepEqual(JSON.parse(JSON.stringify(deletionReplay)), JSON.parse(JSON.stringify(deleted)));
  assert.equal(context.getShopLedgers("admin").shops[0].OutstandingBalance, 35);
  assert.deepEqual(
    context.__test.walletTransactions._rows().slice(1).map((row) => row[2]),
    ["Shop Credit Payment", "Shop Credit Payment Reversal", "Shop Credit Payment", "Shop Credit Payment Reversal"],
  );

  const closed = context.setShopLedgerStatus(shop.shopId, { status: "Inactive", requestId: "lifecycle-close" }, "admin");
  assert.equal(closed.status, "SUCCESS");
  const blocked = context.addShopMarket(shop.shopId, {
    date: "2025-04-05",
    products: [{ name: "Tea", quantity: "1", unit: "kg", total: "4" }],
    requestId: "lifecycle-closed-market",
  }, "admin");
  assert.equal(blocked.code, "SHOP_INACTIVE");
  const reopened = context.setShopLedgerStatus(shop.shopId, { status: "Active", requestId: "lifecycle-reopen" }, "admin");
  assert.equal(reopened.status, "SUCCESS");
});

test("permission failures prevent shop market writes", () => {
  const context = createLedgerContext({
    authorize_: (_username, permission) =>
      permission === "ADD_MARKET_RECORD"
        ? { status: "ERROR", code: "PERMISSION_DENIED", message: "Denied" }
        : null,
  });
  const shop = context.createShopLedger({
    name: "Permission Shop",
    address: "Dhaka",
    walletId: "W001",
    openingBalance: "0",
    requestId: "shop-create-3",
  }, "admin");

  const response = context.addShopMarket(shop.shopId, {
    date: "2025-04-01",
    products: [{ name: "Tea", quantity: "1", unit: "kg", total: "5" }],
    requestId: "market-denied-3",
  }, "limited-user");
  assert.equal(response.code, "PERMISSION_DENIED");
  assert.equal(context.getShopLedgers("admin").shops[0].TotalMarketPurchases, 0);
});

test("partial sheet-write failures are surfaced and flagged for reconciliation", () => {
  const context = createLedgerContext();
  context.shopLedgerHistory_ = () => { throw new Error("audit sheet unavailable"); };

  const result = context.createShopLedger({
    name: "Interrupted Shop",
    address: "Dhaka",
    walletId: "W001",
    openingBalance: "2",
    requestId: "shop-partial-4",
  }, "admin");
  assert.equal(result.code, "RECONCILIATION_REQUIRED");
  const listed = context.getShopLedgers("admin");
  assert.equal(listed.reconciliationRequired.length, 1);
  assert.equal(listed.reconciliationRequired[0].RequestID, "shop-partial-4");
});

test("reconciliation flags remain visible when a partial create left no shop row", () => {
  const context = createLedgerContext();
  const getSheet = context.getOrCreateSheet_;
  context.getOrCreateSheet_ = (name, headers) => {
    const sheet = getSheet(name, headers);
    if (name === "ShopLedgers") sheet.appendRow = () => { throw new Error("shop sheet unavailable"); };
    return sheet;
  };
  const result = context.createShopLedger({
    name: "No Row Shop",
    address: "Dhaka",
    walletId: "W001",
    openingBalance: "1",
    requestId: "shop-no-row",
  }, "admin");
  assert.equal(result.code, "RECONCILIATION_REQUIRED");
  const listed = context.getShopLedgers("admin");
  assert.equal(listed.shops.length, 0);
  assert.equal(listed.reconciliationRequired[0].RequestID, "shop-no-row");
});

test("shop ledger backups validate and restore linked rows, audit history, and operation keys", () => {
  const source = createLedgerContext();
  const shop = source.createShopLedger({
    name: "Backup Shop",
    address: "Dhaka",
    walletId: "W001",
    openingBalance: "4",
    requestId: "backup-shop-create",
  }, "admin");
  source.addShopMarket(shop.shopId, {
    date: "2025-04-04",
    products: [{ name: "Flour", quantity: "1", unit: "kg", total: "6" }],
    requestId: "backup-market-create",
  }, "admin");
  const payment = source.addShopPayment(shop.shopId, {
    date: "2025-04-05",
    allocations: [{ accountId: "A_CASH", amount: "2" }],
    requestId: "backup-payment-create",
  }, "admin");
  source.deleteShopPayment(payment.paymentId, { requestId: "backup-payment-delete" }, "admin");

  const rawRows = (name) => source.__test.sheetMap.get(name)._rows().slice(1);
  const transactions = source.__test.walletTransactions._rows().slice(1).map((row) => {
    const transaction = {};
    source.TRANSACTION_HEADERS.forEach((header, index) => { transaction[header] = row[index]; });
    transaction.WalletID = "W001";
    return transaction;
  });
  const backup = {
    transactions,
    shopLedgerWalletIds: ["W001"],
    shopLedgers: rawRows("ShopLedgers").map((row) => ({ shopId: row[0], walletId: row[4], row })),
    shopMarkets: rawRows("ShopMarkets").map((row) => ({ shopId: row[1], row })),
    shopPayments: rawRows("ShopPayments").map((row) => ({ shopId: row[1], row })),
    shopLedgerHistory: rawRows("ShopLedgerHistory").map((row) => ({ shopId: row[1], row })),
    shopLedgerOperations: rawRows("ShopLedgerOperations").map((row) => ({ walletId: row[3], row })),
  };
  source.hasWalletAccess_ = () => true;
  source.accountKnownInWallet_ = () => true;
  const validation = source.validateShopLedgerBackup_(backup, "admin", {});
  assert.equal(validation.skip, false);
  assert.equal(validation.shops.length, 1);
  assert.equal(validation.payments.length, 1);
  assert.equal(validation.paymentWallets[payment.paymentId], "W001");
  const incompleteBackup = JSON.parse(JSON.stringify(backup));
  incompleteBackup.transactions.pop();
  const rejected = source.validateShopLedgerBackup_(incompleteBackup, "admin", {});
  assert.match(rejected.error, /effects do not match payment/);

  const target = createLedgerContext();
  target.restoreShopLedgerBackup_(validation);
  const restored = target.getShopLedgerDetails(shop.shopId, "admin");
  assert.equal(restored.shop.Name, "Backup Shop");
  assert.equal(restored.markets.length, 1);
  assert.equal(restored.payments.length, 0);
  assert.equal(target.__test.sheetMap.get("ShopLedgerHistory").getLastRow(), backup.shopLedgerHistory.length + 1);
  assert.equal(target.__test.sheetMap.get("ShopLedgerOperations").getLastRow(), backup.shopLedgerOperations.length + 1);
});

test("shop payment effects update account balances and account movement reports, not income or expense", () => {
  const context = createLedgerContext();
  context.openingBalanceCentsFor_ = () => 10000;
  context.readWalletTransactions_ = () => [
    { ID: "payment", Date: "2025-04-04", Type: "Shop Credit Payment", Account: "A_CASH", Amount: "15.00" },
    { ID: "reversal", Date: "2025-04-05", Type: "Shop Credit Payment Reversal", Account: "A_CASH", Amount: "3.00" },
  ];
  assert.equal(context.__test.actualGetAccountBalance("W001", "A_CASH"), 88);

  context.authorize_ = () => null;
  context.financialAccountsForWallet_ = () => [
    { AccountID: "A_CASH", WalletID: "W001", Name: "Cash", Status: "Active" },
  ];
  const report = context.getReport("admin", "W001", "monthly", "2025-04");
  assert.equal(report.status, "SUCCESS");
  assert.equal(report.totalIncome, 0);
  assert.equal(report.totalExpense, 0);
  assert.equal(report.netChange, 0);
  assert.equal(report.accountBreakdown.A_CASH, -12);
});
