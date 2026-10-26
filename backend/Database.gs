// ---------------- CONSTANTS ----------------

var TRANSACTION_HEADERS = [
  "ID", "Date", "Type", "Currency", "Account", "SourceCategory",
  "WhereVendor", "Description", "Amount", "Note", "User", "Timestamp",
];

var USER_HEADERS = [
  "Username", "FullName", "PIN", "Role", "Status", "Permissions",
  "WalletAccess", "ProfilePic", "DefaultCurrency", "DefaultAccount",
  "CreatedAt", "UpdatedAt", "SessionVersion",
];

// 1-based column indexes on the Users sheet. Referenced by the security code
// (PIN hashing, session version) so those writes can never drift out of sync
// with the header layout above.
var USER_COL_USERNAME = 1;
var USER_COL_FULLNAME = 2;
var USER_COL_PIN = 3;
var USER_COL_ROLE = 4;
var USER_COL_STATUS = 5;
var USER_COL_PERMISSIONS = 6;
var USER_COL_WALLET_ACCESS = 7;
var USER_COL_UPDATED_AT = 12;
var USER_COL_SESSION_VERSION = 13;


var WALLET_HEADERS = [
  "WalletID", "WalletName", "Currency", "SheetName", "Status", "CreatedAt", "UpdatedAt",
  "OpeningCash", "OpeningBank",
];

var AUDIT_HEADERS = ["Date", "User", "Action", "Target", "Details"];
var CATEGORY_HEADERS = ["CategoryID", "Name", "Type", "Status", "CreatedAt"];

var LOAN_HEADERS = [
  "LoanID", "User", "Type", "PersonID", "PersonName", "Phone", "Amount", "Currency",
  "LoanDate", "WalletID", "Account", "DueDate", "ReminderDate", "Note",
  "TotalRepaid", "RemainingAmount", "Status", "CreatedBy", "CreatedAt", "UpdatedAt", "RequestID",
];

var LOAN_PAYMENT_HEADERS = [
  "PaymentID", "LoanID", "User", "Type", "Amount", "Currency", "WalletID", "Account",
  "PaymentDate", "Note", "CreatedBy", "CreatedAt", "RequestID",
];

// Extra money lent/borrowed on an EXISTING loan, kept as independent records so
// the original amount + every addition + every repayment can be shown separately.
// PersonID preserves the identity of whom the extra money belongs to.
var LOAN_ADDITION_HEADERS = [
  "AdditionID", "LoanID", "User", "Amount", "Currency", "Date", "WalletID", "Account",
  "Note", "CreatedBy", "CreatedAt", "UpdatedAt", "RequestID", "PersonID",
];

// Savings module headers
var SAVINGS_PLAN_HEADERS = [
  "PlanID", "Type", "Name", "WalletID", "Account", "Currency", "StartDate",
  "Status", "User", "CreatedBy", "CreatedAt", "UpdatedAt", "RequestID",
  // Group fields
  "Group_MemberCount", "Group_Contribution", "Group_Frequency", "Group_Rounds", "Group_RecipientOrder", "Group_Note",
  // Fixed fields
  "Fixed_Amount", "Fixed_DurationMonths", "Fixed_DueDay", "Fixed_Note", "ClosedDate", "ClosureAmount", "ClosureNote",
  // Flexible fields
  "Flex_Note"
];

// IsSelf ("TRUE"/"") marks the one member whose contributions/payouts actually
// move the owning wallet; other members are recorded without any wallet effect.
var SAVINGS_GROUP_MEMBER_HEADERS = [
  "MemberID", "PlanID", "MemberName", "OrderIndex", "Status", "CreatedAt", "IsSelf"
];

var SAVINGS_GROUP_OBLIGATION_HEADERS = [
  "ObligationID", "PlanID", "Round", "MemberID", "DueDate", "RequiredAmount", "PaidAmount", "Balance", "Status",
  "PaidDate", "Note", "UpdatedAt", "RequestID"
];

var SAVINGS_GROUP_ROUND_HEADERS = [
  "RoundID", "PlanID", "Round", "RecipientMemberID", "ExpectedAmount", "CollectedAmount", "CollectionDate",
  "PayoutAmount", "PayoutDate", "Status", "Note", "UpdatedAt", "RequestID"
];

var SAVINGS_FIXED_INSTALLMENT_HEADERS = [
  "InstallmentID", "PlanID", "InstallmentNo", "DueDate", "RequiredAmount", "ActualAmount", "PaidDate",
  "Status", "TransactionRef", "Note", "UpdatedAt", "RequestID"
];

var SAVINGS_FLEX_DEPOSIT_HEADERS = [
  "DepositID", "PlanID", "Amount", "Date", "WalletID", "Account", "Description", "TransactionRef",
  "CreatedBy", "CreatedAt", "RequestID"
];

var SAVINGS_FLEX_WITHDRAWAL_HEADERS = [
  "WithdrawalID", "PlanID", "Amount", "Date", "WalletID", "Account", "Description", "TransactionRef",
  "CreatedBy", "CreatedAt", "RequestID"
];

// ---------------- PERMISSIONS (ROLE + WALLET-ACCESS MODEL) ----------------
//
// Admin: implicit full access (stored Permissions/WalletAccess are ignored).
// Sub-Admin / User: usable permissions REQUIRE at least one wallet in
// WalletAccess ("no wallet access = no usable permissions = deny everything").
//   - With wallet access they automatically get DEFAULT_WALLET_ACTIONS.
//   - Admin-granted extras live in ADDITIONAL_PERMISSIONS (stored in the
//     Permissions column); only these may be granted to a non-Admin user.
//   - ADMIN_ONLY_ACTIONS can never be granted to a non-Admin — the backend
//     strips/normalizes them out of effective permissions.

var DEFAULT_WALLET_ACTIONS = [
  "VIEW_DASHBOARD", "ADD_EXPENSE", "BANK_OPERATIONS",
  "VIEW_TRANSACTIONS", "VIEW_REPORTS", "VIEW_LOANS",
  "LOAN_GIVE", "LOAN_TAKE", "LOAN_PAYMENT",
  "VIEW_SAVINGS", "SAVINGS_GROUP", "SAVINGS_FIXED", "SAVINGS_FLEXIBLE",
];

// Admin-grantable additional permissions (Sub-Admin/User).
var ADDITIONAL_PERMISSIONS = [
  "ADD_INCOME", "TRANSFER_MONEY", "MANAGE_TRANSACTIONS",
  "ADD_WALLET", "EDIT_WALLET", "MANAGE_WALLET_STATUS",
  "MANAGE_LOANS", "MANAGE_LOAN_TRANSACTIONS",
  "MANAGE_SAVINGS", "MANAGE_SAVINGS_TRANSACTIONS",
  "ADD_USER", "EDIT_USER", "DELETE_USER", "MANAGE_USER_PERMISSIONS",
  "BACKUP_RESTORE", "VIEW_AUDIT_LOG", "MANAGE_CATEGORIES",
];

// Reserved for the Admin role — never stored/granted on non-Admin users.
// MANAGE_CURRENCIES lives here rather than in ADDITIONAL_PERMISSIONS: a currency
// row decides what a whole wallet can hold, so only an Admin may add one, and the
// existing sanitizer already strips this list out of every non-Admin's effective
// permissions. No new grant path is introduced.
var ADMIN_ONLY_ACTIONS = [
  "CHANGE_USER_ROLE", "CHANGE_USER_PASSWORD", "CREATE_ADMIN", "MANAGE_CURRENCIES",
  "MANAGE_ACCOUNTS",
];

var GRANTABLE_PERMISSIONS = ADDITIONAL_PERMISSIONS;

var ALL_PERMISSIONS = DEFAULT_WALLET_ACTIONS
  .concat(ADDITIONAL_PERMISSIONS)
  .concat(ADMIN_ONLY_ACTIONS);

// Old snake_case keys from deployments before the wallet-access model.
// Unmapped legacy keys (view_wallets, view_users, manage_settings) are dropped
// when normalized.
var LEGACY_TO_NEW = {
  "view_dashboard": "VIEW_DASHBOARD",
  "view_transactions": "VIEW_TRANSACTIONS",
  "add_expense": "ADD_EXPENSE",
  "manage_bank": "BANK_OPERATIONS",
  "view_reports": "VIEW_REPORTS",
  "add_income": "ADD_INCOME",
  "add_transfer": "TRANSFER_MONEY",
  "edit_transaction": "MANAGE_TRANSACTIONS",
  "delete_transaction": "MANAGE_TRANSACTIONS",
  "add_wallet": "ADD_WALLET",
  "edit_wallet": "EDIT_WALLET",
  "delete_wallet": "MANAGE_WALLET_STATUS",
  "manage_loan": "MANAGE_LOANS",
  "add_user": "ADD_USER",
  "edit_user": "EDIT_USER",
  "delete_user": "DELETE_USER",
  "change_user_role": "CHANGE_USER_ROLE",
  "manage_user_permissions": "MANAGE_USER_PERMISSIONS",
  "manage_user_wallet_access": "MANAGE_USER_PERMISSIONS",
  "create_backup": "BACKUP_RESTORE",
  "restore_backup": "BACKUP_RESTORE",
  "manage_categories": "MANAGE_CATEGORIES",
  "view_audit_log": "VIEW_AUDIT_LOG",
  "manage_currencies": "MANAGE_CURRENCIES",
  "manage_accounts": "MANAGE_ACCOUNTS",
};

// Seed for brand-new non-Admin users. Defaults are now IMPLICIT via wallet
// access, so nothing needs to be written at creation time.
var DEFAULT_PERMISSIONS_BY_ROLE = {
  "Sub-Admin": [],
  "User": [],
};

var WALLET_DATA_START_ROW = 8;
var VALID_ACCOUNTS = ["Cash", "Bank"];
var VALID_STORED_TXN_TYPES = ["Income", "Expense", "Transfer In", "Transfer Out",
  "Loan Out", "Loan In", "Loan Repaid", "Loan Payment",
  "Savings Deposit", "Savings Withdrawal", "Savings Contribution", "Savings Payout", "Savings Payment"];
var VALID_INCOMING_OPERATION_TYPES = ["Income", "Expense", "Transfer", "Bank Withdraw", "Bank Deposit", "Bank Operation"];

// Currency codes used to be hardcoded as VALID_CURRENCIES /
// LOAN_ALLOWED_CURRENCIES below. The list now lives in the Currencies sheet and
// is read through Currencies.gs (isValidCurrency_ / isLoanCurrency_), so a new
// currency is one row an Admin can add instead of a redeploy. Keep the legacy
// arrays ONLY as the seed order for a brand-new spreadsheet.

// Loan money lives in the wallet's transaction sheet under dedicated types.
// These types move wallet balances (see getAccountBalance_) but are NEVER
// counted as Income/Expense in reports or dashboard totals.
var LOAN_TXN_EFFECT = {
  "Loan Out": -1,      // GIVEN loan created (money leaves the user)
  "Loan Repaid": 1,    // GIVEN loan repayment (money returns to the user)
  "Loan In": 1,        // TAKEN loan created (money received)
  "Loan Payment": -1,  // TAKEN loan repayment (money paid back)
};

function isLoanEffectType_(type) { return LOAN_TXN_EFFECT[type] !== undefined; }

// The legacy Cash/Bank pair plus every registered financial account (see
// Accounts.gs). This stays the GLOBAL gate for stored values (backup import,
// loan/savings rows) where the wallet is not at hand; wallet-scoped checks use
// requireActiveAccount_ / isValidAccountForWallet_.
function isValidAccount_(account) {
  if (VALID_ACCOUNTS.indexOf(account) !== -1) return true;
  return typeof isKnownAccountId_ === "function" && isKnownAccountId_(account);
}

var VALID_WALLET_STATUSES = ["Active", "Inactive"];

// isValidCurrency_ and isLoanCurrency_ are defined in Currencies.gs against the
// Currencies sheet. They are intentionally NOT cached as a bare array here: the
// sheet read already goes through the 5-minute "currencies" cache, and a second
// copy of the allowlist in this file is exactly the drift that made the currency
// list hardcoded in the first place.

function isValidWalletStatus_(status) { return VALID_WALLET_STATUSES.indexOf(status) !== -1; }

function normalizeWalletName_(name) {
  var trimmed = String(name || "").trim();
  if (!trimmed || trimmed.length > 60) return null;
  return trimmed;
}

var MAX_TRANSACTION_AMOUNT = 999999999.99;

// Amounts are validated in integer cents (see Money.gs): a plain number or a
// plain decimal string with at most 2 decimals, greater than zero, within
// MAX_TRANSACTION_AMOUNT. Booleans, arrays, objects, hex/exponent literals and
// sub-cent values are rejected instead of being coerced by Number().
function isValidAmount_(amount) {
  return isValidAmountCents_(amount);
}

function isValidTransactionDate_(dateStr) {
  if (typeof dateStr !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  var parts = dateStr.split("-").map(Number);
  var y = parts[0], m = parts[1], d = parts[2];
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  var date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

// Normalize any date-ish cell value to a clean "yyyy-MM-dd" string so string
// comparisons are always reliable. Google Sheets stores date-formatted cells as
// real Date objects even when the original value was "2026-09-22"; String(Date)
// yields a long non-comparable text, which is why loan date checks must never
// compare the raw cell value. Falls back to the leading 10 chars on unknowns.
function normDateStr_(v) {
  if (v === undefined || v === null) return "";
  if (v instanceof Date && !isNaN(v.getTime())) {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }
  var s = String(v).trim();
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  var dmy = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/.exec(s);
  if (dmy) return dmy[3] + "-" + ("0" + dmy[2]).slice(-2) + "-" + ("0" + dmy[1]).slice(-2);
  var d = new Date(s);
  if (!isNaN(d.getTime())) return Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd");
  return s.slice(0, 10);
}

function getAccountBalance_(walletId, account, excludeTxnId) {
  var resolved = resolveWalletSheet_(walletId);
  if (!resolved) return 0;
  // Opening balance now lives on the financial account row (openingBalanceCentsFor_
  // lazily seeds the wallet's Cash/Bank accounts from the legacy columns on first
  // read, so this is still the same number for an untouched spreadsheet).
  var opening = openingBalanceCentsFor_(walletId, account);
  var txns = readWalletTransactions_(resolved.sheet, resolved.wallet);
  // Accumulate in integer cents so a long ledger cannot drift by fractions of a
  // cent; the caller still receives a normal 2-decimal number.
  var balanceCents = opening;
  txns.forEach(function (t) {
    if (t.Account !== account) return;
    if (excludeTxnId && String(t.ID) === String(excludeTxnId)) return;
    var amt = centsOf_(t.Amount);
    if (t.Type === "Income" || t.Type === "Transfer In" || t.Type === "Loan In" || t.Type === "Loan Repaid" || t.Type === "Savings Withdrawal" || t.Type === "Savings Payout") balanceCents += amt;
    else if (t.Type === "Expense" || t.Type === "Transfer Out" || t.Type === "Loan Out" || t.Type === "Loan Payment" || t.Type === "Savings Deposit" || t.Type === "Savings Contribution" || t.Type === "Savings Payment") balanceCents -= amt;
  });
  return amountOf_(balanceCents);
}

function requireSufficientBalance_(walletId, account, amount, excludeTxnId) {
  var requested = toCents_(amount);
  if (isNaN(requested)) return null; // amount validity is reported by the caller
  var available = getAccountBalance_(walletId, account, excludeTxnId);
  if (requested > toCents_(available)) {
    return err_("অপর্যাপ্ত ব্যালেন্স। " + account + " এ উপলব্ধ: " + amountOf_(toCents_(available)).toFixed(2), "INSUFFICIENT_BALANCE");
  }
  return null;
}

function nowStr() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd-MMM-yyyy HH:mm");
}

// Month-name lookup shared by the timestamp parser below.
var MONTH_INDEX_ = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

// Parse a stored cell to epoch milliseconds so records can be ordered by
// recency. nowStr() writes "dd-MMM-yyyy HH:mm"; normDateStr_() writes
// "yyyy-MM-dd". Returns NaN for missing/unrecognised values so callers can sort
// those last instead of guessing at an order.
function parseServerTimestamp_(v) {
  if (v instanceof Date && !isNaN(v.getTime())) return v.getTime();
  var s = String(v === undefined || v === null ? "" : v).trim();
  if (!s) return NaN;
  var dmy = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/.exec(s);
  if (dmy) {
    var mi = MONTH_INDEX_[dmy[2].toLowerCase()];
    if (mi === undefined) return NaN;
    return new Date(Number(dmy[3]), mi, Number(dmy[1]), Number(dmy[4] || 0), Number(dmy[5] || 0)).getTime();
  }
  var ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (ymd) return new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3])).getTime();
  var d = new Date(s);
  return isNaN(d.getTime()) ? NaN : d.getTime();
}

function err_(message, code) {
  var out = { status: "ERROR", message: message };
  if (code) out.code = code;
  return out;
}


// ---------------- LOW-LEVEL SHEET HELPERS ----------------

function ss_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function getOrCreateSheet_(name, headerRow) {
  var sheet = ss_().getSheetByName(name);
  if (!sheet) {
    sheet = ss_().insertSheet(name);
    if (headerRow) sheet.appendRow(headerRow);
  }
  return sheet;
}

function getUsersSheet_() { return getOrCreateSheet_("Users", USER_HEADERS); }
function getWalletsSheet_() { return getOrCreateSheet_("Wallets", WALLET_HEADERS); }
function getAuditSheet_() { return getOrCreateSheet_("Audit_Log", AUDIT_HEADERS); }
function getCategoriesSheet_() { return getOrCreateSheet_("Categories", CATEGORY_HEADERS); }
function getLoansSheet_() {
  var sheet = getOrCreateSheet_("Loans", LOAN_HEADERS);
  setDateColumnsAsText_(sheet, [9, 12, 13]); // LoanDate, DueDate, ReminderDate
  return sheet;
}
function getLoanPaymentsSheet_() {
  var sheet = getOrCreateSheet_("LoanPayments", LOAN_PAYMENT_HEADERS);
  setDateColumnsAsText_(sheet, [9]); // PaymentDate
  return sheet;
}
function getLoanAdditionsSheet_() {
  var sheet = getOrCreateSheet_("LoanAdditions", LOAN_ADDITION_HEADERS);
  ensureHeaderColumns_(sheet, LOAN_ADDITION_HEADERS);
  setDateColumnsAsText_(sheet, [6]); // Date
  return sheet;
}

// Appends any header columns added by a newer build onto an EXISTING sheet
// (e.g. LoanAdditions gained PersonID), so old spreadsheets stay compatible
// without a manual schema migration. No-ops when the headers already exist.
function ensureHeaderColumns_(sheet, headers) {
  var cols = Math.max(sheet.getLastColumn(), 1);
  var existing = sheet.getLastRow() >= 1 ? sheet.getRange(1, 1, 1, cols).getValues()[0] || [] : [];
  var present = {};
  for (var i = 0; i < existing.length; i++) present[String(existing[i])] = true;
  var add = [];
  for (var j = 0; j < headers.length; j++) {
    if (!present[String(headers[j])]) add.push([headers[j]]);
  }
  if (add.length) sheet.getRange(1, existing.length + 1, add.length, 1).setValues(add);
}

// Keep date cells as plain "yyyy-MM-dd" text: unless the column is formatted as
// text, Google Sheets silently converts a date-like string into a Date value
// and String(Date) becomes an unusable long text on read. Existing Date-valued
// cells are still normalized at read time by normDateStr_().
function setDateColumnsAsText_(sheet, columns) {
  try {
    for (var i = 0; i < columns.length; i++) {
      sheet.getRange(1, columns[i], sheet.getMaxRows(), 1).setNumberFormat("@");
    }
  } catch (e) { /* best effort */ }
}

function logAudit(username, action, target, details) {
  try {
    getAuditSheet_().appendRow([nowStr(), username || "system", action, target || "", details || ""]);
  } catch (e) { /* never let audit logging break a real action */ }
}

// ---------------- MIGRATION / SETUP (idempotent) ----------------

var DATABASE_READY_ = false;

// Legacy sheet names embed a currency code ("BDT_Personal_Transactions"), so
// the migration has to match a name against a currency code. It now reads the
// Currencies sheet rather than a hardcoded array, so a wallet sheet created
// before this change still migrates even if its code was later added.
function inferLegacyCurrency_(name) {
  var rows = currencyRows_();
  var matches = rows.filter(function (c) { return String(name).indexOf(c.code) !== -1; });
  return matches.length ? matches[0].code : null;
}

function setupDatabase() {
  if (DATABASE_READY_) return;
  var ss = ss_();

  // FAST PATH (5-min TTL, same window as the txns cache): full setup already
  // ran recently. Skip the 4 header-compare getValues() reads entirely —
  // just cheaply confirm the 4 base sheets still EXIST (self-repair a truly
  // missing one with FRESH headers). Invalidation: any restore/import or the
  // full path's own writes set/remove the flag (see Database.gs tail +
  // Backup.gs), so we can never serve a half-migrated schema.
  if (cacheGet_("schema", "v2") !== undefined) {
    ensureBaseSheetsExistOnly_(ss);
    DATABASE_READY_ = true;
    return;
  }

  // FAST PATH: schema already fully set up within this TTL window.
  // Skips the heavy header-compares (Users/Wallets getRange(...).getValues())
  // that the full path runs on every fresh instance. Only existence checks
  // (cheap getSheetByName) remain, so a genuinely-missing sheet still gets
  // recreated. Invalidation: any schema-writing path (restore/import/legacy
  // migrate) cacheRemove_("schema","v2") so the next load re-runs the full,
  // self-repairing setup. The write-invalidate discipline is the same one the
  // transaction cache already follows.
  if (cacheGet_("schema", "v2") === "READY") {
    ensureBaseSheetsExistOnly_(ss);
    DATABASE_READY_ = true;
    return;
  }

  var userSheet = ss.getSheetByName("Users");
  if (!userSheet) {
    userSheet = ss.insertSheet("Users");
    userSheet.appendRow(USER_HEADERS);
  } else {
    var firstRow = userSheet.getRange(1, 1, 1, Math.max(userSheet.getLastColumn(), 1)).getValues()[0];
    if (String(firstRow[1]) !== "FullName") {
      var lastRow = userSheet.getLastRow();
      var oldData = lastRow > 1 ? userSheet.getRange(2, 1, lastRow - 1, 4).getValues() : [];
      userSheet.clear();
      userSheet.appendRow(USER_HEADERS);
      oldData.forEach(function (r) {
        var username = r[0], pin = r[1], role = r[2], status = r[3];
        var ts2 = nowStr();
        var perms = role === "Admin" ? [] : (DEFAULT_PERMISSIONS_BY_ROLE[role] || DEFAULT_PERMISSIONS_BY_ROLE["User"]);
        var wallets = [];
        userSheet.appendRow([username, username, pin, role, status,
          JSON.stringify(perms), JSON.stringify(wallets), "", "", "", ts2, ts2, 0]);
      });
    } else {
      // Additive header migration: a Users sheet created before the
      // SessionVersion column existed gets the header appended in place. The
      // existing rows then read back as an empty cell, which
      // getSessionVersion_() normalises to 0.
      ensureHeaderColumns_(userSheet, USER_HEADERS);
    }
  }

  ensureInitialAdmin_(userSheet);

  var walletsSheet = ss.getSheetByName("Wallets");
  if (!walletsSheet) {
    walletsSheet = ss.insertSheet("Wallets");
    walletsSheet.appendRow(WALLET_HEADERS);
  } else {
    var existingHeaders = walletsSheet.getRange(1, 1, 1, walletsSheet.getLastColumn()).getValues()[0];
    if (existingHeaders.length < WALLET_HEADERS.length) {
      walletsSheet.getRange(1, 1, 1, WALLET_HEADERS.length).setValues([WALLET_HEADERS]);
    }
  }

  var existingWalletCount = walletsSheet.getLastRow() >= 2 ? walletsSheet.getLastRow() - 1 : 0;

  var LEGACY_WALLET_SHEETS = ["SAR_Transactions", "BDT_Personal_Transactions", "BDT_Family_Transactions"];
  var registeredSheetNames = walletsSheet.getLastRow() >= 2
    ? walletsSheet.getRange(2, 4, walletsSheet.getLastRow() - 1, 1).getValues().map(function (r) { return String(r[0]); })
    : [];

  LEGACY_WALLET_SHEETS.forEach(function (legacyName) {
    if (!ss.getSheetByName(legacyName)) return;

    var currency = inferLegacyCurrency_(legacyName);
    if (!currency) return;

    if (findWalletRowIndex_(legacyName) !== -1) return;
    if (registeredSheetNames.indexOf(legacyName) !== -1) return;

    var legacySheet = ss.getSheetByName(legacyName);
    var ts3 = nowStr();
    var wallet = {
      WalletID: legacyName,
      WalletName: legacyName.replace(/_Transactions$/, "").replace(/_/g, " ").trim() || legacyName,
      Currency: currency,
      SheetName: legacySheet.getSheetName(),
      Status: "Active",
      CreatedAt: ts3,
      UpdatedAt: ts3,
      OpeningCash: 0,
      OpeningBank: 0,
    };

    if (legacySheet.getLastRow() >= 1 && String(legacySheet.getRange(1, 1).getValue()).indexOf("====") !== 0) {
      legacySheet.insertRowsBefore(1, 6);
    }
    writeWalletHeaderBlock_(legacySheet, wallet);
    if (!legacySheet.getRange(7, 1).getValue()) {
      legacySheet.getRange(7, 1, 1, TRANSACTION_HEADERS.length).setValues([TRANSACTION_HEADERS]);
      legacySheet.getRange(7, 1, 1, TRANSACTION_HEADERS.length).setFontWeight("bold");
    }
    legacySheet.setFrozenRows(7);
    walletsSheet.appendRow([wallet.WalletID, wallet.WalletName, wallet.Currency, wallet.SheetName, "Active", ts3, ts3, 0, 0]);
    cacheRemove_("wallets", "all");
    logAudit("system", "Legacy wallet migrated", wallet.WalletID, wallet.WalletName + " (" + currency + ")");
  });

  var legacy = ss.getSheetByName("Transactions");
  if (legacy && legacy.getLastRow() > 1 && existingWalletCount === 0) {
    var rows = legacy.getDataRange().getValues();
    var movedAll = true;
    for (var i = 1; i < rows.length; i++) {
      var row = rows[i];
      var rowCurrency = String(row[3] || "SAR") === "SAR" ? "SAR" : "BDT";
      var targetWallet = findWalletByCurrency_(rowCurrency);
      var target = targetWallet ? resolveWalletSheet_(targetWallet.WalletID) : null;
      if (!target) { movedAll = false; continue; }
      target.sheet.appendRow(row);
    }
    if (movedAll) ss.deleteSheet(legacy);
  }

  getAuditSheet_();

  // Currency registry (idempotent, seeds itself on a spreadsheet that predates it)
  ensureCurrenciesSeeded_();

  // Account types + financial accounts (idempotent; seeds the two default types
  // and lazily back-fills every wallet's Cash/Bank accounts on first balance read)
  ensureAccountsSeeded_();
  // Back-fill on a spreadsheet that predates the module so the registry is
  // consistent immediately, not only after the first balance read.
  walletsRows_().forEach(function (r) { ensureWalletDefaultAccounts_(String(r[0])); });

// Loan / Hawlat tables (idempotent)
  getLoansSheet_();
  getLoanPaymentsSheet_();
  getLoanAdditionsSheet_();

  var categoriesSheet = getCategoriesSheet_();
  if (categoriesSheet.getLastRow() < 2) {
    var catTs = nowStr();
    var defaults = [
      ["Expense", "Food"], ["Expense", "Transport"], ["Expense", "Shopping"],
      ["Expense", "Mobile/Internet"], ["Expense", "Bills & Utility"], ["Expense", "Rent"], ["Expense", "Other"],
      ["Income", "Salary"], ["Income", "Business"], ["Income", "Remittance"], ["Income", "Other"],
    ];
    defaults.forEach(function (d) {
      categoriesSheet.appendRow([Utilities.getUuid(), d[1], d[0], "Active", catTs]);
    });
  }
  DATABASE_READY_ = true;
  cachePut_("schema", "v2", "READY", CACHE_TTL);
}

// Cheap existence-ONLY check + rebuild for the 4 base sheets (fast path).
// Called from setupDatabase_ when schema/v2 is already READY (first 5-min
// window). Deliberately does NOT re-compare the full header arrays again
// (that is the whole point of the fast path) - but it MUST still recreate a
// genuinely-missing base sheet with fresh headers, because restore drops
// sheets and we never want a missing Users/Wallets to wedge every login.
// NOTE: this uses getOrCreateBaseSheetOnly_ (full headers), NOT
// ensureBaseSheetsExistOnly_ - both names appear in the audit; keep them
// in sync. Invalidation on any restore path is handled by the caller
// (Backup.gs) via cacheRemove_("schema","v2").
function ensureBaseSheetsExistOnly_(ss) {
  if (!ss) ss = ss_();
  var base = [
    ["Users", USER_HEADERS],
    ["Wallets", WALLET_HEADERS],
    ["Audit_Log", AUDIT_HEADERS],
    ["Categories", CATEGORY_HEADERS],
    ["Currencies", CURRENCY_HEADERS],
    ["AccountTypes", ACCOUNT_TYPE_HEADERS],
    ["FinancialAccounts", FINANCIAL_ACCOUNT_HEADERS],
    ["SavingsPlans", SAVINGS_PLAN_HEADERS],
    ["SavingsGroupMembers", SAVINGS_GROUP_MEMBER_HEADERS],
    ["SavingsGroupObligations", SAVINGS_GROUP_OBLIGATION_HEADERS],
    ["SavingsGroupRounds", SAVINGS_GROUP_ROUND_HEADERS],
    ["SavingsFixedInstallments", SAVINGS_FIXED_INSTALLMENT_HEADERS],
    ["SavingsFlexDeposits", SAVINGS_FLEX_DEPOSIT_HEADERS],
    ["SavingsFlexWithdrawals", SAVINGS_FLEX_WITHDRAWAL_HEADERS],
  ];
  base.forEach(function (d) {
    if (!ss.getSheetByName(d[0])) {
      var sh = ss.insertSheet(d[0]);
      sh.appendRow(d[1]);
    }
  });
}
