// ---------------- CURRENCIES ----------------
//
// Single source of truth for which currencies exist, how each one is rendered,
// and whether the loan module may use it.
//
// The wallet allowlist used to be a hardcoded VALID_CURRENCIES array in
// Database.gs with a second copy in the frontend dropdown and a third symbol map
// in utils/loan.js. Adding a currency meant editing three places and the symbol
// silently degraded to "XYZ 100.00" if one of them was missed. The backend owns
// the list now and the frontend fetches it, so a new currency is a single row.
//
// DECIMALS ARE CAPPED AT 2 - see Money.gs. The whole money layer is integer
// cents (CENTS_PER_UNIT = 100) and PLAIN_DECIMAL_RE_ rejects anything past 2
// decimal places, so a 3-decimal currency (KWD, BHD, JOD) would need the
// arithmetic rewritten, not just a display value. Storing the column keeps the
// schema future-proof; isValidCurrencyDecimals_() is what actually enforces the
// current limit.

var CURRENCY_HEADERS = ["Code", "Symbol", "Decimals", "LoanEnabled", "Status", "CreatedAt", "UpdatedAt"];

var CURRENCY_STATUS_ACTIVE = "Active";
var CURRENCY_STATUS_INACTIVE = "Inactive";
var VALID_CURRENCY_STATUSES = [CURRENCY_STATUS_ACTIVE, CURRENCY_STATUS_INACTIVE];

// Money.gs fixed point. Kept as a constant here so the cap is stated in one
// place and the reason lives next to it.
var MAX_CURRENCY_DECIMALS = MONEY_DECIMALS;

// Seed for a spreadsheet that has never had a Currencies sheet. Loans are
// enabled for BDT/SAR only, matching the previous LOAN_ALLOWED_CURRENCIES rule.
var DEFAULT_CURRENCIES = [
  { code: "BDT", symbol: "\u09F3", decimals: 2, loan: true },
  { code: "SAR", symbol: "SAR", decimals: 2, loan: true },
  { code: "USD", symbol: "$", decimals: 2, loan: false },
  { code: "EUR", symbol: "\u20AC", decimals: 2, loan: false },
  { code: "GBP", symbol: "\u00A3", decimals: 2, loan: false },
  { code: "AED", symbol: "AED", decimals: 2, loan: false },
  { code: "KWD", symbol: "KD", decimals: 2, loan: false },
];

// ISO 4217 codes are 3 uppercase letters. Anything looser would let a wallet be
// created with a typo that can never be fixed (wallet currency is immutable).
var CURRENCY_CODE_RE_ = /^[A-Z]{3}$/;

// A symbol is 1-6 printable characters, no control characters. Kept permissive
// on purpose: real currencies use ৳, $, €, £ and plain 3-letter codes, and
// Apps Script's regex support is limited.
function normalizeCurrencySymbol_(symbol) {
  var s = String(symbol === undefined || symbol === null ? "" : symbol).trim();
  if (!s || s.length > 6) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(s)) return null;
  return s;
}

function normalizeCurrencyCode_(code) {
  var s = String(code === undefined || code === null ? "" : code).trim().toUpperCase();
  if (!CURRENCY_CODE_RE_.test(s)) return null;
  return s;
}

// The whole money layer is integer cents (CENTS_PER_UNIT = 100) and
// PLAIN_DECIMAL_RE_ rejects anything past 2 decimal places, so 2 is the ONLY
// correct value today. Accepting 0 or 1 would be worse than refusing them: the
// stored amounts keep their cents while the client formats with the row's
// decimals, so a 1-dp currency silently renders 1000.50 as "1000.5" and a 0-dp
// one renders it as "1,001" - the money looks wrong on every screen while the
// ledger still holds the right number. The column stays so a future switch to a
// higher fixed point (KWD/BHD/JOD) is a one-value change.
function isValidCurrencyDecimals_(decimals) {
  var n = typeof decimals === "number" ? decimals : parseInt(String(decimals), 10);
  if (isNaN(n)) return false;
  return n === MAX_CURRENCY_DECIMALS;
}

function isValidCurrencyStatus_(status) {
  return VALID_CURRENCY_STATUSES.indexOf(status) !== -1;
}

// Reads the Currencies sheet. Cached under the "currencies" namespace for the
// same 5-minute window as other slow-changing data, because it is read on every
// wallet create/update and every loan create. Seeded on first read so an
// existing spreadsheet upgrades without a manual migration step.
function currencyRows_() {
  var cached = cacheGet_("currencies", "all");
  if (cached !== undefined) return cached;

  var sheet = getCurrenciesSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    seedCurrencies_(sheet);
    lastRow = sheet.getLastRow();
  }

  var rows = [];
  if (lastRow >= 2) {
    var values = sheet.getRange(2, 1, lastRow - 1, CURRENCY_HEADERS.length).getValues();
    values.forEach(function (r) {
      var code = String(r[0] || "").trim().toUpperCase();
      if (!code) return;
      rows.push({
        code: code,
        symbol: String(r[1] === undefined || r[1] === null ? "" : r[1]).trim() || code,
        decimals: parseInt(r[2], 10),
        loanEnabled: String(r[3]).toLowerCase() === "true",
        status: isValidCurrencyStatus_(String(r[4])) ? String(r[4]) : CURRENCY_STATUS_ACTIVE,
        createdAt: String(r[5] || ""),
        updatedAt: String(r[6] || ""),
      });
    });
  }
  cachePut_("currencies", "all", rows, CACHE_TTL);
  return rows;
}

function seedCurrencies_(sheet) {
  var ts = nowStr();
  DEFAULT_CURRENCIES.forEach(function (c) {
    sheet.appendRow([c.code, c.symbol, c.decimals, c.loan, CURRENCY_STATUS_ACTIVE, ts, ts]);
  });
}

function getCurrenciesSheet_() { return getOrCreateSheet_("Currencies", CURRENCY_HEADERS); }

// Called from setupDatabase so the sheet exists (and is seeded) on a normal
// login, not lazily on the first currency lookup.
function ensureCurrenciesSeeded_() {
  getCurrenciesSheet_();
  currencyRows_();
}

// Every invalidation path must clear this namespace or a new currency stays
// invisible for up to CACHE_TTL.
function invalidateCurrencies_() {
  // currencies only caches under "all"; remove it explicitly so a cold
  // execution can still reach the script-cache entry (cacheClear_ cannot).
  cacheRemove_("currencies", "all");
  cacheClear_("currencies");
  cacheRemove_("schema", "v2");
}

function findCurrency_(code) {
  var target = normalizeCurrencyCode_(code);
  if (!target) return null;
  var rows = currencyRows_();
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].code === target) return rows[i];
  }
  return null;
}

// Active currencies, ordered by code. Drives every dropdown in the app.
function getActiveCurrencies_() {
  return currencyRows_()
    .filter(function (c) { return c.status === CURRENCY_STATUS_ACTIVE; })
    .sort(function (a, b) { return a.code < b.code ? -1 : a.code > b.code ? 1 : 0; });
}

// Replaces the old hardcoded VALID_CURRENCIES check. Active only: a deactivated
// currency is hidden from new wallets but must keep validating existing rows,
// so callers that read a stored wallet/loan go through findCurrency_ instead.
function isValidCurrency_(currency) {
  var found = findCurrency_(currency);
  return !!found && found.status === CURRENCY_STATUS_ACTIVE;
}

// Replaces the old LOAN_ALLOWED_CURRENCIES check. Requires the currency to be
// active AND have LoanEnabled, so retiring a currency also closes the loan door
// without touching any code.
function isLoanCurrency_(currency) {
  var found = findCurrency_(currency);
  return !!found && found.status === CURRENCY_STATUS_ACTIVE && found.loanEnabled;
}

function findCurrencyRowIndex_(code) {
  var target = normalizeCurrencyCode_(code);
  if (!target) return -1;
  var sheet = getCurrenciesSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  var codes = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < codes.length; i++) {
    if (String(codes[i][0] || "").trim().toUpperCase() === target) return i + 2;
  }
  return -1;
}

// Is this currency referenced by a wallet or a loan? Used to refuse deleting a
// currency that money depends on - retiring (Status=Inactive) stays available.
function currencyInUse_(code) {
  var target = normalizeCurrencyCode_(code);
  if (!target) return false;
  var inWallets = walletsRows_().some(function (r) { return String(r[2]).toUpperCase() === target; });
  if (inWallets) return true;
  var loans = getLoansSheet_();
  if (loans.getLastRow() < 2) return false;
  return loans.getRange(2, 8, loans.getLastRow() - 1, 1).getValues()
    .some(function (r) { return String(r[0]).toUpperCase() === target; });
}

// ---------------- ACTIONS ----------------

function getCurrencies(username) {
  setupDatabase();
  var list = currencyRows_().map(function (c) {
    return { code: c.code, symbol: c.symbol, decimals: c.decimals, loanEnabled: c.loanEnabled, status: c.status };
  });
  // Every signed-in user needs the list to render and pick a wallet currency,
  // so this is NOT permission gated the way the mutation actions are.
  return { status: "SUCCESS", currencies: list };
}

function addCurrency(data, adminUsername) {
  setupDatabase();
  var perm = requirePermission_(adminUsername, "MANAGE_CURRENCIES");
  if (perm) return perm;

  var code = normalizeCurrencyCode_(data && data.code);
  if (!code) return err_("Currency code must be 3 letters (e.g. BDT, USD).", "INVALID_CURRENCY_CODE");
  var symbol = normalizeCurrencySymbol_(data && data.symbol);
  if (!symbol) return err_("Symbol must be 1-6 characters.", "INVALID_CURRENCY_SYMBOL");
  if (!isValidCurrencyDecimals_(data && data.decimals)) {
    return err_("Decimals must be " + MAX_CURRENCY_DECIMALS + " - the whole money layer stores integer cents.", "INVALID_CURRENCY_DECIMALS");
  }
  if (findCurrencyRowIndex_(code) !== -1) {
    return err_("'" + code + "' currency already exists.", "CURRENCY_EXISTS");
  }

  var ts = nowStr();
  var loanEnabled = !!(data && data.loanEnabled);

  getCurrenciesSheet_().appendRow([
    code, symbol, parseInt(data.decimals, 10), loanEnabled,
    CURRENCY_STATUS_ACTIVE, ts, ts,
  ]);
  invalidateCurrencies_();
  logAudit(adminUsername, "Currency added", code, symbol + " decimals:" + parseInt(data.decimals, 10) + " loan:" + loanEnabled);
  return { status: "SUCCESS", message: code + " currency added." };
}

function updateCurrency(code, data, adminUsername) {
  setupDatabase();
  var perm = requirePermission_(adminUsername, "MANAGE_CURRENCIES");
  if (perm) return perm;

  var target = normalizeCurrencyCode_(code);
  if (!target) return validationError_("Invalid currency code.", "INVALID_CURRENCY_CODE");
  var rowIdx = findCurrencyRowIndex_(target);
  if (rowIdx === -1) return err_("Currency পাওয়া যায়নি!", "CURRENCY_NOT_FOUND");

  var current = currencyRows_().filter(function (c) { return c.code === target; })[0];
  if (!current) return err_("Currency পাওয়া যায়নি!", "CURRENCY_NOT_FOUND");

  var next = {
    symbol: current.symbol,
    decimals: current.decimals,
    loanEnabled: current.loanEnabled,
    status: current.status,
  };

  if (data.symbol !== undefined) {
    var symbol = normalizeCurrencySymbol_(data.symbol);
    if (!symbol) return err_("Symbol must be 1-6 characters.", "INVALID_CURRENCY_SYMBOL");
    next.symbol = symbol;
  }
  if (data.decimals !== undefined) {
    if (!isValidCurrencyDecimals_(data.decimals)) {
      return err_("Decimals must be " + MAX_CURRENCY_DECIMALS + " - the whole money layer stores integer cents.", "INVALID_CURRENCY_DECIMALS");
    }
    next.decimals = parseInt(data.decimals, 10);
  }
  if (data.loanEnabled !== undefined) next.loanEnabled = !!data.loanEnabled;
  if (data.status !== undefined) {
    if (!isValidCurrencyStatus_(data.status)) return err_("Invalid status.", "INVALID_STATUS");
    // Retiring a currency that a wallet or loan already uses would break every
    // screen that formats its money, so it is refused outright.
    if (data.status === CURRENCY_STATUS_INACTIVE && next.status === CURRENCY_STATUS_ACTIVE && currencyInUse_(target)) {
      return err_("এই কারেন্সি ব্যবহার করে আছে Wallet বা হাওলাত — মুছে ফেলা যাবে না।", "CURRENCY_IN_USE");
    }
    next.status = data.status;
  }

  var sheet = getCurrenciesSheet_();
  sheet.getRange(rowIdx, 2, 1, 4).setValues([[next.symbol, next.decimals, next.loanEnabled, next.status]]);
  sheet.getRange(rowIdx, 7, 1, 1).setValue(nowStr());
  invalidateCurrencies_();
  logAudit(adminUsername, "Currency updated", target, JSON.stringify(next));
  return { status: "SUCCESS", message: target + " currency updated." };
}

// Deleting is only safe when no money references the currency. Otherwise the
// row is retired (deactivated) so existing wallets/loans keep formatting.
function deleteCurrency(code, adminUsername) {
  setupDatabase();
  var perm = requirePermission_(adminUsername, "MANAGE_CURRENCIES");
  if (perm) return perm;

  var target = normalizeCurrencyCode_(code);
  if (!target) return validationError_("Invalid currency code.", "INVALID_CURRENCY_CODE");
  var rowIdx = findCurrencyRowIndex_(target);
  if (rowIdx === -1) return err_("Currency পাওয়া যায়নি!", "CURRENCY_NOT_FOUND");

  if (currencyInUse_(target)) {
    return err_("এই কারেন্সি ব্যবহার করে আছে Wallet বা হাওলাত — মুছে ফেলা যাবে না।", "CURRENCY_IN_USE");
  }

  getCurrenciesSheet_().deleteRow(rowIdx);
  invalidateCurrencies_();
  logAudit(adminUsername, "Currency deleted", target, "");
  return { status: "SUCCESS", message: target + " currency deleted." };
}
