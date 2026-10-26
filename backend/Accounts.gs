// ---------------- ACCOUNTS ----------------
//
// Accounts had been a hardcoded pair: the string "Cash" or "Bank" written
// directly into every transaction row, with VALID_ACCOUNTS in Database.gs as the
// only allowlist and the wallet's OpeningCash / OpeningBank columns as the only
// opening balances. Adding "STC Pay", "bKash" or a second bank meant editing the
// schema, the validation, the reports and every dropdown.
//
// The model is now the same shape the currency registry already uses:
//
//   AccountTypes      - what KINDS of account exist ("Cash", "Bank", ...). A
//                       type is global (one Cash type for every wallet), decides
//                       which currencies it may be used with, and is retired
//                       rather than deleted once money references it.
//   FinancialAccounts - one real account inside one wallet (Wallet "W001" has a
//                       "Cash" account and an "Islami Bank" account). Each row
//                       carries that account's OWN opening balance and is the
//                       ID stored on every transaction / loan / savings row.
//
// BACKWARD COMPATIBILITY. Legacy data stores the literal strings "Cash" and
// "Bank" on every row. Rather than rewrite history, every wallet is lazily
// seeded with two financial accounts whose AccountID is exactly "Cash" and
// "Bank" and whose opening balance is copied from the wallet's OpeningCash /
// OpeningBank columns. Old rows therefore keep matching, and a brand-new account
// that simply reuses the ID "Cash" cannot collide because the seed runs first.
//
// The seeded IDs are intentionally human-readable rather than generated: an ID
// that is safe to show in an audit row and stable to migrate is worth more here
// than a UUID, and the per-wallet uniqueness rule keeps them unambiguous.

var ACCOUNT_TYPE_HEADERS = [
  "AccountTypeID", "Name", "Code", "Icon", "Description",
  "ApplicableCurrencies", "Status", "CreatedAt", "UpdatedAt",
];

var FINANCIAL_ACCOUNT_HEADERS = [
  "AccountID", "WalletID", "AccountTypeID", "Name", "Currency",
  "OpeningBalance", "Status", "CreatedAt", "UpdatedAt",
];

var ACCOUNT_TYPE_STATUS_ACTIVE = "Active";
var ACCOUNT_TYPE_STATUS_INACTIVE = "Inactive";
var VALID_ACCOUNT_TYPE_STATUSES = [ACCOUNT_TYPE_STATUS_ACTIVE, ACCOUNT_TYPE_STATUS_INACTIVE];

var ACCOUNT_STATUS_ACTIVE = "Active";
var ACCOUNT_STATUS_INACTIVE = "Inactive";
var VALID_ACCOUNT_STATUSES = [ACCOUNT_STATUS_ACTIVE, ACCOUNT_STATUS_INACTIVE];

// Seed for a spreadsheet that predates this module. Kept to the two accounts the
// app has always had so the migration is invisible; admins add their own.
var DEFAULT_ACCOUNT_TYPES = [
  { id: "AT-CASH", name: "Cash", code: "CASH", icon: "banknote", description: "Physical cash in hand" },
  { id: "AT-BANK", name: "Bank", code: "BANK", icon: "landmark", description: "Bank account" },
];

// The two financial accounts every wallet is guaranteed to have. "openingField"
// names the legacy wallet column their opening balance is copied from.
var DEFAULT_WALLET_ACCOUNTS = [
  { accountId: "Cash", typeId: "AT-CASH", name: "Cash", openingField: "OpeningCash" },
  { accountId: "Bank", typeId: "AT-BANK", name: "Bank", openingField: "OpeningBank" },
];

var ACCOUNT_CODE_RE_ = /^[A-Z0-9_]{2,20}$/;
var MAX_ACCOUNT_NAME_LENGTH = 60;
var MAX_ACCOUNT_ICON_LENGTH = 40;
var MAX_ACCOUNT_DESCRIPTION_LENGTH = 200;

function getAccountTypesSheet_() { return getOrCreateSheet_("AccountTypes", ACCOUNT_TYPE_HEADERS); }
function getFinancialAccountsSheet_() { return getOrCreateSheet_("FinancialAccounts", FINANCIAL_ACCOUNT_HEADERS); }

function isValidAccountTypeStatus_(status) { return VALID_ACCOUNT_TYPE_STATUSES.indexOf(status) !== -1; }
function isValidAccountStatus_(status) { return VALID_ACCOUNT_STATUSES.indexOf(status) !== -1; }

// Default seed accounts (Cash/Bank) are auto-recreated by
// ensureWalletDefaultAccounts_, so they must never be hard-deleted — only
// retired. Otherwise a delete followed by any read would silently resurrect
// them as ACTIVE.
function isDefaultWalletAccountId_(accountId) {
  var id = String(accountId || "").trim();
  return DEFAULT_WALLET_ACCOUNTS.some(function (d) { return d.accountId === id; });
}

function normalizeAccountCode_(code) {
  var s = String(code === undefined || code === null ? "" : code).trim().toUpperCase();
  return ACCOUNT_CODE_RE_.test(s) ? s : null;
}

function normalizeAccountName_(name) {
  var s = String(name === undefined || name === null ? "" : name).trim();
  if (!s || s.length > MAX_ACCOUNT_NAME_LENGTH) return null;
  return s;
}

function normalizeAccountIcon_(icon) {
  var s = String(icon === undefined || icon === null ? "" : icon).trim();
  if (s.length > MAX_ACCOUNT_ICON_LENGTH) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(s)) return null;
  return s;
}

function normalizeAccountDescription_(desc) {
  var s = String(desc === undefined || desc === null ? "" : desc).trim();
  if (s.length > MAX_ACCOUNT_DESCRIPTION_LENGTH) return null;
  return s;
}

// ApplicableCurrencies is a comma-separated list of currency codes. An EMPTY
// list is the "any currency" default so adding a new currency does not silently
// disable every account type that never opted into a restriction.
function normalizeApplicableCurrencies_(value) {
  if (value === undefined || value === null || value === "") return { codes: [], error: null };
  var raw = Array.isArray(value) ? value : String(value).split(",");
  var out = [];
  for (var i = 0; i < raw.length; i++) {
    var item = String(raw[i] || "").trim();
    if (!item) continue;
    var code = normalizeCurrencyCode_(item);
    if (!code) return { codes: [], error: item };
    if (out.indexOf(code) === -1) out.push(code);
  }
  return { codes: out, error: null };
}

// ---------------- READS ----------------

// Cached under "accountTypes" for the same 5-minute window as currencies: the
// sheet changes rarely and is read on every account render.
function accountTypeRows_() {
  var cached = cacheGet_("accountTypes", "all");
  if (cached !== undefined) return cached;

  var sheet = getAccountTypesSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    seedAccountTypes_(sheet);
    lastRow = sheet.getLastRow();
  }

  var rows = [];
  if (lastRow >= 2) {
    var values = sheet.getRange(2, 1, lastRow - 1, ACCOUNT_TYPE_HEADERS.length).getValues();
    values.forEach(function (r) {
      var id = String(r[0] || "").trim();
      if (!id) return;
      rows.push({
        AccountTypeID: id,
        Name: String(r[1] || "").trim(),
        Code: String(r[2] || "").trim().toUpperCase(),
        Icon: String(r[3] === undefined || r[3] === null ? "" : r[3]).trim(),
        Description: String(r[4] === undefined || r[4] === null ? "" : r[4]).trim(),
        ApplicableCurrencies: String(r[5] === undefined || r[5] === null ? "" : r[5]).trim(),
        Status: isValidAccountTypeStatus_(String(r[6])) ? String(r[6]) : ACCOUNT_TYPE_STATUS_ACTIVE,
        CreatedAt: String(r[7] || ""),
        UpdatedAt: String(r[8] || ""),
      });
    });
  }
  cachePut_("accountTypes", "all", rows, CACHE_TTL);
  return rows;
}

function seedAccountTypes_(sheet) {
  var ts = nowStr();
  DEFAULT_ACCOUNT_TYPES.forEach(function (t) {
    sheet.appendRow([t.id, t.name, t.code, t.icon, t.description, "", ACCOUNT_TYPE_STATUS_ACTIVE, ts, ts]);
  });
}

// Financial accounts are cached separately from account types because they are
// written lazily per wallet (the self-healing seed) far more often than types.
function financialAccountRows_() {
  var cached = cacheGet_("financialAccounts", "all");
  if (cached !== undefined) return cached;

  var sheet = getFinancialAccountsSheet_();
  var lastRow = sheet.getLastRow();
  var rows = [];
  if (lastRow >= 2) {
    var values = sheet.getRange(2, 1, lastRow - 1, FINANCIAL_ACCOUNT_HEADERS.length).getValues();
    values.forEach(function (r) {
      var id = String(r[0] || "").trim();
      if (!id) return;
      rows.push({
        AccountID: id,
        WalletID: String(r[1] || "").trim(),
        AccountTypeID: String(r[2] || "").trim(),
        Name: String(r[3] || "").trim(),
        Currency: String(r[4] || "").trim().toUpperCase(),
        OpeningBalance: r[5],
        Status: isValidAccountStatus_(String(r[6])) ? String(r[6]) : ACCOUNT_STATUS_ACTIVE,
        CreatedAt: String(r[7] || ""),
        UpdatedAt: String(r[8] || ""),
      });
    });
  }
  cachePut_("financialAccounts", "all", rows, CACHE_TTL);
  return rows;
}

function findAccountTypeById_(typeId) {
  var target = String(typeId || "").trim();
  if (!target) return null;
  var rows = accountTypeRows_();
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].AccountTypeID === target) return rows[i];
  }
  return null;
}

function findAccountTypeRowIndex_(typeId) {
  var target = String(typeId || "").trim();
  if (!target) return -1;
  var sheet = getAccountTypesSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0] || "").trim() === target) return i + 2;
  }
  return -1;
}

// A financial account is identified by (WalletID, AccountID). AccountID is only
// unique WITHIN a wallet, which is what keeps the legacy "Cash"/"Bank" strings
// migration-safe.
function findFinancialAccountRow_(walletId, accountId) {
  var w = String(walletId || "").trim();
  var a = String(accountId || "").trim();
  if (!w || !a) return null;
  var sheet = getFinancialAccountsSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  var values = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][1] || "").trim() === w && String(values[i][0] || "").trim() === a) {
      return { rowIndex: i + 2, accountId: a, walletId: w };
    }
  }
  return null;
}

function findFinancialAccountById_(walletId, accountId) {
  var w = String(walletId || "").trim();
  var a = String(accountId || "").trim();
  if (!w || !a) return null;
  var rows = financialAccountRows_();
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].WalletID === w && rows[i].AccountID === a) return rows[i];
  }
  return null;
}

function findFinancialAccountRowIndex_(walletId, accountId) {
  var hit = findFinancialAccountRow_(walletId, accountId);
  return hit ? hit.rowIndex : -1;
}

// Display name for an account, falling back to the raw ID so vendor text on a
// transfer row never renders as an empty string for an unseeded account.
function accountNameFor_(walletId, accountId) {
  ensureWalletDefaultAccounts_(walletId);
  var account = findFinancialAccountById_(walletId, accountId);
  return account ? account.Name : String(accountId || "");
}

// ---------------- SEEDING / MIGRATION ----------------

// Every wallet must own at least the legacy "Cash" and "Bank" accounts. This is
// idempotent and covers partial states (a wallet that somehow gained a custom
// account but never got the defaults) because it checks each default ID
// independently rather than "does this wallet have any account yet".
function ensureWalletDefaultAccounts_(walletId) {
  var wallet = getWalletById_(walletId);
  if (!wallet) return;

  var rows = financialAccountRows_();
  var present = {};
  rows.forEach(function (a) {
    if (a.WalletID === String(walletId)) present[a.AccountID] = true;
  });

  var missing = DEFAULT_WALLET_ACCOUNTS.filter(function (d) { return !present[d.accountId]; });
  if (!missing.length) return;

  var sheet = getFinancialAccountsSheet_();
  var ts = nowStr();
  missing.forEach(function (d) {
    var opening = centsOf_(wallet[d.openingField]);
    sheet.appendRow([
      d.accountId, wallet.WalletID, d.typeId, d.name, wallet.Currency,
      amountOf_(opening), ACCOUNT_STATUS_ACTIVE, ts, ts,
    ]);
  });
  invalidateAccounts_();
}

// The opening balance of a financial account is authoritative on its own row.
// The legacy wallet columns are only ever read once, at seed time.
function openingBalanceCentsFor_(walletId, accountId) {
  ensureWalletDefaultAccounts_(walletId);
  var account = findFinancialAccountById_(walletId, accountId);
  if (account) return centsOf_(account.OpeningBalance);
  // Fallback for a legacy wallet whose defaults could not be seeded (e.g. the
  // wallets sheet is mid-restore). Never worse than the old behaviour.
  var wallet = getWalletById_(walletId);
  if (!wallet) return 0;
  if (accountId === "Cash") return centsOf_(wallet.OpeningCash);
  if (accountId === "Bank") return centsOf_(wallet.OpeningBank);
  return 0;
}

// ---------------- QUERIES ----------------

// Active accounts a wallet may post to, in stable (creation) order. Used by the
// transaction forms and by wallet-scoped validation.
function financialAccountsForWallet_(walletId, opts) {
  ensureWalletDefaultAccounts_(walletId);
  var includeInactive = !!(opts && opts.includeInactive);
  return financialAccountRows_()
    .filter(function (a) {
      if (a.WalletID !== String(walletId)) return false;
      if (!includeInactive && a.Status !== ACCOUNT_STATUS_ACTIVE) return false;
      return true;
    })
    .map(function (a) {
      var type = findAccountTypeById_(a.AccountTypeID);
      return {
        AccountID: a.AccountID,
        WalletID: a.WalletID,
        AccountTypeID: a.AccountTypeID,
        Name: a.Name,
        Currency: a.Currency,
        OpeningBalance: amountOf_(centsOf_(a.OpeningBalance)),
        Status: a.Status,
        AccountTypeName: type ? type.Name : a.Name,
        AccountTypeCode: type ? type.Code : "",
        Icon: type ? type.Icon : "",
      };
    });
}

// A type may be restricted to a set of currencies. An empty list means "all".
function accountTypeEligibleForCurrency_(type, currency) {
  if (!type) return false;
  var codes = normalizeApplicableCurrencies_(type.ApplicableCurrencies).codes;
  if (!codes.length) return true;
  return codes.indexOf(String(currency || "").toUpperCase()) !== -1;
}

// Global existence check used by isValidAccount_ (Database.gs). Accepts BOTH
// active and inactive rows so deactivating an account never invalidates the
// historical rows that reference it.
function isKnownAccountId_(accountId) {
  var target = String(accountId || "").trim();
  if (!target) return false;
  var rows = financialAccountRows_();
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].AccountID === target) return true;
  }
  return false;
}

// Wallet-scoped validity: the account must exist in THIS wallet. This is the
// check the transaction flows will move to; isValidAccount_ stays the global
// legacy gate so nothing regresses before those callers are updated.
function isValidAccountForWallet_(walletId, accountId) {
  if (VALID_ACCOUNTS.indexOf(String(accountId)) !== -1) {
    // Legacy seeds always exist once the wallet does; seeding is lazy, so ask
    // for it explicitly rather than trusting a possibly-stale read.
    ensureWalletDefaultAccounts_(walletId);
  }
  return !!findFinancialAccountById_(walletId, accountId);
}

function requireActiveAccount_(walletId, accountId) {
  ensureWalletDefaultAccounts_(walletId);
  var account = findFinancialAccountById_(walletId, accountId);
  if (!account) return err_("এই Wallet-এ অ্যাকাউন্টটি পাওয়া যায়নি।", "ACCOUNT_NOT_FOUND");
  if (account.Status !== ACCOUNT_STATUS_ACTIVE) {
    return err_("এই অ্যাকাউন্টটি নিষ্ক্রিয় (deactivated) — নতুন লেনদেন যোগ করা যাবে না।", "ACCOUNT_INACTIVE");
  }
  return null;
}

// ---------------- IN USE / INVALIDATION ----------------

function accountTypeInUse_(typeId) {
  var target = String(typeId || "");
  // A wallet that has never had a balance read may not be seeded yet, so make
  // sure every wallet's defaults exist before asking whether the type is used.
  walletsRows_().forEach(function (r) { ensureWalletDefaultAccounts_(String(r[0])); });
  return financialAccountRows_().some(function (a) { return a.AccountTypeID === target; });
}

// True when the wallet's account has any money row referencing it. Used to
// decide whether it may be hard-deleted (it never is) or only retired.
function financialAccountInUse_(walletId, accountId) {
  var resolved = resolveWalletSheet_(walletId);
  if (!resolved) return false;
  var txns = readWalletTransactions_(resolved.sheet, resolved.wallet);
  for (var i = 0; i < txns.length; i++) {
    if (String(txns[i].Account) === String(accountId)) return true;
  }
  return false;
}

// Any accounts write must drop both namespaces; the type namespace feeds the
// account dropdowns and the account namespace feeds balances.
//
// Both namespaces only ever cache under the key "all". Remove that exact key
// explicitly: cacheClear_() can only reach script-cache keys written earlier in
// the SAME execution, so on a cold execution (the usual case for a write) it
// would leave the stale list cached and a just-added account would stay
// invisible in every dropdown for up to CACHE_TTL. cacheRemove_() addresses the
// deterministic key, so it always reaches the script cache. cacheClear_() is
// kept as a safety net for any future extra key in these namespaces.
function invalidateAccounts_() {
  cacheRemove_("accountTypes", "all");
  cacheRemove_("financialAccounts", "all");
  cacheClear_("accountTypes");
  cacheClear_("financialAccounts");
  cacheRemove_("schema", "v2");
}

function generateAccountTypeId_() {
  var maxNum = 0;
  accountTypeRows_().forEach(function (t) {
    var m = /^AT(\d+)$/.exec(String(t.AccountTypeID));
    if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
  });
  var next = maxNum + 1;
  return "AT" + ("00" + next).slice(-3);
}

// Generated IDs are unique across the WHOLE registry (not just within a wallet)
// so the same "FA001" never appears in two wallets and confuse an admin reading
// an audit row. Matching is still per-wallet, but uniqueness keeps support sane.
function generateFinancialAccountId_(walletId) {
  var maxNum = 0;
  financialAccountRows_().forEach(function (a) {
    var m = /^FA(\d+)$/.exec(String(a.AccountID));
    if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
  });
  var next = maxNum + 1;
  return "FA" + ("00" + next).slice(-3);
}

// ---------------- SETUP HOOK ----------------

// Called from setupDatabase so the sheets exist (and the two default types are
// seeded) on a normal login rather than lazily on the first account read.
function ensureAccountsSeeded_() {
  getAccountTypesSheet_();
  getFinancialAccountsSheet_();
  accountTypeRows_();
}

// ---------------- ACTIONS ----------------

// Readable by every signed-in user: the account list is needed to render and to
// choose where money goes, exactly like the currency list.
function getAccountTypes(username) {
  setupDatabase();
  var list = accountTypeRows_().map(function (t) {
    return {
      AccountTypeID: t.AccountTypeID,
      Name: t.Name,
      Code: t.Code,
      Icon: t.Icon,
      Description: t.Description,
      ApplicableCurrencies: normalizeApplicableCurrencies_(t.ApplicableCurrencies).codes,
      Status: t.Status,
    };
  });
  return { status: "SUCCESS", accountTypes: list };
}

function getFinancialAccounts(username, walletId) {
  setupDatabase();
  var accessErr = requireWalletAccess_(username, walletId);
  if (accessErr) return accessErr;
  // Inactive rows are included: the management screen (Settings) needs to show
  // them so a retired account can be reactivated. Callers that only want
  // postable accounts filter by Status client-side (getWalletAccounts).
  return { status: "SUCCESS", accounts: financialAccountsForWallet_(walletId, { includeInactive: true }) };
}

function addAccountType(data, adminUsername) {
  setupDatabase();
  var perm = requirePermission_(adminUsername, "MANAGE_ACCOUNTS");
  if (perm) return perm;

  var name = normalizeAccountName_(data && data.name);
  if (!name) return err_("অ্যাকাউন্ট টাইপের নাম আবশ্যক এবং " + MAX_ACCOUNT_NAME_LENGTH + " অক্ষরের বেশি হতে পারবে না।", "INVALID_ACCOUNT_NAME");

  var code = normalizeAccountCode_(data && data.code);
  if (!code) return err_("Code ২-২০ অক্ষরের A-Z, 0-9 বা _ হতে হবে।", "INVALID_ACCOUNT_CODE");

  var icon = normalizeAccountIcon_(data && data.icon);
  if (icon === null) return err_("Icon অনেক বড় বা অবৈধ।", "INVALID_ACCOUNT_ICON");

  var description = normalizeAccountDescription_(data && data.description);
  if (description === null) return err_("Description অনেক বড়।", "INVALID_ACCOUNT_DESCRIPTION");

  var currencies = normalizeApplicableCurrencies_(data && data.applicableCurrencies);
  if (currencies.error) return err_("অবৈধ কারেন্সি: " + currencies.error, "INVALID_ACCOUNT_CURRENCY");

  var duplicate = accountTypeRows_().some(function (t) {
    return t.Code === code || t.Name.toLowerCase() === name.toLowerCase();
  });
  if (duplicate) return err_("এই নাম বা code নিয়ে একটি Account Type আগে থেকেই আছে।", "ACCOUNT_TYPE_EXISTS");

  var id = generateAccountTypeId_();
  var ts = nowStr();
  getAccountTypesSheet_().appendRow([
    id, name, code, icon || "", description || "",
    currencies.codes.join(","), ACCOUNT_TYPE_STATUS_ACTIVE, ts, ts,
  ]);
  invalidateAccounts_();
  logAudit(adminUsername, "Account type added", id, name + " (" + code + ")");
  return { status: "SUCCESS", message: name + " account type added.", accountTypeId: id };
}

function updateAccountType(accountTypeId, data, adminUsername) {
  setupDatabase();
  var perm = requirePermission_(adminUsername, "MANAGE_ACCOUNTS");
  if (perm) return perm;
  if (!data || typeof data !== "object") return validationError_("Invalid request.");

  var target = String(accountTypeId || "").trim();
  var rowIdx = findAccountTypeRowIndex_(target);
  if (rowIdx === -1) return err_("Account Type পাওয়া যায়নি!", "ACCOUNT_TYPE_NOT_FOUND");

  var current = findAccountTypeById_(target);
  var next = {
    name: current.Name,
    code: current.Code,
    icon: current.Icon,
    description: current.Description,
    applicableCurrencies: current.ApplicableCurrencies,
    status: current.Status,
  };

  if (data.name !== undefined) {
    var name = normalizeAccountName_(data.name);
    if (!name) return err_("অ্যাকাউন্ট টাইপের নাম আবশ্যক এবং " + MAX_ACCOUNT_NAME_LENGTH + " অক্ষরের বেশি হতে পারবে না।", "INVALID_ACCOUNT_NAME");
    next.name = name;
  }
  if (data.code !== undefined) {
    var code = normalizeAccountCode_(data.code);
    if (!code) return err_("Code ২-২০ অক্ষরের A-Z, 0-9 বা _ হতে হবে।", "INVALID_ACCOUNT_CODE");
    next.code = code;
  }
  if (data.icon !== undefined) {
    var icon = normalizeAccountIcon_(data.icon);
    if (icon === null) return err_("Icon অনেক বড় বা অবৈধ।", "INVALID_ACCOUNT_ICON");
    next.icon = icon;
  }
  if (data.description !== undefined) {
    var description = normalizeAccountDescription_(data.description);
    if (description === null) return err_("Description অনেক বড়।", "INVALID_ACCOUNT_DESCRIPTION");
    next.description = description;
  }
  if (data.applicableCurrencies !== undefined) {
    var currencies = normalizeApplicableCurrencies_(data.applicableCurrencies);
    if (currencies.error) return err_("অবৈধ কারেন্সি: " + currencies.error, "INVALID_ACCOUNT_CURRENCY");
    next.applicableCurrencies = currencies.codes.join(",");
  }
  if (data.status !== undefined) {
    if (!isValidAccountTypeStatus_(data.status)) return err_("Invalid status.", "INVALID_STATUS");
    next.status = data.status;
  }

  // Name/code uniqueness must ignore this very row.
  var clash = accountTypeRows_().some(function (t) {
    if (t.AccountTypeID === target) return false;
    return t.Code === next.code || t.Name.toLowerCase() === next.name.toLowerCase();
  });
  if (clash) return err_("এই নাম বা code নিয়ে একটি Account Type আগে থেকেই আছে।", "ACCOUNT_TYPE_EXISTS");

  var sheet = getAccountTypesSheet_();
  sheet.getRange(rowIdx, 2, 1, 7).setValues([[
    next.name, next.code, next.icon, next.description,
    next.applicableCurrencies, next.status, nowStr(),
  ]]);
  invalidateAccounts_();
  logAudit(adminUsername, "Account type updated", target, JSON.stringify(next));
  return { status: "SUCCESS", message: target + " account type updated." };
}

// Deleting a type is only safe when no financial account uses it. Otherwise the
// row is retired so existing accounts keep rendering.
function deleteAccountType(accountTypeId, adminUsername) {
  setupDatabase();
  var perm = requirePermission_(adminUsername, "MANAGE_ACCOUNTS");
  if (perm) return perm;

  var target = String(accountTypeId || "").trim();
  var rowIdx = findAccountTypeRowIndex_(target);
  if (rowIdx === -1) return err_("Account Type পাওয়া যায়নি!", "ACCOUNT_TYPE_NOT_FOUND");

  if (accountTypeInUse_(target)) {
    return err_("এই Account Type ব্যবহার করে আছে এক বা একাধিক অ্যাকাউন্ট — মুছে ফেলা যাবে না।", "ACCOUNT_TYPE_IN_USE");
  }

  getAccountTypesSheet_().deleteRow(rowIdx);
  invalidateAccounts_();
  logAudit(adminUsername, "Account type deleted", target, "");
  return { status: "SUCCESS", message: target + " account type deleted." };
}

function addFinancialAccount(data, adminUsername) {
  setupDatabase();
  if (!data || typeof data !== "object") return validationError_("Invalid request.");

  var walletId = String(data.walletId || "").trim();
  if (!walletId) return err_("Wallet নির্বাচন করুন।", "WALLET_REQUIRED");
  var perm = authorize_(adminUsername, "ADD_WALLET", [walletId]);
  if (perm) return perm;

  var wallet = getWalletById_(walletId);
  if (!wallet) return err_("Wallet পাওয়া যায়নি!", "WALLET_NOT_FOUND");
  if (String(wallet.Status) !== "Active") return err_("এই Wallet নিষ্ক্রিয় — নতুন অ্যাকাউন্ট যোগ করা যাবে না।", "WALLET_INACTIVE");
  // Seed the wallet's defaults first so the name-uniqueness check below sees the
  // guaranteed Cash/Bank rows (and never lets a "Cash" duplicate slip in).
  ensureWalletDefaultAccounts_(walletId);

  var type = findAccountTypeById_(data.accountTypeId);
  if (!type) return err_("Account Type পাওয়া যায়নি!", "ACCOUNT_TYPE_NOT_FOUND");
  if (type.Status !== ACCOUNT_TYPE_STATUS_ACTIVE) return err_("এই Account Type নিষ্ক্রিয়।", "ACCOUNT_TYPE_INACTIVE");
  if (!accountTypeEligibleForCurrency_(type, wallet.Currency)) {
    return err_("এই Account Type " + wallet.Currency + " কারেন্সির জন্য প্রযোজ্য নয়।", "ACCOUNT_TYPE_CURRENCY_MISMATCH");
  }

  var name = normalizeAccountName_(data.name) || type.Name;
  var duplicate = financialAccountRows_().some(function (a) {
    return a.WalletID === walletId && a.Name.toLowerCase() === name.toLowerCase();
  });
  if (duplicate) return err_("এই Wallet-এ এই নামে একটি অ্যাকাউন্ট আগে থেকেই আছে।", "ACCOUNT_EXISTS");

  var openingCents = openingAmountCents_(data.openingBalance);
  if (isNaN(openingCents)) return err_(amountError_(data.openingBalance), "INVALID_AMOUNT");

  var existingIds = {};
  financialAccountRows_().forEach(function (a) { if (a.WalletID === walletId) existingIds[a.AccountID] = true; });

  var id = generateFinancialAccountId_(walletId);
  var ts = nowStr();
  getFinancialAccountsSheet_().appendRow([
    id, walletId, type.AccountTypeID, name, wallet.Currency,
    amountOf_(openingCents), ACCOUNT_STATUS_ACTIVE, ts, ts,
  ]);
  invalidateAccounts_();
  logAudit(adminUsername, "Financial account added", walletId + "/" + id, name + " (" + type.Name + ")");
  return { status: "SUCCESS", message: name + " account added.", accountId: id };
}

function updateFinancialAccount(accountId, data, adminUsername) {
  setupDatabase();
  if (!data || typeof data !== "object") return validationError_("Invalid request.");

  var walletId = String(data.walletId || (data.existing && data.existing.walletId) || "").trim();
  var target = String(accountId || "").trim();
  // Resolve the wallet from the (walletId, accountId) pair when only the ID is
  // supplied, so an admin editing a seeded "Cash"/"Bank" account still scopes.
  var existing = null;
  if (!walletId) {
    existing = financialAccountRows_().filter(function (a) { return a.AccountID === target; })[0] || null;
    walletId = existing ? existing.WalletID : "";
  }
  if (!walletId) return err_("Wallet আবশ্যক।", "WALLET_REQUIRED");

  var perm = authorize_(adminUsername, "EDIT_WALLET", [walletId]);
  if (perm) return perm;
  ensureWalletDefaultAccounts_(walletId);

  var current = findFinancialAccountById_(walletId, target);
  if (!current) return err_("অ্যাকাউন্ট পাওয়া যায়নি!", "ACCOUNT_NOT_FOUND");

  var next = { name: current.Name, status: current.Status };

  if (data.name !== undefined) {
    var name = normalizeAccountName_(data.name);
    if (!name) return err_("অ্যাকাউন্টের নাম আবশ্যক এবং " + MAX_ACCOUNT_NAME_LENGTH + " অক্ষরের বেশি হতে পারবে না।", "INVALID_ACCOUNT_NAME");
    var clash = financialAccountRows_().some(function (a) {
      return a.WalletID === walletId && a.AccountID !== target && a.Name.toLowerCase() === name.toLowerCase();
    });
    if (clash) return err_("এই Wallet-এ এই নামে একটি অ্যাকাউন্ট আগে থেকেই আছে।", "ACCOUNT_EXISTS");
    next.name = name;
  }
  if (data.status !== undefined) {
    if (!isValidAccountStatus_(data.status)) return err_("Invalid status.", "INVALID_STATUS");
    next.status = data.status;
  }

  // Guard the last active account: deactivating every account would leave the
  // wallet unable to record anything, with no way back through the UI.
  if (next.status !== ACCOUNT_STATUS_ACTIVE && current.Status === ACCOUNT_STATUS_ACTIVE) {
    var activeCount = financialAccountRows_().filter(function (a) {
      return a.WalletID === walletId && a.Status === ACCOUNT_STATUS_ACTIVE;
    }).length;
    if (activeCount <= 1) {
      return err_("Wallet-এ কমপক্ষে একটি সক্রিয় অ্যাকাউন্ট থাকতে হবে।", "LAST_ACCOUNT");
    }
  }

  var rowIdx = findFinancialAccountRowIndex_(walletId, target);
  var sheet = getFinancialAccountsSheet_();
  sheet.getRange(rowIdx, 4, 1, 1).setValue(next.name);
  sheet.getRange(rowIdx, 7, 1, 2).setValues([[next.status, nowStr()]]);
  invalidateAccounts_();
  logAudit(adminUsername, "Financial account updated", walletId + "/" + target, JSON.stringify(next));
  return { status: "SUCCESS", message: target + " account updated." };
}

// An account with NO ledger history and NO money on it is removed from the
// database outright — there is nothing to keep. Any account that has carried
// money is only retired (Status = Inactive): the historical rows reference the
// ID, and a retired account stays visible in Settings so it can be reactivated.
function deleteFinancialAccount(accountId, data, adminUsername) {
  setupDatabase();
  var payload = data && typeof data === "object" ? data : {};
  var walletId = String(payload.walletId || "").trim();
  var target = String(accountId || "").trim();

  if (!walletId) {
    var existing = financialAccountRows_().filter(function (a) { return a.AccountID === target; })[0] || null;
    walletId = existing ? existing.WalletID : "";
  }
  if (!walletId) return err_("Wallet আবশ্যক।", "WALLET_REQUIRED");

  var perm = authorize_(adminUsername, "MANAGE_WALLET_STATUS", [walletId]);
  if (perm) return perm;
  ensureWalletDefaultAccounts_(walletId);

  var current = findFinancialAccountById_(walletId, target);
  if (!current) return err_("অ্যাকাউন্ট পাওয়া যায়নি!", "ACCOUNT_NOT_FOUND");

  var activeCount = financialAccountRows_().filter(function (a) {
    return a.WalletID === walletId && a.Status === ACCOUNT_STATUS_ACTIVE;
  }).length;

  // Never let a wallet end up with ZERO active accounts: forms need at least
  // one account to post to.
  if (current.Status === ACCOUNT_STATUS_ACTIVE && activeCount <= 1) {
    return err_("Wallet-এ কমপক্ষে একটি সক্রিয় অ্যাকাউন্ট থাকতে হবে।", "LAST_ACCOUNT");
  }

  // Empty + zero balance: hard delete. Nothing references it, so the row (and
  // its ID) can go entirely instead of lingering as an invisible Inactive row.
  // Default seed accounts (Cash/Bank) are exempt: they would be auto-recreated
  // as ACTIVE by ensureWalletDefaultAccounts_, so they can only be retired.
  if (!isDefaultWalletAccountId_(target) && !financialAccountInUse_(walletId, target) && getAccountBalance_(walletId, target) === 0) {
    var delIdx = findFinancialAccountRowIndex_(walletId, target);
    getFinancialAccountsSheet_().deleteRow(delIdx);
    invalidateAccounts_();
    logAudit(adminUsername, "Financial account deleted", walletId + "/" + target, current.Name);
    return { status: "SUCCESS", message: current.Name + " অ্যাকাউন্টটি ডাটাবেস থেকে মুছে ফেলা হয়েছে।", deleted: true };
  }

  // Has history or a balance: retire instead of delete.
  var rowIdx = findFinancialAccountRowIndex_(walletId, target);
  var sheet = getFinancialAccountsSheet_();
  sheet.getRange(rowIdx, 7, 1, 2).setValues([[ACCOUNT_STATUS_INACTIVE, nowStr()]]);
  invalidateAccounts_();
  logAudit(adminUsername, "Financial account retired", walletId + "/" + target, current.Name);
  return { status: "SUCCESS", message: target + " account retired.", deleted: false };
}
