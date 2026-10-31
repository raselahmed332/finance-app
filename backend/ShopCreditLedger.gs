// ---------------- SHOP CREDIT LEDGER ----------------

var SHOP_LEDGER_HEADERS = [
  "ShopID", "Name", "Address", "Mobile", "WalletID", "Status",
  "OpeningBalance", "CreatedBy", "CreatedAt", "UpdatedAt", "RequestID",
];
var SHOP_MARKET_HEADERS = [
  "MarketID", "ShopID", "Date", "Products", "Total", "Status",
  "CreatedBy", "CreatedAt", "UpdatedAt", "RequestID",
];
var SHOP_PAYMENT_HEADERS = [
  "PaymentID", "ShopID", "Date", "Allocations", "Total", "Status",
  "CreatedBy", "CreatedAt", "UpdatedAt", "RequestID",
];
var SHOP_LEDGER_HISTORY_HEADERS = [
  "HistoryID", "ShopID", "RecordType", "RecordID", "Action",
  "BeforeData", "AfterData", "Actor", "Timestamp", "RequestID",
];
var SHOP_LEDGER_OPERATION_HEADERS = [
  "RequestID", "Action", "Payload", "WalletID", "Status", "Result",
  "StartedAt", "UpdatedAt", "Error",
];

var SHOP_LEDGER_ACTIVE = "Active";
var SHOP_LEDGER_INACTIVE = "Inactive";
var SHOP_LEDGER_PAYMENT_TYPE = "Shop Credit Payment";
var SHOP_LEDGER_PAYMENT_REVERSAL_TYPE = "Shop Credit Payment Reversal";

function shopLedgerSheets_() {
  setupDatabase();
  return {
    shops: getOrCreateSheet_("ShopLedgers", SHOP_LEDGER_HEADERS),
    markets: getOrCreateSheet_("ShopMarkets", SHOP_MARKET_HEADERS),
    payments: getOrCreateSheet_("ShopPayments", SHOP_PAYMENT_HEADERS),
    history: getOrCreateSheet_("ShopLedgerHistory", SHOP_LEDGER_HISTORY_HEADERS),
    operations: getOrCreateSheet_("ShopLedgerOperations", SHOP_LEDGER_OPERATION_HEADERS),
  };
}

function shopLedgerRows_(sheet, headers) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  return values.map(function (row, index) {
    var record = {};
    headers.forEach(function (header, column) {
      record[header] = header === "Date" ? normDateStr_(row[column]) : row[column];
    });
    record._row = index + 2;
    return record;
  }).filter(function (record) { return !!record[headers[0]]; });
}

function shopLedgerFind_(sheet, headers, key, value) {
  var rows = shopLedgerRows_(sheet, headers);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][key]) === String(value)) return rows[i];
  }
  return null;
}

function shopLedgerRecordObject_(record) {
  var result = {};
  Object.keys(record || {}).forEach(function (key) {
    if (key.charAt(0) !== "_") result[key] = record[key];
  });
  return result;
}

function shopLedgerParseJson_(value, fallback, label) {
  if (!value) return fallback;
  try {
    return JSON.parse(String(value));
  } catch (error) {
    throw new Error("Shop ledger data is malformed (" + label + ").");
  }
}

function shopLedgerId_(prefix) {
  return prefix + "_" + String(Utilities.getUuid()).replace(/[^A-Za-z0-9_-]/g, "");
}

function shopLedgerText_(value, maxLength, required, label) {
  if (typeof value !== "string") return { error: label + " must be text." };
  var text = value.trim();
  if (required && !text) return { error: label + " is required." };
  if (text.length > maxLength) return { error: label + " is too long." };
  if (/[\u0000-\u001f\u007f]/.test(text)) return { error: label + " contains invalid characters." };
  return { value: spreadsheetSafeText_(text) };
}

function shopLedgerDate_(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return isValidTransactionDate_(value);
}

function shopLedgerAuthorize_(username, permission, shop) {
  if (!shop) return err_("দোকানের খাতা পাওয়া যায়নি।", "SHOP_NOT_FOUND");
  return authorize_(username, permission, [shop.WalletID]);
}

function shopLedgerWallet_(walletId, requireActive) {
  var wallet = getWalletById_(walletId);
  if (!wallet || (requireActive && wallet.Status !== "Active")) return null;
  return wallet;
}

function shopLedgerParseProducts_(products) {
  if (!Array.isArray(products) || !products.length || products.length > 100) {
    return { error: "একটি বাজারে ১ থেকে ১০০টি পণ্য থাকতে হবে।" };
  }
  var totalCents = 0;
  var normalized = [];
  for (var i = 0; i < products.length; i++) {
    var product = products[i];
    if (!product || typeof product !== "object" || Array.isArray(product)) {
      return { error: "পণ্যের তথ্য অবৈধ।" };
    }
    var name = shopLedgerText_(product.name, 100, true, "পণ্যের নাম");
    var unit = shopLedgerText_(product.unit, 20, true, "পণ্যের একক");
    var quantityText = typeof product.quantity === "number" ? String(product.quantity) : product.quantity;
    if (name.error || unit.error) return { error: name.error || unit.error };
    if (typeof quantityText !== "string" || !/^\d+(?:\.\d{1,3})?$/.test(quantityText.trim()) || Number(quantityText) <= 0) {
      return { error: "পণ্যের পরিমাণ শূন্যের বেশি এবং সর্বোচ্চ তিন দশমিক হতে হবে।" };
    }
    var amountCents = openingAmountCents_(product.total);
    if (isNaN(amountCents)) return { error: "পণ্যের মোট দাম শূন্য বা তার বেশি বৈধ পরিমাণ হতে হবে।" };
    totalCents += amountCents;
    normalized.push({
      Name: name.value,
      Quantity: quantityText.trim(),
      Unit: unit.value,
      Total: amountOf_(amountCents),
    });
  }
  if (totalCents <= 0 || totalCents > maxAmountCents_()) {
    return { error: "বাজারের মোট পরিমাণ শূন্যের বেশি এবং সর্বোচ্চ সীমার মধ্যে হতে হবে।" };
  }
  return { products: normalized, totalCents: totalCents, total: amountOf_(totalCents) };
}

function shopLedgerNormalizeAllocations_(walletId, allocations) {
  if (!Array.isArray(allocations) || !allocations.length || allocations.length > 100) {
    return { error: "পেমেন্টে ১ থেকে ১০০টি account allocation থাকতে হবে।" };
  }
  var activeAccounts = financialAccountsForWallet_(walletId, { includeInactive: false });
  var accountMap = {};
  activeAccounts.forEach(function (account) {
    accountMap[String(account.AccountID)] = account;
  });
  var seen = {};
  var result = [];
  var totalCents = 0;
  for (var i = 0; i < allocations.length; i++) {
    var allocation = allocations[i];
    if (!allocation || typeof allocation !== "object" || Array.isArray(allocation)) {
      return { error: "পেমেন্টের account allocation অবৈধ।" };
    }
    var accountId = String(allocation.accountId || allocation.AccountID || "").trim();
    var account = accountMap[accountId];
    if (!account) return { error: "পেমেন্টের জন্য Wallet-এর সক্রিয় account নির্বাচন করুন।" };
    if (seen[accountId]) return { error: "একটি পেমেন্টে একই account একাধিকবার ব্যবহার করা যাবে না।" };
    seen[accountId] = true;
    var cents = toCents_(allocation.amount !== undefined ? allocation.amount : allocation.Amount);
    if (isNaN(cents) || cents <= 0 || cents > maxAmountCents_()) {
      return { error: "প্রতিটি পেমেন্ট allocation শূন্যের বেশি বৈধ পরিমাণ হতে হবে।" };
    }
    totalCents += cents;
    result.push({ AccountID: accountId, Amount: amountOf_(cents) });
  }
  if (totalCents > maxAmountCents_()) return { error: "পেমেন্টের মোট পরিমাণ সর্বোচ্চ সীমা অতিক্রম করেছে।" };
  return { allocations: result, totalCents: totalCents, total: amountOf_(totalCents), accountMap: accountMap };
}

function shopLedgerCreatorName_(username) {
  if (!username) return "";
  try {
    var user = getUserRecord_(username);
    return (user && user.FullName) || String(username);
  } catch (e) {
    return String(username);
  }
}

function shopLedgerSummary_(shop, markets, payments, wallet) {
  var marketCents = 0;
  var paymentCents = 0;
  var activeMarkets = markets.filter(function (market) {
    return String(market.ShopID) === String(shop.ShopID) && market.Status === SHOP_LEDGER_ACTIVE;
  });
  var activePayments = payments.filter(function (payment) {
    return String(payment.ShopID) === String(shop.ShopID) && payment.Status === SHOP_LEDGER_ACTIVE;
  });
  activeMarkets.forEach(function (market) { marketCents += centsOf_(market.Total); });
  activePayments.forEach(function (payment) { paymentCents += centsOf_(payment.Total); });
  var openingCents = centsOf_(shop.OpeningBalance);
  var recentMarkets = activeMarkets.slice().sort(shopLedgerNewestFirst_);
  var recentPayments = activePayments.slice().sort(shopLedgerNewestFirst_);
  return {
    ShopID: shop.ShopID,
    Name: shop.Name,
    Address: shop.Address,
    Mobile: shop.Mobile,
    WalletID: shop.WalletID,
    WalletName: wallet ? wallet.WalletName : "",
    Currency: wallet ? wallet.Currency : "",
    Status: shop.Status,
    CreatedBy: shop.CreatedBy,
    CreatedByName: shopLedgerCreatorName_(shop.CreatedBy),
    CreatedAt: shop.CreatedAt,
    OpeningBalance: amountOf_(openingCents),
    TotalMarketPurchases: amountOf_(marketCents),
    TotalPayments: amountOf_(paymentCents),
    OutstandingBalance: amountOf_(openingCents + marketCents - paymentCents),
    MostRecentMarket: recentMarkets.length ? {
      MarketID: recentMarkets[0].MarketID,
      Date: recentMarkets[0].Date,
      Total: amountOf_(centsOf_(recentMarkets[0].Total)),
    } : null,
    MostRecentPayment: recentPayments.length ? {
      PaymentID: recentPayments[0].PaymentID,
      Date: recentPayments[0].Date,
      Total: amountOf_(centsOf_(recentPayments[0].Total)),
      Allocations: shopLedgerPaymentAccounts_(
        shop.WalletID,
        shopLedgerParseJson_(recentPayments[0].Allocations, [], "payment allocations"),
      ),
    } : null,
  };
}

function shopLedgerNewestFirst_(a, b) {
  return String(b.Date).localeCompare(String(a.Date)) ||
    String(b.CreatedAt).localeCompare(String(a.CreatedAt)) ||
    String(b.MarketID || b.PaymentID || "").localeCompare(String(a.MarketID || a.PaymentID || ""));
}

function shopLedgerGet_(shopId, sheets) {
  return shopLedgerFind_(sheets.shops, SHOP_LEDGER_HEADERS, "ShopID", shopId);
}

function shopLedgerHistory_(sheets, shopId, recordType, recordId, action, beforeData, afterData, actor, requestId) {
  sheets.history.appendRow([
    shopLedgerId_("SLH"), shopId, recordType, recordId, action,
    beforeData ? JSON.stringify(beforeData) : "",
    afterData ? JSON.stringify(afterData) : "",
    actor, nowStr(), requestId || "",
  ]);
}

function shopLedgerBeginOperation_(sheets, requestId, action, payload) {
  var id = String(requestId || "").trim();
  if (!id || id.length > 200 || /[\u0000-\u001f\u007f]/.test(id)) {
    return { error: err_("একটি বৈধ requestId আবশ্যক।", "INVALID_REQUEST_ID") };
  }
  var existing = shopLedgerFind_(sheets.operations, SHOP_LEDGER_OPERATION_HEADERS, "RequestID", id);
  var serialized = JSON.stringify(payload);
  if (existing) {
    if (existing.Action !== action || existing.Payload !== serialized) {
      return { error: err_("এই requestId আগে অন্য তথ্যের জন্য ব্যবহৃত হয়েছে। নতুন requestId দিয়ে চেষ্টা করুন।", "IDEMPOTENCY_CONFLICT") };
    }
    if (existing.Status === "COMPLETE") {
      return { replay: shopLedgerParseJson_(existing.Result, null, "operation result") };
    }
    return { error: err_("এই অনুরোধের আগের প্রচেষ্টা অসম্পূর্ণ। Admin-কে reconciliation status পরীক্ষা করতে বলুন; পুনরায় জমা দেবেন না।", "RECONCILIATION_REQUIRED") };
  }
  var timestamp = nowStr();
  var shopId = payload && payload.shopId;
  if (!shopId && payload && payload.marketId) {
    var linkedMarket = shopLedgerFind_(sheets.markets, SHOP_MARKET_HEADERS, "MarketID", payload.marketId);
    shopId = linkedMarket && linkedMarket.ShopID;
  }
  if (!shopId && payload && payload.paymentId) {
    var linkedPayment = shopLedgerFind_(sheets.payments, SHOP_PAYMENT_HEADERS, "PaymentID", payload.paymentId);
    shopId = linkedPayment && linkedPayment.ShopID;
  }
  var linkedShop = shopId ? shopLedgerGet_(shopId, sheets) : null;
  var walletId = payload && payload.walletId ? payload.walletId : (linkedShop ? linkedShop.WalletID : "");
  sheets.operations.appendRow([id, action, serialized, walletId, "PROCESSING", "", timestamp, timestamp, ""]);
  return { row: sheets.operations.getLastRow(), requestId: id, startedAt: timestamp };
}

function shopLedgerReplayOperation_(sheets, requestId, action, payload) {
  var id = String(requestId || "").trim();
  if (!id) return { handled: false };
  var existing = shopLedgerFind_(sheets.operations, SHOP_LEDGER_OPERATION_HEADERS, "RequestID", id);
  if (!existing) return { handled: false };
  if (existing.Action !== action || existing.Payload !== JSON.stringify(payload)) {
    return {
      handled: true,
      result: err_("এই requestId আগে অন্য তথ্যের জন্য ব্যবহৃত হয়েছে। নতুন requestId দিয়ে চেষ্টা করুন।", "IDEMPOTENCY_CONFLICT"),
    };
  }
  if (existing.Status === "COMPLETE") {
    return { handled: true, result: shopLedgerParseJson_(existing.Result, null, "operation result") };
  }
  return {
    handled: true,
    result: err_("এই অনুরোধের আগের প্রচেষ্টা অসম্পূর্ণ। Admin-কে reconciliation status পরীক্ষা করতে বলুন; পুনরায় জমা দেবেন না।", "RECONCILIATION_REQUIRED"),
  };
}

function shopLedgerFinishOperation_(sheets, operation, result) {
  sheets.operations.getRange(operation.row, 5, 1, 5).setValues([[
    "COMPLETE", JSON.stringify(result), operation.startedAt, nowStr(), "",
  ]]);
}

function shopLedgerFailOperation_(sheets, operation, error) {
  var message = String(error && error.message ? error.message : error || "Unknown error");
  sheets.operations.getRange(operation.row, 5, 1, 5).setValues([[
    "RECONCILIATION_REQUIRED", "", operation.startedAt, nowStr(), message.slice(0, 1000),
  ]]);
  console.error("Shop ledger operation requires reconciliation [" + operation.requestId + "]: " + message);
}

function shopLedgerRunOperation_(sheets, requestId, action, payload, work) {
  var started = shopLedgerBeginOperation_(sheets, requestId, action, payload);
  if (started.error) return started.error;
  if (Object.prototype.hasOwnProperty.call(started, "replay")) return started.replay;
  try {
    var result = work();
    if (!result || result.status !== "SUCCESS") {
      var failedMessage = result && result.message ? result.message : "The operation did not complete.";
      shopLedgerFailOperation_(sheets, started, failedMessage);
      return err_("পরিবর্তনটি সম্পূর্ণ হয়েছে কিনা নিশ্চিত নয়। পুনরায় জমা দেবেন না; Admin-কে reconciliation পরীক্ষা করতে বলুন।", "RECONCILIATION_REQUIRED");
    }
    shopLedgerFinishOperation_(sheets, started, result);
    return result;
  } catch (error) {
    shopLedgerFailOperation_(sheets, started, error);
    return err_("পরিবর্তনটি সম্পূর্ণ হয়েছে কিনা নিশ্চিত নয়। পুনরায় জমা দেবেন না; Admin-কে reconciliation পরীক্ষা করতে বলুন।", "RECONCILIATION_REQUIRED");
  }
}

function shopLedgerAllRecords_(sheets, shopId) {
  var markets = shopLedgerRows_(sheets.markets, SHOP_MARKET_HEADERS).filter(function (record) {
    return String(record.ShopID) === String(shopId) && record.Status === SHOP_LEDGER_ACTIVE;
  }).map(function (record) {
    var result = shopLedgerRecordObject_(record);
    result.Products = shopLedgerParseJson_(record.Products, [], "market products");
    result.Total = amountOf_(centsOf_(record.Total));
    result.CreatedByName = shopLedgerCreatorName_(record.CreatedBy);
    return result;
  }).sort(shopLedgerNewestFirst_);
  var payments = shopLedgerRows_(sheets.payments, SHOP_PAYMENT_HEADERS).filter(function (record) {
    return String(record.ShopID) === String(shopId) && record.Status === SHOP_LEDGER_ACTIVE;
  }).map(function (record) {
    var result = shopLedgerRecordObject_(record);
    result.Allocations = shopLedgerParseJson_(record.Allocations, [], "payment allocations");
    result.Total = amountOf_(centsOf_(record.Total));
    result.CreatedByName = shopLedgerCreatorName_(record.CreatedBy);
    return result;
  }).sort(shopLedgerNewestFirst_);
  return { markets: markets, payments: payments };
}

function shopLedgerPaymentAccounts_(walletId, allocations) {
  var allAccounts = financialAccountsForWallet_(walletId, { includeInactive: true });
  var byId = {};
  allAccounts.forEach(function (account) { byId[String(account.AccountID)] = account; });
  return (allocations || []).map(function (allocation) {
    return {
      AccountID: allocation.AccountID,
      AccountName: byId[String(allocation.AccountID)] ? byId[String(allocation.AccountID)].Name : allocation.AccountID,
      Amount: amountOf_(centsOf_(allocation.Amount)),
    };
  });
}

function shopLedgerWritePaymentEffects_(shop, paymentId, date, allocations, actor, reversal) {
  var resolved = resolveWalletSheet_(shop.WalletID);
  if (!resolved) throw new Error("দোকানের linked Wallet পাওয়া যায়নি; payment effect লেখা যায়নি।");
  var effectType = reversal ? SHOP_LEDGER_PAYMENT_REVERSAL_TYPE : SHOP_LEDGER_PAYMENT_TYPE;
  // Reverse on the date being reversed, not today: a payment edited or deleted
  // later must correct the period it originally affected, otherwise old reports
  // keep the original outflow and the reversal inflates the current period.
  var effectDate = date;
  var written = [];
  for (var i = 0; i < allocations.length; i++) {
    var allocation = allocations[i];
    var id = shopLedgerId_(reversal ? "SHPAYREV" : "SHPAY");
    resolved.sheet.appendRow([
      id, effectDate, effectType, resolved.wallet.Currency, allocation.AccountID,
      "Shop Credit Payment", shop.Name, "Shop credit payment: " + shop.Name,
      amountOf_(centsOf_(allocation.Amount)),
      "ShopPaymentID=" + paymentId, actor, new Date(),
    ]);
    written.push(id);
    cacheRemove_("txns", "txns_" + shop.WalletID);
  }
  return written;
}

function shopLedgerCanPay_(shop, allocations, existingAllocations) {
  var existingByAccount = {};
  (existingAllocations || []).forEach(function (allocation) {
    var key = String(allocation.AccountID);
    existingByAccount[key] = (existingByAccount[key] || 0) + centsOf_(allocation.Amount);
  });
  for (var i = 0; i < allocations.length; i++) {
    var allocation = allocations[i];
    var available = getAccountBalance_(shop.WalletID, allocation.AccountID);
    var availableCents = centsOf_(available) + (existingByAccount[String(allocation.AccountID)] || 0);
    if (centsOf_(allocation.Amount) > availableCents) {
      return err_("অপর্যাপ্ত Wallet account balance: " + allocation.AccountID + "।", "INSUFFICIENT_BALANCE");
    }
  }
  return null;
}

function shopLedgerRecordPayment_(sheets, shop, date, normalized, actor, requestId, existing) {
  var now = nowStr();
  var paymentId = existing ? existing.PaymentID : shopLedgerId_("SHP");
  if (existing) {
    var oldAllocations = shopLedgerParseJson_(existing.Allocations, [], "payment allocations");
    shopLedgerWritePaymentEffects_(shop, paymentId, existing.Date, oldAllocations, actor, true);
  }
  shopLedgerWritePaymentEffects_(shop, paymentId, date, normalized.allocations, actor, false);
  var row = [
    paymentId, shop.ShopID, date, JSON.stringify(normalized.allocations), normalized.total,
    SHOP_LEDGER_ACTIVE, existing ? existing.CreatedBy : actor,
    existing ? existing.CreatedAt : now, now, existing ? existing.RequestID : requestId,
  ];
  if (existing) {
    sheets.payments.getRange(existing._row, 1, 1, SHOP_PAYMENT_HEADERS.length).setValues([row]);
  } else {
    sheets.payments.appendRow(row);
  }
  shopLedgerHistory_(
    sheets, shop.ShopID, "Payment", paymentId, existing ? "Updated" : "Created",
    existing ? shopLedgerRecordObject_(existing) : null,
    { PaymentID: paymentId, ShopID: shop.ShopID, Date: date, Allocations: normalized.allocations, Total: normalized.total, Status: SHOP_LEDGER_ACTIVE },
    actor, requestId,
  );
  return { status: "SUCCESS", message: existing ? "পেমেন্ট আপডেট হয়েছে।" : "পেমেন্ট যোগ হয়েছে।", paymentId: paymentId };
}

function getShopLedgers(username) {
  var sheets = shopLedgerSheets_();
  var shops = shopLedgerRows_(sheets.shops, SHOP_LEDGER_HEADERS);
  var markets = shopLedgerRows_(sheets.markets, SHOP_MARKET_HEADERS);
  var payments = shopLedgerRows_(sheets.payments, SHOP_PAYMENT_HEADERS);
  var result = [];
  var accessibleWallets = {};
  shops.forEach(function (shop) {
    if (accessibleWallets[String(shop.WalletID)] === undefined) {
      accessibleWallets[String(shop.WalletID)] = !authorize_(username, "VIEW_SHOP_LEDGER", [shop.WalletID]);
    }
    if (!accessibleWallets[String(shop.WalletID)]) return;
    var wallet = shopLedgerWallet_(shop.WalletID, false);
    result.push(shopLedgerSummary_(shop, markets, payments, wallet));
  });
  var incomplete = shopLedgerRows_(sheets.operations, SHOP_LEDGER_OPERATION_HEADERS).filter(function (operation) {
    return operation.Status === "RECONCILIATION_REQUIRED" && operation.WalletID &&
      !authorize_(username, "VIEW_SHOP_LEDGER", [operation.WalletID]);
  }).map(function (operation) {
    return { RequestID: operation.RequestID, Action: operation.Action, Status: operation.Status, UpdatedAt: operation.UpdatedAt };
  });
  result.sort(function (a, b) { return String(a.Name).localeCompare(String(b.Name)); });
  return { status: "SUCCESS", shops: result, reconciliationRequired: incomplete };
}

function getShopLedgerDetails(shopId, username) {
  var sheets = shopLedgerSheets_();
  var shop = shopLedgerGet_(shopId, sheets);
  var accessErr = shopLedgerAuthorize_(username, "VIEW_SHOP_LEDGER", shop);
  if (accessErr) return accessErr;
  var wallet = shopLedgerWallet_(shop.WalletID, false);
  if (!wallet) return err_("Linked Wallet পাওয়া যায়নি।", "WALLET_NOT_FOUND");
  var records = shopLedgerAllRecords_(sheets, shop.ShopID);
  records.payments = records.payments.map(function (payment) {
    payment.Allocations = shopLedgerPaymentAccounts_(shop.WalletID, payment.Allocations);
    return payment;
  });
  var activeAccounts = financialAccountsForWallet_(shop.WalletID, { includeInactive: false });
  return {
    status: "SUCCESS",
    shop: shopLedgerSummary_(shop, shopLedgerRows_(sheets.markets, SHOP_MARKET_HEADERS), shopLedgerRows_(sheets.payments, SHOP_PAYMENT_HEADERS), wallet),
    accounts: activeAccounts,
    markets: records.markets,
    payments: records.payments,
  };
}

function createShopLedger(data, username) {
  var sheets = shopLedgerSheets_();
  var name = shopLedgerText_(data && data.name, 100, true, "দোকানের নাম");
  var address = shopLedgerText_(data && data.address, 200, true, "ঠিকানা");
  var mobile = shopLedgerText_(data && data.mobile || "", 30, false, "মোবাইল");
  if (name.error || address.error || mobile.error) return err_(name.error || address.error || mobile.error, "VALIDATION_ERROR");
  var walletId = String(data && data.walletId || "").trim();
  var wallet = shopLedgerWallet_(walletId, true);
  if (!wallet) return err_("সক্রিয় Wallet নির্বাচন করুন।", "WALLET_NOT_FOUND");
  var permErr = authorize_(username, "MANAGE_SHOP_LEDGER", [walletId]);
  if (permErr) return permErr;
  var openingCents = openingAmountCents_(data.openingBalance);
  if (isNaN(openingCents)) return err_("শুরুর বাকি শূন্য বা তার বেশি বৈধ পরিমাণ হতে হবে।", "INVALID_AMOUNT");
  var payload = {
    name: name.value, address: address.value, mobile: mobile.value,
    walletId: walletId, openingBalance: amountOf_(openingCents),
  };
  var replay = shopLedgerReplayOperation_(sheets, data.requestId, "createShopLedger", payload);
  if (replay.handled) return replay.result;
  if (shopLedgerRows_(sheets.shops, SHOP_LEDGER_HEADERS).some(function (shop) {
    return String(shop.WalletID) === walletId && String(shop.Name).toLowerCase() === name.value.toLowerCase() && shop.Status === SHOP_LEDGER_ACTIVE;
  })) return err_("এই Wallet-এ একই নামে চালু দোকানের খাতা আছে।", "SHOP_EXISTS");
  return shopLedgerRunOperation_(sheets, data.requestId, "createShopLedger", payload, function () {
    var shopId = shopLedgerId_("SHOP");
    var now = nowStr();
    var row = [
      shopId, name.value, address.value, mobile.value, walletId, SHOP_LEDGER_ACTIVE,
      amountOf_(openingCents), username, now, now, data.requestId,
    ];
    sheets.shops.appendRow(row);
    var record = {};
    SHOP_LEDGER_HEADERS.forEach(function (header, index) { record[header] = row[index]; });
    shopLedgerHistory_(sheets, shopId, "Shop", shopId, "Created", null, record, username, data.requestId);
    logAudit(username, "Shop ledger created", walletId, shopId + " " + name.value);
    return { status: "SUCCESS", message: "দোকানের খাতা তৈরি হয়েছে।", shopId: shopId };
  });
}

function updateShopLedger(shopId, data, username) {
  var sheets = shopLedgerSheets_();
  var shop = shopLedgerGet_(shopId, sheets);
  var accessErr = shopLedgerAuthorize_(username, "MANAGE_SHOP_LEDGER", shop);
  if (accessErr) return accessErr;
  var name = shopLedgerText_(data && data.name, 100, true, "দোকানের নাম");
  var address = shopLedgerText_(data && data.address, 200, true, "ঠিকানা");
  var mobile = shopLedgerText_(data && data.mobile || "", 30, false, "মোবাইল");
  if (name.error || address.error || mobile.error) return err_(name.error || address.error || mobile.error, "VALIDATION_ERROR");
  if (data.walletId && String(data.walletId) !== String(shop.WalletID)) return err_("তৈরি করার পর linked Wallet পরিবর্তন করা যাবে না।", "WALLET_IMMUTABLE");
  var payload = { shopId: shopId, name: name.value, address: address.value, mobile: mobile.value };
  return shopLedgerRunOperation_(sheets, data.requestId, "updateShopLedger", payload, function () {
    var before = shopLedgerRecordObject_(shop);
    sheets.shops.getRange(shop._row, 2, 1, 3).setValues([[name.value, address.value, mobile.value]]);
    sheets.shops.getRange(shop._row, 10).setValue(nowStr());
    shopLedgerHistory_(sheets, shop.ShopID, "Shop", shop.ShopID, "Updated", before,
      { ShopID: shop.ShopID, Name: name.value, Address: address.value, Mobile: mobile.value }, username, data.requestId);
    logAudit(username, "Shop ledger updated", shop.WalletID, shop.ShopID);
    return { status: "SUCCESS", message: "দোকানের তথ্য আপডেট হয়েছে।" };
  });
}

function setShopLedgerStatus(shopId, data, username) {
  var sheets = shopLedgerSheets_();
  var shop = shopLedgerGet_(shopId, sheets);
  var accessErr = shopLedgerAuthorize_(username, "MANAGE_SHOP_LEDGER", shop);
  if (accessErr) return accessErr;
  var status = String(data && data.status || "");
  if (status !== SHOP_LEDGER_ACTIVE && status !== SHOP_LEDGER_INACTIVE) {
    return err_("অবস্থা Active অথবা Inactive হতে হবে।", "INVALID_STATUS");
  }
  var payload = { shopId: shopId, status: status };
  return shopLedgerRunOperation_(sheets, data.requestId, "setShopLedgerStatus", payload, function () {
    var before = shopLedgerRecordObject_(shop);
    sheets.shops.getRange(shop._row, 6).setValue(status);
    sheets.shops.getRange(shop._row, 10).setValue(nowStr());
    shopLedgerHistory_(sheets, shop.ShopID, "Shop", shop.ShopID, "Status changed", before,
      { ShopID: shop.ShopID, Status: status }, username, data.requestId);
    logAudit(username, "Shop ledger status changed", shop.WalletID, shop.ShopID + " " + status);
    return { status: "SUCCESS", message: status === SHOP_LEDGER_ACTIVE ? "খাতা চালু হয়েছে।" : "খাতা বন্ধ হয়েছে।" };
  });
}

function addShopMarket(shopId, data, username) {
  var sheets = shopLedgerSheets_();
  var shop = shopLedgerGet_(shopId, sheets);
  var accessErr = shopLedgerAuthorize_(username, "ADD_MARKET_RECORD", shop);
  if (accessErr) return accessErr;
  if (shop.Status !== SHOP_LEDGER_ACTIVE) return err_("বন্ধ দোকানে নতুন বাজার যোগ করা যাবে না।", "SHOP_INACTIVE");
  if (!shopLedgerWallet_(shop.WalletID, true)) return err_("দোকানের linked Wallet সক্রিয় নেই।", "WALLET_INACTIVE");
  if (!shopLedgerDate_(data && data.date)) return err_("বাজারের তারিখ অবৈধ।", "INVALID_DATE");
  var parsed = shopLedgerParseProducts_(data && data.products);
  if (parsed.error) return err_(parsed.error, "VALIDATION_ERROR");
  var all = shopLedgerAllRecords_(sheets, shopId);
  var currentOutstanding = centsOf_(shop.OpeningBalance);
  all.markets.forEach(function (market) { currentOutstanding += centsOf_(market.Total); });
  all.payments.forEach(function (payment) { currentOutstanding -= centsOf_(payment.Total); });
  var paymentInput = data.payment || null;
  var normalizedPayment = null;
  var payload = { shopId: shopId, date: data.date, products: parsed.products, payment: null };
  if (paymentInput) {
    var paymentPermissionErr = authorize_(username, "ADD_SHOP_PAYMENT", [shop.WalletID]);
    if (paymentPermissionErr) return paymentPermissionErr;
    if (!shopLedgerDate_(paymentInput.date)) return err_("পেমেন্টের তারিখ অবৈধ।", "INVALID_DATE");
    normalizedPayment = shopLedgerNormalizeAllocations_(shop.WalletID, paymentInput.allocations);
    if (normalizedPayment.error) return err_(normalizedPayment.error, "VALIDATION_ERROR");
    if (!paymentInput.requestId) return err_("পেমেন্টের জন্য requestId আবশ্যক।", "INVALID_REQUEST_ID");
    payload.payment = { date: paymentInput.date, allocations: normalizedPayment.allocations };
  }
  var replay = shopLedgerReplayOperation_(sheets, data.requestId, "addShopMarket", payload);
  if (replay.handled) return replay.result;
  if (normalizedPayment && normalizedPayment.totalCents > currentOutstanding + parsed.totalCents) {
    return err_("পেমেন্ট বর্তমান বাকি অতিক্রম করতে পারবে না।", "OVERPAYMENT");
  }
  if (normalizedPayment) {
    var balanceErr = shopLedgerCanPay_(shop, normalizedPayment.allocations);
    if (balanceErr) return balanceErr;
  }
  return shopLedgerRunOperation_(sheets, data.requestId, "addShopMarket", payload, function () {
    var marketId = shopLedgerId_("MARKET");
    var now = nowStr();
    var marketRow = [
      marketId, shop.ShopID, data.date, JSON.stringify(parsed.products), parsed.total,
      SHOP_LEDGER_ACTIVE, username, now, now, data.requestId,
    ];
    sheets.markets.appendRow(marketRow);
    shopLedgerHistory_(sheets, shop.ShopID, "Market", marketId, "Created", null, {
      MarketID: marketId, ShopID: shop.ShopID, Date: data.date, Products: parsed.products, Total: parsed.total, Status: SHOP_LEDGER_ACTIVE,
    }, username, data.requestId);
    if (normalizedPayment) {
      var paymentResult = shopLedgerRunOperation_(sheets, paymentInput.requestId, "addShopPayment", {
        shopId: shopId, date: paymentInput.date, allocations: normalizedPayment.allocations,
      }, function () {
        return shopLedgerRecordPayment_(sheets, shop, paymentInput.date, normalizedPayment, username, paymentInput.requestId, null);
      });
      if (paymentResult.status !== "SUCCESS") return paymentResult;
    }
    logAudit(username, "Shop market added", shop.WalletID, marketId + " " + parsed.total);
    return { status: "SUCCESS", message: "বাজারের তথ্য যোগ হয়েছে।", marketId: marketId };
  });
}

function updateShopMarket(marketId, data, username) {
  var sheets = shopLedgerSheets_();
  var market = shopLedgerFind_(sheets.markets, SHOP_MARKET_HEADERS, "MarketID", marketId);
  if (!market || market.Status !== SHOP_LEDGER_ACTIVE) return err_("বাজারের রেকর্ড পাওয়া যায়নি।", "MARKET_NOT_FOUND");
  var shop = shopLedgerGet_(market.ShopID, sheets);
  var accessErr = shopLedgerAuthorize_(username, "EDIT_MARKET_RECORD", shop);
  if (accessErr) return accessErr;
  if (!shopLedgerDate_(data && data.date)) return err_("বাজারের তারিখ অবৈধ।", "INVALID_DATE");
  var parsed = shopLedgerParseProducts_(data && data.products);
  if (parsed.error) return err_(parsed.error, "VALIDATION_ERROR");
  var records = shopLedgerAllRecords_(sheets, shop.ShopID);
  var outstanding = centsOf_(shop.OpeningBalance);
  records.markets.forEach(function (row) { outstanding += centsOf_(row.Total); });
  records.payments.forEach(function (row) { outstanding -= centsOf_(row.Total); });
  if (outstanding - centsOf_(market.Total) + parsed.totalCents < 0) {
    return err_("এই পরিবর্তনে বাজারের মোট পেমেন্টের চেয়ে কম হবে; বাজার কমানো বা মোছার আগে পেমেন্ট সংশোধন করুন।", "NEGATIVE_OUTSTANDING");
  }
  var payload = { marketId: marketId, date: data.date, products: parsed.products };
  return shopLedgerRunOperation_(sheets, data.requestId, "updateShopMarket", payload, function () {
    var before = shopLedgerRecordObject_(market);
    var now = nowStr();
    sheets.markets.getRange(market._row, 3, 1, 3).setValues([
      [data.date, JSON.stringify(parsed.products), parsed.total],
    ]);
    sheets.markets.getRange(market._row, 9).setValue(now);
    shopLedgerHistory_(sheets, shop.ShopID, "Market", marketId, "Updated", before,
      { MarketID: marketId, ShopID: shop.ShopID, Date: data.date, Products: parsed.products, Total: parsed.total, Status: market.Status },
      username, data.requestId);
    logAudit(username, "Shop market updated", shop.WalletID, marketId);
    return { status: "SUCCESS", message: "বাজারের তথ্য আপডেট হয়েছে।" };
  });
}

function deleteShopMarket(marketId, data, username) {
  var sheets = shopLedgerSheets_();
  var market = shopLedgerFind_(sheets.markets, SHOP_MARKET_HEADERS, "MarketID", marketId);
  if (!market) return err_("বাজারের রেকর্ড পাওয়া যায়নি।", "MARKET_NOT_FOUND");
  var shop = shopLedgerGet_(market.ShopID, sheets);
  var accessErr = shopLedgerAuthorize_(username, "DELETE_MARKET_RECORD", shop);
  if (accessErr) return accessErr;
  var payload = { marketId: marketId, shopId: shop.ShopID };
  var replay = shopLedgerReplayOperation_(sheets, data && data.requestId, "deleteShopMarket", payload);
  if (replay.handled) return replay.result;
  if (market.Status !== SHOP_LEDGER_ACTIVE) return err_("বাজারের রেকর্ড পাওয়া যায়নি।", "MARKET_NOT_FOUND");
  var records = shopLedgerAllRecords_(sheets, shop.ShopID);
  var outstanding = centsOf_(shop.OpeningBalance);
  records.markets.forEach(function (row) { outstanding += centsOf_(row.Total); });
  records.payments.forEach(function (row) { outstanding -= centsOf_(row.Total); });
  if (outstanding - centsOf_(market.Total) < 0) {
    return err_("এই বাজার বাদ দিলে বাকি ঋণাত্মক হবে; আগে পেমেন্ট সংশোধন করুন।", "NEGATIVE_OUTSTANDING");
  }
  return shopLedgerRunOperation_(sheets, data && data.requestId, "deleteShopMarket", payload, function () {
    var before = shopLedgerRecordObject_(market);
    sheets.markets.getRange(market._row, 6).setValue("Deleted");
    sheets.markets.getRange(market._row, 9).setValue(nowStr());
    shopLedgerHistory_(sheets, shop.ShopID, "Market", marketId, "Deleted", before,
      { MarketID: marketId, Status: "Deleted" }, username, data.requestId);
    logAudit(username, "Shop market deleted", shop.WalletID, marketId);
    return { status: "SUCCESS", message: "বাজারের রেকর্ড বাদ দেওয়া হয়েছে।" };
  });
}

function addShopPayment(shopId, data, username) {
  var sheets = shopLedgerSheets_();
  var shop = shopLedgerGet_(shopId, sheets);
  var accessErr = shopLedgerAuthorize_(username, "ADD_SHOP_PAYMENT", shop);
  if (accessErr) return accessErr;
  if (shop.Status !== SHOP_LEDGER_ACTIVE) return err_("বন্ধ দোকানে নতুন পেমেন্ট যোগ করা যাবে না।", "SHOP_INACTIVE");
  if (!shopLedgerWallet_(shop.WalletID, true)) return err_("দোকানের linked Wallet সক্রিয় নেই।", "WALLET_INACTIVE");
  if (!shopLedgerDate_(data && data.date)) return err_("পেমেন্টের তারিখ অবৈধ।", "INVALID_DATE");
  var normalized = shopLedgerNormalizeAllocations_(shop.WalletID, data.allocations);
  if (normalized.error) return err_(normalized.error, "VALIDATION_ERROR");
  var payload = { shopId: shopId, date: data.date, allocations: normalized.allocations };
  var replay = shopLedgerReplayOperation_(sheets, data.requestId, "addShopPayment", payload);
  if (replay.handled) return replay.result;
  var records = shopLedgerAllRecords_(sheets, shopId);
  var outstanding = centsOf_(shop.OpeningBalance);
  records.markets.forEach(function (market) { outstanding += centsOf_(market.Total); });
  records.payments.forEach(function (payment) { outstanding -= centsOf_(payment.Total); });
  if (normalized.totalCents > outstanding) return err_("পেমেন্ট বর্তমান বাকি অতিক্রম করতে পারবে না।", "OVERPAYMENT");
  var balanceErr = shopLedgerCanPay_(shop, normalized.allocations);
  if (balanceErr) return balanceErr;
  return shopLedgerRunOperation_(sheets, data.requestId, "addShopPayment", payload, function () {
    var result = shopLedgerRecordPayment_(sheets, shop, data.date, normalized, username, data.requestId, null);
    logAudit(username, "Shop payment added", shop.WalletID, result.paymentId + " " + normalized.total);
    return result;
  });
}

function updateShopPayment(paymentId, data, username) {
  var sheets = shopLedgerSheets_();
  var payment = shopLedgerFind_(sheets.payments, SHOP_PAYMENT_HEADERS, "PaymentID", paymentId);
  if (!payment || payment.Status !== SHOP_LEDGER_ACTIVE) return err_("পেমেন্টের রেকর্ড পাওয়া যায়নি।", "PAYMENT_NOT_FOUND");
  var shop = shopLedgerGet_(payment.ShopID, sheets);
  var accessErr = shopLedgerAuthorize_(username, "EDIT_SHOP_PAYMENT", shop);
  if (accessErr) return accessErr;
  if (!shopLedgerDate_(data && data.date)) return err_("পেমেন্টের তারিখ অবৈধ।", "INVALID_DATE");
  var normalized = shopLedgerNormalizeAllocations_(shop.WalletID, data.allocations);
  if (normalized.error) return err_(normalized.error, "VALIDATION_ERROR");
  var records = shopLedgerAllRecords_(sheets, shop.ShopID);
  var outstanding = centsOf_(shop.OpeningBalance);
  records.markets.forEach(function (market) { outstanding += centsOf_(market.Total); });
  records.payments.forEach(function (row) { outstanding -= centsOf_(row.Total); });
  if (normalized.totalCents > outstanding + centsOf_(payment.Total)) return err_("পেমেন্ট বর্তমান বাকি অতিক্রম করতে পারবে না।", "OVERPAYMENT");
  var oldAllocations = shopLedgerParseJson_(payment.Allocations, [], "payment allocations");
  var balanceErr = shopLedgerCanPay_(shop, normalized.allocations, oldAllocations);
  if (balanceErr) return balanceErr;
  var payload = { paymentId: paymentId, date: data.date, allocations: normalized.allocations };
  return shopLedgerRunOperation_(sheets, data.requestId, "updateShopPayment", payload, function () {
    var result = shopLedgerRecordPayment_(sheets, shop, data.date, normalized, username, data.requestId, payment);
    logAudit(username, "Shop payment updated", shop.WalletID, paymentId);
    return result;
  });
}

function deleteShopPayment(paymentId, data, username) {
  var sheets = shopLedgerSheets_();
  var payment = shopLedgerFind_(sheets.payments, SHOP_PAYMENT_HEADERS, "PaymentID", paymentId);
  if (!payment) return err_("পেমেন্টের রেকর্ড পাওয়া যায়নি।", "PAYMENT_NOT_FOUND");
  var shop = shopLedgerGet_(payment.ShopID, sheets);
  var accessErr = shopLedgerAuthorize_(username, "DELETE_SHOP_PAYMENT", shop);
  if (accessErr) return accessErr;
  var payload = { paymentId: paymentId, shopId: shop.ShopID };
  var replay = shopLedgerReplayOperation_(sheets, data && data.requestId, "deleteShopPayment", payload);
  if (replay.handled) return replay.result;
  if (payment.Status !== SHOP_LEDGER_ACTIVE) return err_("পেমেন্টের রেকর্ড পাওয়া যায়নি।", "PAYMENT_NOT_FOUND");
  return shopLedgerRunOperation_(sheets, data && data.requestId, "deleteShopPayment", payload, function () {
    var before = shopLedgerRecordObject_(payment);
    var allocations = shopLedgerParseJson_(payment.Allocations, [], "payment allocations");
    shopLedgerWritePaymentEffects_(shop, paymentId, payment.Date, allocations, username, true);
    sheets.payments.getRange(payment._row, 6).setValue("Deleted");
    sheets.payments.getRange(payment._row, 9).setValue(nowStr());
    shopLedgerHistory_(sheets, shop.ShopID, "Payment", paymentId, "Deleted", before,
      { PaymentID: paymentId, Status: "Deleted" }, username, data.requestId);
    logAudit(username, "Shop payment deleted", shop.WalletID, paymentId);
    return { status: "SUCCESS", message: "পেমেন্ট বাদ দেওয়া হয়েছে; Wallet balance effect উল্টে দেওয়া হয়েছে।" };
  });
}

function getShopLedgerReport(shopId, month, username) {
  var sheets = shopLedgerSheets_();
  var shop = shopLedgerGet_(shopId, sheets);
  var accessErr = shopLedgerAuthorize_(username, "VIEW_SHOP_REPORTS", shop);
  if (accessErr) return accessErr;
  if (typeof month !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return err_("রিপোর্টের মাস YYYY-MM ফরম্যাটে দিন।", "INVALID_MONTH");
  }
  var parts = month.split("-");
  var firstDay = month + "-01";
  var lastDay = month + "-" + String(new Date(Number(parts[0]), Number(parts[1]), 0).getDate()).padStart(2, "0");
  var markets = shopLedgerRows_(sheets.markets, SHOP_MARKET_HEADERS).filter(function (record) {
    return String(record.ShopID) === String(shopId) && record.Status === SHOP_LEDGER_ACTIVE;
  });
  var payments = shopLedgerRows_(sheets.payments, SHOP_PAYMENT_HEADERS).filter(function (record) {
    return String(record.ShopID) === String(shopId) && record.Status === SHOP_LEDGER_ACTIVE;
  });
  var beginning = centsOf_(shop.OpeningBalance);
  markets.forEach(function (record) { if (String(record.Date) < firstDay) beginning += centsOf_(record.Total); });
  payments.forEach(function (record) { if (String(record.Date) < firstDay) beginning -= centsOf_(record.Total); });
  var monthMarkets = markets.filter(function (record) { return String(record.Date) >= firstDay && String(record.Date) <= lastDay; });
  var monthPayments = payments.filter(function (record) { return String(record.Date) >= firstDay && String(record.Date) <= lastDay; });
  var marketTotal = monthMarkets.reduce(function (sum, record) { return sum + centsOf_(record.Total); }, 0);
  var paymentTotal = monthPayments.reduce(function (sum, record) { return sum + centsOf_(record.Total); }, 0);
  return {
    status: "SUCCESS",
    report: {
      ShopID: shopId,
      Month: month,
      BeginningOutstanding: amountOf_(beginning),
      TotalMarketPurchases: amountOf_(marketTotal),
      TotalPayments: amountOf_(paymentTotal),
      EndingOutstanding: amountOf_(beginning + marketTotal - paymentTotal),
      Markets: monthMarkets.map(function (record) {
        return {
          RecordID: record.MarketID,
          Date: record.Date,
          CreatedAt: record.CreatedAt,
          Total: amountOf_(centsOf_(record.Total)),
          Products: shopLedgerParseJson_(record.Products, [], "market products"),
        };
      }),
      Payments: monthPayments.map(function (record) {
        return {
          RecordID: record.PaymentID,
          Date: record.Date,
          CreatedAt: record.CreatedAt,
          Total: amountOf_(centsOf_(record.Total)),
          Allocations: shopLedgerPaymentAccounts_(
            shop.WalletID,
            shopLedgerParseJson_(record.Allocations, [], "payment allocations"),
          ),
        };
      }),
    },
  };
}
