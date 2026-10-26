// ---------------- MONEY ----------------
//
// Single source of truth for every monetary value in this app.
//
// Two rules the rest of the backend depends on:
//
//   1. An amount is a plain base-10 number with at most 2 decimal places.
//      Booleans, arrays, objects, hex/binary/exponent literals, "1,000",
//      "৳50" and sub-cent values like 1.005 are all REJECTED — never coerced.
//      Previously `Number(value)` accepted all of those silently, so a bad
//      request could be written to a sheet as a real amount.
//
//   2. All balance/ledger arithmetic runs in integer CENTS. Balances are read
//      back as a 2-decimal number for the API, so callers are unchanged, but
//      the accumulation itself can no longer drift (0.1 + 0.2 === 0.3 always).
//
// Amounts are read with toCents_() and written with moneyStr_() / amountOf_().

var MONEY_DECIMALS = 2;
var CENTS_PER_UNIT = 100;

// Plain decimal only: optional sign, digits, optional single dot + 1-2 digits.
// Deliberately rejects "1e3", "0x10", "1,000", "৳50", "1.234", " 1 . 5", "1.".
var PLAIN_DECIMAL_RE_ = /^-?\d+(\.\d{1,2})?$/;

// Largest amount the app accepts, expressed in cents (MAX_TRANSACTION_AMOUNT
// is defined in Database.gs; resolved lazily so load order never matters).
function maxAmountCents_() {
  return Math.round(MAX_TRANSACTION_AMOUNT * CENTS_PER_UNIT);
}

// True only for the two primitive types a client may legitimately send.
function isMoneyPrimitive_(value) {
  return typeof value === "number" || typeof value === "string";
}

/**
 * Parse a client-supplied amount into integer cents.
 * Returns NaN when the value is not an acceptable amount.
 */
function toCents_(value) {
  if (!isMoneyPrimitive_(value)) return NaN;

  if (typeof value === "number") {
    if (!isFinite(value)) return NaN;
    var scaled = value * CENTS_PER_UNIT;
    var rounded = Math.round(scaled);
    // Reject sub-cent values (1.005 -> 100.5) but tolerate ONLY the binary
    // representation error of a legitimate 2-decimal double (0.1 + 0.2).
    // The tolerance must scale with magnitude: a fixed 1e-6 is far too tight
    // above ~1e8, where one ULP is already 7.6e-6. With a fixed tolerance,
    // 658693073.2 (a perfectly valid amount) was rejected by isValidAmount_ and
    // — much worse — centsOf_() turned it into 0, so such an income row would
    // contribute nothing to the balance. 4 * 2^-52 (~4 ULP) leaves an order of
    // magnitude of headroom over the worst case while still rejecting any real
    // third decimal place.
    var tol = Math.max(1e-9, Math.abs(scaled) * 8.881784197001252e-16);
    if (Math.abs(scaled - rounded) > tol) return NaN;
    return rounded;
  }

  var text = String(value).trim();
  if (!text || !PLAIN_DECIMAL_RE_.test(text)) return NaN;
  var negative = text.charAt(0) === "-";
  if (negative) text = text.slice(1);
  var parts = text.split(".");
  var whole = parseInt(parts[0], 10);
  if (!isFinite(whole)) return NaN;
  // "12.5" === 1250 cents, "12.50" === 1250 cents.
  var frac = parts.length === 2 ? parseInt((parts[1] + "00").slice(0, 2), 10) : 0;
  var cents = whole * CENTS_PER_UNIT + frac;
  return negative ? -cents : cents;
}

// Integer cents for an amount that is already known to be valid, falling back
// to 0 for blank/absent cells (opening balances, empty sheet columns).
function centsOf_(value) {
  var cents = toCents_(value);
  return isNaN(cents) ? 0 : cents;
}

// Cents -> number with exactly 2 decimals, for the API and for sheet writes.
function amountOf_(cents) {
  var c = isFinite(cents) ? Math.round(cents) : 0;
  return c / CENTS_PER_UNIT;
}

// Canonical storage form: "1234.50". Sheets then hold text that round-trips
// through toCents_() without any float ambiguity.
function moneyStr_(value) {
  var cents = isMoneyPrimitive_(value) ? toCents_(value) : NaN;
  if (isNaN(cents)) return null;
  return amountOf_(cents).toFixed(MONEY_DECIMALS);
}

// Strict validity: finite, non-zero, at most 2 decimals, within the app limit.
function isValidAmountCents_(value) {
  var cents = toCents_(value);
  if (isNaN(cents)) return false;
  return cents > 0 && cents <= maxAmountCents_();
}

// Non-zero amounts may be negative: used for balance deltas and refunds.
function isValidSignedAmountCents_(value) {
  var cents = toCents_(value);
  if (isNaN(cents)) return false;
  return cents !== 0 && Math.abs(cents) <= maxAmountCents_();
}

// Opening balances are the one place where 0 is a legitimate amount, so they
// cannot reuse isValidAmountCents_ (which requires a positive value).
function isValidNonNegativeAmountCents_(value) {
  var cents = toCents_(value);
  if (isNaN(cents)) return false;
  return cents >= 0 && cents <= maxAmountCents_();
}

// Reads an optional money field: blank/undefined means 0, anything else must be
// a real non-negative amount. Returns NaN for a value that must be rejected, so
// callers can never silently store parseFloat("abc") || 0 as 0.
function openingAmountCents_(value) {
  if (value === undefined || value === null || value === "") return 0;
  if (!isValidNonNegativeAmountCents_(value)) return NaN;
  return toCents_(value);
}

// Exact cent comparison — replaces Math.abs(a - b) < 0.005 tolerance checks,
// which both accept genuinely-different values and can pass on float noise.
function sameAmount_(a, b) {
  var ca = toCents_(a);
  var cb = toCents_(b);
  if (isNaN(ca) || isNaN(cb)) return false;
  return ca === cb;
}

// Sum of anything amount-like, accumulated in cents so the total is exact.
function sumAmounts_(values) {
  var total = 0;
  for (var i = 0; i < (values || []).length; i++) total += centsOf_(values[i]);
  return total;
}

// Human-readable reason an amount was rejected, so the API explains the real
// problem instead of a blanket "amount must be greater than 0".
function amountError_(value, opts) {
  var allowNegative = !!(opts && opts.allowNegative);
  var cents = toCents_(value);
  if (isNaN(cents)) {
    if (value === undefined || value === null || value === "") {
      return "টাকার পরিমাণ লিখুন।";
    }
    if (typeof value === "boolean" || typeof value === "object") {
      return "টাকার পরিমাণ সংখ্যা হিসেবে দিন।";
    }
    if (typeof value === "string" && !PLAIN_DECIMAL_RE_.test(String(value).trim())) {
      return "টাকার পরিমাণ সাধারণ সংখ্যা হিসেবে লিখুন (যেমন 1500 বা 1500.50)।";
    }
    return "টাকার পরিমাণ ০-এর বেশি হতে হবে।";
  }
  if (Math.abs(cents) > maxAmountCents_()) {
    return "সর্বোচ্চ পরিমাণ " + amountOf_(maxAmountCents_()).toFixed(MONEY_DECIMALS) + "।";
  }
  if (allowNegative) {
    if (cents === 0) return "টাকার পরিমাণ ০ হতে পারবে না।";
    if (cents < 0) return "টাকার পরিমাণ ঋণাত্মক হতে পারবে না।";
    return "টাকার পরিমাণ ০-এর বেশি হতে হবে।";
  }
  return "টাকার পরিমাণ ০-এর বেশি হতে হবে।";
}
