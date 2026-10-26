// ---------------- WALLET HELPERS ----------------

function walletsRows_() {
  var cached = cacheGet_("wallets", "all");
  if (cached !== undefined) return cached;

  var sheet = getWalletsSheet_();
  if (sheet.getLastRow() < 2) return [];
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, WALLET_HEADERS.length).getValues();
  cachePut_("wallets", "all", rows);
  return rows;
}

function walletFromRow_(row) {
  return {
    WalletID: row[0], WalletName: row[1], Currency: row[2],
    SheetName: row[3], Status: row[4], CreatedAt: row[5], UpdatedAt: row[6],
    OpeningCash: parseFloat(row[7]) || 0,
    OpeningBank: parseFloat(row[8]) || 0,
  };
}

function findWalletRowIndex_(walletId) {
  var sheet = getWalletsSheet_();
  if (sheet.getLastRow() < 2) return -1;
  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][0]) === String(walletId)) return i + 2;
  }
  return -1;
}

function getWalletById_(walletId) {
  var rowIdx = findWalletRowIndex_(walletId);
  if (rowIdx === -1) return null;
  var row = getWalletsSheet_().getRange(rowIdx, 1, 1, WALLET_HEADERS.length).getValues()[0];
  return walletFromRow_(row);
}

function findWalletByCurrency_(currency) {
  var rows = walletsRows_();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][2]) === currency && String(rows[i][4]) === "Active") {
      return walletFromRow_(rows[i]);
    }
  }
  return null;
}

function getAllWalletIds_() {
  return walletsRows_().map(function (r) { return String(r[0]); });
}

function generateWalletId_() {
  var maxNum = 0;
  walletsRows_().forEach(function (r) {
    var m = /^W(\d+)$/.exec(String(r[0]));
    if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
  });
  var next = maxNum + 1;
  return "W" + (next < 100 ? ("00" + next).slice(-3) : String(next));
}

function walletInfoBlock_(wallet) {
  var openingCash = parseFloat(wallet.OpeningCash) || 0;
  var openingBank = parseFloat(wallet.OpeningBank) || 0;
  return [
    ["===== " + String(wallet.WalletName).toUpperCase() + " ====="],
    ["Wallet ID: " + wallet.WalletID + "    Currency: " + wallet.Currency + "    Status: " + wallet.Status],
    ["Created At: " + wallet.CreatedAt + "    Updated At: " + wallet.UpdatedAt],
    ["Opening Cash: " + openingCash.toFixed(2) + "    Opening Bank: " + openingBank.toFixed(2)],
    ["================================================="],
  ];
}

function writeWalletHeaderBlock_(sheet, wallet) {
  var block = walletInfoBlock_(wallet);
  sheet.getRange(1, 1, block.length, 1).setValues(block);
  sheet.getRange(6, 1).setValue("");
}

function ensureWalletSheet_(wallet, isNew) {
  var sheet = ss_().getSheetByName(wallet.SheetName);
  if (!sheet) {
    sheet = ss_().insertSheet(wallet.SheetName);
  }
  if (isNew || sheet.getLastRow() === 0) {
    writeWalletHeaderBlock_(sheet, wallet);
    sheet.getRange(7, 1, 1, TRANSACTION_HEADERS.length).setValues([TRANSACTION_HEADERS]);
    sheet.getRange(7, 1, 1, TRANSACTION_HEADERS.length).setFontWeight("bold");
    sheet.setFrozenRows(7);
    try {
      sheet.getRange(8, 2, 500, 1).setNumberFormat("yyyy-mm-dd");
      sheet.getRange(8, 9, 500, 1).setNumberFormat("#,##0.00");
      sheet.setColumnWidths(1, 12, 110);
    } catch (e) { /* formatting best-effort */ }
  } else {
    writeWalletHeaderBlock_(sheet, wallet);
  }
  return sheet;
}

function resolveWalletSheet_(walletId) {
  var wallet = getWalletById_(walletId);
  if (!wallet) return null;
  var sheet = ss_().getSheetByName(wallet.SheetName);
  if (!sheet) sheet = ensureWalletSheet_(wallet, true);
  return { wallet: wallet, sheet: sheet };
}

function requireActiveWallet_(walletId) {
  var wallet = getWalletById_(walletId);
  if (!wallet) return err_("Wallet পাওয়া যায়নি!");
  if (String(wallet.Status) !== "Active") return err_("এই Wallet নিষ্ক্রিয় (deactivated) — নতুন লেনদেন যোগ করা যাবে না।");
  return null;
}

function readWalletTransactions_(sheet, wallet) {
  var cacheKey = "txns_" + wallet.WalletID;
  var cached = cacheGet_("txns", cacheKey);
  if (cached !== undefined) return cached;

  var lastRow = sheet.getLastRow();
  if (lastRow < WALLET_DATA_START_ROW) return [];
  var data = sheet.getRange(WALLET_DATA_START_ROW, 1, lastRow - WALLET_DATA_START_ROW + 1, TRANSACTION_HEADERS.length).getValues();
  var out = [];
  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    if (!row[0]) continue;
    var txn = {};
    for (var j = 0; j < TRANSACTION_HEADERS.length; j++) {
      var value = row[j];
      var h = TRANSACTION_HEADERS[j];
      if (h === "Date" && value instanceof Date) value = Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd");
      if (h === "Timestamp" && value instanceof Date) value = value.toISOString();
      txn[h] = value;
    }
    txn.WalletID = wallet.WalletID;
    txn.WalletName = wallet.WalletName;
    txn._sheetRow = WALLET_DATA_START_ROW + i;
    out.push(txn);
  }
  cachePut_("txns", cacheKey, out);
  return out;
}

function getAllWalletsSafe_() {
  return walletsRows_().map(walletFromRow_);
}

// ---------------- WALLETS CRUD ----------------

function getWallets(username) {
  setupDatabase();
  var user = getUserRecord_(username);
  if (!user) return [];
  var accessIds = getUserWalletAccess_(user);
  return walletsRows_().map(walletFromRow_)
    .filter(function (w) { return String(w.Status) === "Active" && accessIds.indexOf(String(w.WalletID)) !== -1; })
    .map(function (w) { return { WalletID: w.WalletID, WalletName: w.WalletName, Currency: w.Currency, Status: w.Status, OpeningCash: w.OpeningCash || 0, OpeningBank: w.OpeningBank || 0 }; });
}

function getAllWallets(username) {
  setupDatabase();
  if (!hasPermission_(username, "ADD_WALLET") &&
      !hasPermission_(username, "EDIT_WALLET") &&
      !hasPermission_(username, "MANAGE_WALLET_STATUS")) {
    return permissionDenied_();
  }
  var user = getUserRecord_(username);
  var isAdminUser = isAdminRecord_(user);
  var accessIds = getUserWalletAccess_(user);
  var wallets = walletsRows_().map(walletFromRow_)
    .filter(function (w) { return accessIds.indexOf(String(w.WalletID)) !== -1; })
    .map(function (w) {
      // SheetName is the physical sheet a row lives in. Only an Admin gets it:
      // a non-Admin is scoped to exactly the wallets they can reach, and has
      // no reason to learn the internal sheet mapping.
      if (isAdminUser) return w;
      return {
        WalletID: w.WalletID, WalletName: w.WalletName, Currency: w.Currency, Status: w.Status,
        CreatedAt: w.CreatedAt, UpdatedAt: w.UpdatedAt, OpeningCash: w.OpeningCash, OpeningBank: w.OpeningBank,
      };
    });
  return { status: "SUCCESS", wallets: wallets };
}

function addWallet(walletName, currency, openingCash, openingBank, adminUsername) {
  setupDatabase();
  var perm = requirePermission_(adminUsername, "ADD_WALLET");
  if (perm) return perm;
  var name = normalizeWalletName_(walletName);
  if (!name) return err_("Wallet এর নাম আবশ্যক এবং ৬০ অক্ষরের বেশি হতে পারবে না।");
  if (!isValidCurrency_(currency)) return err_("Invalid currency.");

  // Opening balances are money too: "abc", true, [] or 1.005 must be refused,
  // not silently coerced to 0 / 1 by parseFloat.
  var ocCents = openingAmountCents_(openingCash);
  var obCents = openingAmountCents_(openingBank);
  // A negative opening balance keeps its own wording — "must be greater than 0"
  // would be technically true but useless for someone fixing a typo.
  if (!isNaN(ocCents) && ocCents < 0) return err_("Opening balance ঋণাত্মক হতে পারবে না।", "INVALID_AMOUNT");
  if (!isNaN(obCents) && obCents < 0) return err_("Opening balance ঋণাত্মক হতে পারবে না।", "INVALID_AMOUNT");
  if (isNaN(ocCents)) return err_(amountError_(openingCash), "INVALID_AMOUNT");
  if (isNaN(obCents)) return err_(amountError_(openingBank), "INVALID_AMOUNT");
  var oc = amountOf_(ocCents);
  var ob = amountOf_(obCents);

  var duplicateExists = walletsRows_().some(function (r) {
    return String(r[4]) === "Active" && String(r[2]) === currency && String(r[1]).toLowerCase() === name.toLowerCase();
  });
  if (duplicateExists) return err_("এই নামে ও কারেন্সিতে একটি Wallet আগে থেকেই আছে।");

  var id = generateWalletId_();
  var sheetName = "Wallet_" + id;
  var ts = nowStr();
  var wallet = { WalletID: id, WalletName: name, Currency: currency, SheetName: sheetName, Status: "Active", CreatedAt: ts, UpdatedAt: ts, OpeningCash: oc, OpeningBank: ob };
  ensureWalletSheet_(wallet, true);
  getWalletsSheet_().appendRow([id, name, currency, sheetName, "Active", ts, ts, oc, ob]);
  cacheRemove_("wallets", "all");
  // Give the new wallet its guaranteed Cash/Bank financial accounts immediately,
  // so it is usable the moment it appears (rather than only after a balance read).
  ensureWalletDefaultAccounts_(id);
  logAudit(adminUsername, "Wallet created", id, name + " (" + currency + ") Cash:" + oc.toFixed(2) + " Bank:" + ob.toFixed(2));
  return { status: "SUCCESS", message: "নতুন Wallet তৈরি হয়েছে!", walletId: id };
}

function updateWallet(walletId, newName, newStatus, adminUsername) {
  setupDatabase();
  var rowIdx = findWalletRowIndex_(walletId);
  if (rowIdx === -1) return err_("Wallet পাওয়া যায়নি!");

  // The wallet scope is ALWAYS authorised first, for every branch. Previously a
  // request that carried neither a name nor a status fell through to a
  // permission-only check with no wallet check at all; now the caller must be
  // able to reach this specific wallet regardless of which fields are changing.
  if (newName) {
    var editErr = authorize_(adminUsername, "EDIT_WALLET", [walletId]);
    if (editErr) return editErr;
  }
  if (newStatus) {
    var statusErr = authorize_(adminUsername, "MANAGE_WALLET_STATUS", [walletId]);
    if (statusErr) return statusErr;
  }
  if (!newName && !newStatus) {
    var anyPerm = authorize_(adminUsername, "EDIT_WALLET", [walletId]) || authorize_(adminUsername, "MANAGE_WALLET_STATUS", [walletId]);
    if (anyPerm) return anyPerm;
  }
  if (newStatus && !isValidWalletStatus_(newStatus)) return validationError_("Invalid status.");
  var normalizedName = newName ? normalizeWalletName_(newName) : null;
  if (newName && !normalizedName) return err_("Wallet এর নাম আবশ্যক এবং ৬০ অক্ষরের বেশি হতে পারবে না।");

  var wallet = getWalletById_(walletId);
  var ts = nowStr();
  wallet.WalletName = normalizedName || wallet.WalletName;
  wallet.Status = newStatus || wallet.Status;
  wallet.UpdatedAt = ts;

  getWalletsSheet_().getRange(rowIdx, 2, 1, 1).setValue(wallet.WalletName);
  getWalletsSheet_().getRange(rowIdx, 5, 1, 2).setValues([[wallet.Status, ts]]);
  var sheet = ss_().getSheetByName(wallet.SheetName);
  if (sheet) writeWalletHeaderBlock_(sheet, wallet);
  cacheRemove_("wallets", "all");
  logAudit(adminUsername, "Wallet updated", walletId, JSON.stringify({ name: wallet.WalletName, status: wallet.Status }));
  return { status: "SUCCESS", message: "Wallet আপডেট হয়েছে!" };
}

function checkWalletHasTransactions(walletId, username) {
  setupDatabase();
  var accessErr = requireWalletAccess_(username, walletId);
  if (accessErr) return accessErr;
  if (!hasPermission_(username, "EDIT_WALLET") && !hasPermission_(username, "MANAGE_WALLET_STATUS")) {
    return permissionDenied_();
  }
  var resolved = resolveWalletSheet_(walletId);
  if (!resolved) return { status: "SUCCESS", hasTransactions: false };
  return { status: "SUCCESS", hasTransactions: resolved.sheet.getLastRow() >= WALLET_DATA_START_ROW };
}

function deleteWallet(walletId, adminUsername) {
  setupDatabase();
  var perm = authorize_(adminUsername, "MANAGE_WALLET_STATUS", [walletId]);
  if (perm) return perm;
  var rowIdx = findWalletRowIndex_(walletId);
  if (rowIdx === -1) return err_("Wallet পাওয়া যায়নি!");

  var ts = nowStr();
  getWalletsSheet_().getRange(rowIdx, 5, 1, 1).setValue("Inactive");
  getWalletsSheet_().getRange(rowIdx, 6, 1, 1).setValue(ts);
  cacheRemove_("wallets", "all");
  var wallet = getWalletById_(walletId);
  wallet.Status = "Inactive";
  wallet.UpdatedAt = ts;
  var sheet = ss_().getSheetByName(wallet.SheetName);
  if (sheet) writeWalletHeaderBlock_(sheet, wallet);
  logAudit(adminUsername, "Wallet deleted (soft)", walletId, wallet.WalletName);
  return { status: "SUCCESS", message: "Wallet মুছে ফেলা হয়েছে (deactivated)।" };
}

// ---------------- CATEGORIES ----------------

function getCategories(username) {
  setupDatabase();
  var user = getUserRecord_(username);
  if (!user) return { status: "SUCCESS", categories: [] };
  var sheet = getCategoriesSheet_();
  if (sheet.getLastRow() < 2) return { status: "SUCCESS", categories: [] };
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, CATEGORY_HEADERS.length).getValues();
  var categories = rows
    .map(function (r) { return { CategoryID: r[0], Name: r[1], Type: r[2], Status: r[3] }; })
    .filter(function (c) { return String(c.Status) === "Active"; });
  return { status: "SUCCESS", categories: categories };
}

function addCategory(name, type, adminUsername) {
  setupDatabase();
  var perm = requirePermission_(adminUsername, "MANAGE_CATEGORIES");
  if (perm) return perm;
  var trimmed = String(name || "").trim();
  if (!trimmed || (type !== "Income" && type !== "Expense")) return err_("সঠিক নাম ও ধরন দিন (Income/Expense)।");
  if (trimmed.length > 60) return err_("ক্যাটাগরির নাম অনেক বড়।");

  var sheet = getCategoriesSheet_();
  if (sheet.getLastRow() >= 2) {
    var existingRows = sheet.getRange(2, 1, sheet.getLastRow() - 1, CATEGORY_HEADERS.length).getValues();
    var isDuplicate = existingRows.some(function (r) {
      return String(r[3]) === "Active" && String(r[2]) === type && String(r[1]).toLowerCase() === trimmed.toLowerCase();
    });
    if (isDuplicate) return err_("এই ক্যাটাগরি আগে থেকেই আছে।");
  }

  var id = Utilities.getUuid();
  sheet.appendRow([id, trimmed, type, "Active", nowStr()]);
  logAudit(adminUsername, "Category added", id, type + ": " + trimmed);
  return { status: "SUCCESS", message: "ক্যাটাগরি যোগ হয়েছে!" };
}

// Only the display name is editable. Type is deliberately immutable: existing
// transactions reference the CategoryID, and flipping Income/Expense under them
// would silently reinterpret every historical row already filed under it.
function updateCategory(categoryId, data, adminUsername) {
  setupDatabase();
  var perm = requirePermission_(adminUsername, "MANAGE_CATEGORIES");
  if (perm) return perm;

  var sheet = getCategoriesSheet_();
  if (sheet.getLastRow() < 2) return err_("ক্যাটাগরি পাওয়া যায়নি!");

  var name = String((data && data.name) || "").trim();
  if (!name) return err_("ক্যাটাগরির নাম দিন।");
  if (name.length > 60) return err_("ক্যাটাগরির নাম অনেক বড়।");

  var ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) !== String(categoryId)) continue;
    if (String(sheet.getRange(i + 2, 4).getValue()) !== "Active") {
      return err_("ক্যাটাগরি পাওয়া যায়নি!");
    }
    var type = String(sheet.getRange(i + 2, 3).getValue());
    var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, CATEGORY_HEADERS.length).getValues();
    var isDuplicate = rows.some(function (r, idx) {
      return idx !== i && String(r[3]) === "Active" && String(r[2]) === type && String(r[1]).toLowerCase() === name.toLowerCase();
    });
    if (isDuplicate) return err_("এই ক্যাটাগরি আগে থেকেই আছে।");

    sheet.getRange(i + 2, 2, 1, 1).setValue(name);
    logAudit(adminUsername, "Category renamed", categoryId, name);
    return { status: "SUCCESS", message: "ক্যাটাগরির নাম পরিবর্তন হয়েছে!" };
  }
  return err_("ক্যাটাগরি পাওয়া যায়নি!");
}

function deleteCategory(categoryId, adminUsername) {
  setupDatabase();
  var perm = requirePermission_(adminUsername, "MANAGE_CATEGORIES");
  if (perm) return perm;
  var sheet = getCategoriesSheet_();
  if (sheet.getLastRow() < 2) return err_("ক্যাটাগরি পাওয়া যায়নি!");
  var ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(categoryId)) {
      sheet.getRange(i + 2, 4, 1, 1).setValue("Inactive");
      logAudit(adminUsername, "Category deactivated", categoryId, "");
      return { status: "SUCCESS", message: "ক্যাটাগরি মুছে ফেলা হয়েছে!" };
    }
  }
  return err_("ক্যাটাগরি পাওয়া যায়নি!");
}
