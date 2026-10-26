// ============================================================
// হাওলাত (LOAN) MODULE
// ============================================================
// Loan ledger lives in two logical sheets (Loans + LoanPayments).
// Every loan/payment money movement is ALSO written into the owning
// wallet's transaction sheet under dedicated types that change the
// wallet balance but are NEVER counted as Income/Expense:
//   GIVEN  loan   -> "Loan Out"      (wallet -)
//   GIVEN  repay  -> "Loan Repaid"   (wallet +)
//   TAKEN  loan   -> "Loan In"       (wallet +)
//   TAKEN  repay  -> "Loan Payment"  (wallet -)
// Currency is ALWAYS derived from the selected wallet; the
// frontend-supplied currency is only cross-checked and rejected on mismatch.
// ============================================================

// ---------------- ERROR HELPERS ----------------

function loanErr_(code, message) {
  return { status: "ERROR", message: message, code: code };
}

function permErrWithCode_(permErr) {
  return { status: "ERROR", message: permErr.message, code: "PERMISSION_DENIED" };
}

// ---------------- VALIDATION HELPERS ----------------

function isValidLoanPhone_(phone) {
  var s = String(phone || "").trim();
  if (!s) return false;
  var digits = s.replace(/[^\d]/g, "");
  return digits.length >= 6 && digits.length <= 15;
}

function validateOptionalLoanDate_(dateStr, loanDate, code) {
  if (!dateStr) return { value: "", error: null };
  if (!isValidTransactionDate_(dateStr)) return { value: "", error: loanErr_(code, "সঠিক তারিখ দিন।") };
  if (dateStr < normDateStr_(loanDate)) return { value: "", error: loanErr_(code, "তারিখ হাওলাতের তারিখের আগে হতে পারবে না।") };
  return { value: dateStr, error: null };
}

function loanEffectDescription_(effectType) {
  if (effectType === "Loan Out") return "হাওলাত দিলাম";
  if (effectType === "Loan In") return "হাওলাত নিলাম";
  if (effectType === "Loan Repaid") return "ফেরত পেয়েছি";
  if (effectType === "Loan Payment") return "ফেরত দিয়েছি";
  return effectType;
}

function computeLoanStatus_(amount, totalRepaid, dueDate) {
  // Remaining is compared in integer cents: "is it paid off?" must never be
  // decided by a float tolerance, or a 1-cent residue can flip the status.
  var remaining = centsOf_(amount) - centsOf_(totalRepaid);
  if (remaining <= 0) return "PAID";
  var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  if (dueDate && String(dueDate) < today) return "OVERDUE";
  if (centsOf_(totalRepaid) > 0) return "PARTIAL";
  return "ACTIVE";
}

// Live read-time status. The persisted status column is only recomputed on
// mutation and therefore goes stale the moment the dueDate passes — every
// read derives it fresh so badges/filters always agree with the calendar.
function liveLoanStatus_(loan) {
  if (loan && loan.status === "CANCELLED") return "CANCELLED";
  // RemainingAmount is persisted as totalLoan - totalRepaid, so the derived
  // base amount (remaining + repaid) already includes any additions — status
  // stays correct without an extra per-loan addition read.
  return computeLoanStatus_(loan.remainingAmount + loan.totalRepaid, loan.totalRepaid, loan.dueDate);
}

// ---------------- AUTHORITATIVE FINANCIAL STATE ----------------
//
// The financial truth of a loan is ALWAYS derived from its ledger rows:
//     totalLoan = originalAmount + SUM(valid additions)
//     remaining = totalLoan - SUM(valid repayments)   (raw, NOT clamped)
// The stored TotalRepaid / RemainingAmount / Status columns are treated only as
// a cache for display and are NEVER the source of truth for decisions.
// Mutating paths enforce remaining >= -EPSILON (see the "never overpay" checks),
// so a healthy ledger never shows a negative remaining. Math.max(0,...) is
// deliberately NOT used: it would silently hide an over-repaid/corrupt state,
// and State override (§6) forbids clamping recorded state.

function readAllPayments_() {
  var sheet = getLoanPaymentsSheet_();
  var out = [];
  if (sheet.getLastRow() >= 2) {
    var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, LOAN_PAYMENT_HEADERS.length).getValues();
    for (var i = 0; i < data.length; i++) {
      if (!data[i][0]) continue;
      out.push(paymentFromRow_(data[i], i + 2));
    }
  }
  return out;
}

function paymentSumForLoan_(loanId) {
  // Accumulated in integer cents so a long repayment ledger cannot drift.
  return amountOf_(paymentCentsForLoan_(loanId));
}

function paymentCentsForLoan_(loanId) {
  var sumCents = 0;
  readAllPayments_().forEach(function (p) {
    if (String(p.loanId) === String(loanId)) sumCents += centsOf_(p.amount);
  });
  return sumCents;
}

// Single authoritative calculation for a loan's current financial state.
// addSum / repaySum may be supplied to avoid re-reading the sheets (list reads),
// otherwise they are computed from the ledger directly so mutating paths are
// always fresh. All arithmetic is done in integer cents; the returned object
// carries normal 2-decimal numbers so callers and the API are unchanged.
function getLoanFinancialState_(loan, addSum, repaySum) {
  var baseCents = centsOf_(loan.amount);
  var addCents = addSum !== undefined && addSum !== null ? centsOf_(addSum) : additionCentsForLoan_(loan.id);
  var repCents = repaySum !== undefined && repaySum !== null ? centsOf_(repaySum) : paymentCentsForLoan_(loan.id);
  var totalLoanCents = baseCents + addCents;
  var remainingCents = totalLoanCents - repCents;
  var totalLoan = amountOf_(totalLoanCents);
  var rep = amountOf_(repCents);
  var status;
  if (String(loan.status).toUpperCase() === "CANCELLED") status = "CANCELLED";
  else status = computeLoanStatus_(totalLoan, rep, loan.dueDate);
  return {
    originalAmount: amountOf_(baseCents), additionalAmount: amountOf_(addCents), totalLoanAmount: totalLoan,
    totalRepaid: rep, remainingAmount: amountOf_(remainingCents), status: status,
  };
}

// ---------------- PERSON IDENTITY ----------------
//
// Person identity is stable across loans of the same contact. Priority order:
//   1. an existing personId that already matches,
//   2. the caller-supplied personId,
//   3. a deterministic id derived from the normalized phone (stored on new
//      loans so personId self-populates without ever changing per submission).
// Phone always wins over name; name-only matching is limited to records where
// BOTH sides have no phone so two people who merely share a name never merge.

function normalizePersonName_(name) {
  return String(name || "").toLowerCase().replace(/\s+/g, " ").replace(/[^\w\s.-]/g, "").trim();
}

function normalizePhoneDigits_(phone) {
  return String(phone || "").replace(/[^\d]/g, "");
}

// Whether two phone numbers (already digit-only) represent the SAME subscriber.
// Google Sheets drops a leading "0" and a leading "+" when storing them, so the
// same number can appear as 0506556656, 506556656, 965506556656 or +965... —
// these must still match. Rules:
//   1. identical digits;
//   2. equal after stripping all leading zeros (0506556656 ~ 506556656);
//   3. one is a suffix of the other once leading zeros are stripped, meaning the
//      longer one is just "country-code" + the same number, e.g. 965506556656
//      ends with 506556656. A minimum length avoids merging on short coincidences.
function phonesMatch_(a, b) {
  a = String(a || "").replace(/[^\d]/g, "");
  b = String(b || "").replace(/[^\d]/g, "");
  if (!a || !b) return false;
  if (a === b) return true;
  var a0 = a.replace(/^0+/, "");
  var b0 = b.replace(/^0+/, "");
  if (a0 && a0 === b0) return true;
  var min = 7;
  if (a0.length >= min && b0.length >= min) {
    if (a0.length > b0.length && a0.slice(-b0.length) === b0) return true;
    if (b0.length > a0.length && b0.slice(-a0.length) === a0) return true;
  }
  return false;
}

function personContactKey_(name, phone) {
  var digits = normalizePhoneDigits_(phone);
  var n = normalizePersonName_(name);
  return digits ? "P" + digits : (n ? "N" + n : "");
}

function hashStr_(s) {
  var h = 5381;
  for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16).slice(0, 8);
}

function deterministicPersonId_(name, phone) {
  var key = personContactKey_(name, phone);
  if (!key) return "";
  return key.charAt(0) === "P" ? "P" + key.slice(1) : "N" + hashStr_(key) + "_" + key.slice(1);
}

var PERSON_ID_RE = /^[A-Za-z0-9_-]{1,48}$/;
function sanitizePersonId_(id) {
  var s = String(id || "").trim();
  return PERSON_ID_RE.test(s) ? s : "";
}

// Whether a caller-supplied identity belongs to the SAME person as a loan.
// Phone is authoritative; a personId (when both sides have one) must match
// exactly; name-only matching is limited to records where BOTH sides have no
// phone, so two people who merely share a name never merge.
function loanPersonIdentityMatches_(loan, personName, phone, personId) {
  var incomingKey = personContactKey_(personName, phone);
  var loanKey = personContactKey_(loan.personName, loan.phone);
  var incomingId = sanitizePersonId_(personId);
  if (incomingId && String(loan.personId || "") && String(incomingId) === String(loan.personId)) return true;
  var loanDigits = normalizePhoneDigits_(loan.phone);
  var inDigits = normalizePhoneDigits_(phone);
  if (loanDigits && inDigits && phonesMatch_(loanDigits, inDigits)) return true;
  if (!loanDigits && !inDigits && normalizePersonName_(loan.personName) === normalizePersonName_(personName)) return true;
  if (incomingKey && incomingKey === loanKey) return true;
  return false;
}

function resolvePersonForLoanInput_(allLoans, personName, phone, personId) {
  var inputKey = personContactKey_(personName, phone);
  var inputDigits = normalizePhoneDigits_(phone);
  var cleanId = sanitizePersonId_(personId);
  var matched = [];
  var seen = {};
  for (var i = 0; i < allLoans.length; i++) {
    var l = allLoans[i];
    if (!l || !l.id || seen[l.id]) continue;
    var lKey = personContactKey_(l.personName, l.phone);
    var lDigits = normalizePhoneDigits_(l.phone);
    var same = false;
    if (cleanId && l.personId && String(l.personId) === cleanId) same = true;
    else if (inputDigits && lDigits && phonesMatch_(inputDigits, lDigits)) same = true;
    else if (!inputDigits && !lDigits && inputKey && inputKey === lKey) same = true;
    if (same) { seen[l.id] = true; matched.push(l); }
  }
  // Reuse an existing personId (e.g. from a migrated record) before deriving one.
  var reused = "";
  for (var j = 0; j < matched.length; j++) {
    if (matched[j].personId) { reused = String(matched[j].personId); break; }
  }
  var resolvedId = reused || cleanId || deterministicPersonId_(personName, phone);
  return { personId: resolvedId, matched: matched, key: inputKey };
}

// Finds and returns the genuinely OUTSTANDING loans of one person, computed from
// authoritative ledger state, scoped to the user's wallet access. PAID, CANCELLED
// and zero-balance loans never appear. Supports multiple active loans.
function personOutstandingLoans_(username, allLoans, personId, personName, phone) {
  var person = resolvePersonForLoanInput_(allLoans, personName, phone, personId);
  if (!person.matched.length) return { status: "SUCCESS", loans: [], personId: person.personId };
  var accessible = getUserWalletAccess_(getUserRecord_(username));
  var repayMap = repaymentSumMap_();
  var addSumMap = additionSumMap_();
  var out = [];
  for (var j = 0; j < person.matched.length; j++) {
    var l = person.matched[j];
    if (accessible.indexOf(String(l.walletId)) === -1) continue;
    var st = getLoanFinancialState_(l, addSumMap[String(l.id)] || 0, repayMap[String(l.id)] || 0);
    if (st.status === "CANCELLED" || centsOf_(st.remainingAmount) <= 0) continue;
    out.push(loanToClient_(l, { financialState: st }));
  }
  out.sort(function (a, b) { return String(b.loanDate || "").localeCompare(String(a.loanDate || "")); });
  return { status: "SUCCESS", loans: out, personId: person.personId };
}

function getPersonActiveLoans(username, identity) {
  setupDatabase();
  var permErr = requirePermission_(username, "VIEW_LOANS");
  if (permErr) return permErrWithCode_(permErr);
  identity = identity || {};
  var name = String(identity.personName || "").trim();
  var phone = String(identity.phone || "").trim();
  if (!name && !isValidLoanPhone_(phone)) {
    return loanErr_("PERSON_NOT_FOUND", "ব্যক্তির নাম অথবা ফোন নম্বর দিন।");
  }
  var r = personOutstandingLoans_(username, readLoansRaw_(), identity.personId, name, phone);
  return { status: "SUCCESS", loans: r.loans, personId: r.personId || "" };
}

// Validates wallet + account + currency as one authoritative unit.
// expectedCurrency (optional) forces the wallet to share the loan currency.
// previousAccount (optional) is the loan/payment/addition's stored account: an
// edit that leaves the account untouched is allowed to keep an account that has
// since been deactivated, so retiring an account never freezes existing records.
function loanWalletCurrency_(username, walletId, account, expectedCurrency, previousAccount) {
  if (!walletId) return { error: loanErr_("WALLET_REQUIRED", "Wallet নির্বাচন করুন।") };
  var accessErr = requireWalletAccess_(username, walletId);
  if (accessErr) return { error: loanErr_("INVALID_WALLET", accessErr.message) };
  var activeErr = requireActiveWallet_(walletId);
  if (activeErr) return { error: loanErr_("INVALID_WALLET", activeErr.message) };
  var wallet = getWalletById_(walletId);
  var accountErr = requireActiveAccount_(walletId, account);
  if (accountErr) {
    var unchanged = previousAccount !== undefined && previousAccount !== null &&
      String(previousAccount) === String(account);
    if (!unchanged || !isValidAccountForWallet_(walletId, account)) {
      return { error: loanErr_("INVALID_ACCOUNT", accountErr.message) };
    }
  }
  if (!isLoanCurrency_(wallet.Currency)) {
    return { error: loanErr_("INVALID_CURRENCY", "এই Wallet এর কারেন্সি হাওলাতের জন্য সমর্থিত নয়।") };
  }
  if (expectedCurrency && wallet.Currency !== expectedCurrency) {
    return { error: loanErr_("CURRENCY_MISMATCH", "Wallet কারেন্সি লোনের কারেন্সির সাথে মেলে না।") };
  }
  return { wallet: wallet };
}

// A loan's wallet is LOCKED for good as soon as the loan has any financial
// history at all: its own "L_" wallet effect row, or any addition ("A_"), or
// any repayment ("P_"). Relocating the loan would mean deleting money already
// written into one wallet's ledger and re-appending it to another, which
// rewrites where the money was actually taken from / handed over and leaves
// both wallets' historical statements disagreeing with the loan record. The
// move is therefore refused outright rather than "fixed up" silently, and the
// caller is told to cancel the loan and create a new one.
// Returns a user-facing message when the wallet is locked, or null when the
// loan genuinely has no recorded money movement and may still be moved.
function loanWalletLockReason_(loan) {
  if (loadEffectRowSnapshot_(loan.walletId, "L_" + loan.id)) {
    return "লোনের Wallet বদলানো যাবে না — হাওলাতের টাকার হিসাব ইতিমধ্যে এই Wallet-এ লেখা হয়েছে। লোনটি বাতিল করে নতুন লোন তৈরি করুন।";
  }
  if (readAdditionsForLoan_(loan.id).length) {
    return "লোনের Wallet বদলানো যাবে না — এই লোনে আগে টাকা যোগ করা হয়েছে। লোনটি বাতিল করে নতুন লোন তৈরি করুন।";
  }
  if (readPaymentsForLoan_(loan.id).length) {
    return "লোনের Wallet বদলানো যাবে না — এই লোনের ফেরতের হিসাব ইতিমধ্যে Wallet-এ লেখা হয়েছে। লোনটি বাতিল করে নতুন লোন তৈরি করুন।";
  }
  return null;
}

// ---------------- SHEET READ / WRITE HELPERS ----------------

function loansCacheKey_() { return "all"; }

function loanFromRow_(row, rowIndex) {
  return {
    _row: rowIndex || -1,
    id: String(row[0] || ""), user: row[1] || "", typeStr: String(row[2] || "").toUpperCase(),
    personId: row[3] || "", personName: row[4] || "", phone: row[5] || "",
    amount: parseFloat(row[6]) || 0, currency: row[7] || "", loanDate: normDateStr_(row[8]),
    walletId: row[9] || "", account: row[10] || "",
    dueDate: normDateStr_(row[11]), reminderDate: normDateStr_(row[12]), note: row[13] || "",
    totalRepaid: parseFloat(row[14]) || 0, remainingAmount: parseFloat(row[15]) || 0,
    status: String(row[16] || "").toUpperCase(), createdBy: row[17] || "",
    createdAt: row[18] || "", updatedAt: row[19] || "", requestId: row[20] || "",
  };
}

function readLoansRaw_() {
  var cached = cacheGet_("loans", loansCacheKey_());
  if (cached !== undefined) return cached;
  var sheet = getLoansSheet_();
  var out = [];
  if (sheet.getLastRow() >= 2) {
    var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, LOAN_HEADERS.length).getValues();
    for (var i = 0; i < data.length; i++) {
      if (!data[i][0]) continue;
      out.push(loanFromRow_(data[i], i + 2));
    }
  }
  cachePut_("loans", loansCacheKey_(), out);
  return out;
}

function findLoanRowIndex_(loanId) {
  var sheet = getLoansSheet_();
  if (sheet.getLastRow() < 2) return -1;
  var ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(loanId)) return i + 2;
  }
  return -1;
}

function findLoanRequestRowIndex_(requestId) {
  if (!requestId) return -1;
  var sheet = getLoansSheet_();
  function scan_() {
    if (sheet.getLastRow() < 2) return -1;
    var reqIds = sheet.getRange(2, 21, sheet.getLastRow() - 1, 1).getValues();
    for (var i = 0; i < reqIds.length; i++) {
      if (String(reqIds[i][0]) === String(requestId)) return i + 2;
    }
    return -1;
  }
  var found = scan_();
  // Requests only ever appear on loans created AFTER the loan feature shipped;
  // a fresh read avoids the cache masking a just-written row.
  if (found === -1) {
    cacheRemove_("loans", loansCacheKey_());
    found = scan_();
  }
  return found;
}

function getLoanById_(loanId) {
  var raw = readLoansRaw_();
  for (var i = 0; i < raw.length; i++) {
    if (String(raw[i].id) === String(loanId)) return raw[i];
  }
  return null;
}

function readPaymentsForLoan_(loanId) {
  var sheet = getLoanPaymentsSheet_();
  var out = [];
  if (sheet.getLastRow() >= 2) {
    var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, LOAN_PAYMENT_HEADERS.length).getValues();
    for (var i = 0; i < data.length; i++) {
      if (String(data[i][1] || "") !== String(loanId)) continue;
      out.push({
        _row: i + 2,
        id: String(data[i][0] || ""), loanId: String(data[i][1] || ""), user: data[i][2] || "",
        type: String(data[i][3] || "").toUpperCase(), amount: parseFloat(data[i][4]) || 0,
        currency: data[i][5] || "", walletId: data[i][6] || "", account: data[i][7] || "",
        paymentDate: data[i][8] || "", note: data[i][9] || "",
        createdBy: data[i][10] || "", createdAt: data[i][11] || "", requestId: data[i][12] || "",
      });
    }
  }
  out.sort(function (a, b) { return String(a.paymentDate).localeCompare(String(b.paymentDate)); });
  return out;
}

// ---------------- ADDITIONS (extra money on an EXISTING loan) ----------------
//
// Every addition keeps its own ledger row so the original amount, every extra
// amount and every repayment can be shown and audited separately. Money
// movement mirrors the ORIGINAL loan: GIVEN -> "Loan Out", TAKEN -> "Loan In".
// Derived columns (RemainingAmount / Status) are recomputed as:
//     totalLoan    = originalAmount + SUM(valid additions)
//     remaining    = totalLoan - SUM(repayments)   (raw, not clamped)

function additionFromRow_(row, rowIndex) {
  return {
    _row: rowIndex || -1,
    id: String(row[0] || ""), loanId: String(row[1] || ""), user: row[2] || "",
    amount: parseFloat(row[3]) || 0, currency: row[4] || "", date: normDateStr_(row[5]),
    walletId: row[6] || "", account: row[7] || "", note: row[8] || "",
    createdBy: row[9] || "", createdAt: row[10] || "", updatedAt: row[11] || "", requestId: row[12] || "",
    personId: row[13] || "",
  };
}

function readAllAdditions_() {
  var cached = cacheGet_("loanadditions", "all");
  if (cached !== undefined) return cached;
  var sheet = getLoanAdditionsSheet_();
  var out = [];
  if (sheet.getLastRow() >= 2) {
    var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, LOAN_ADDITION_HEADERS.length).getValues();
    for (var i = 0; i < data.length; i++) {
      if (!data[i][0]) continue;
      out.push(additionFromRow_(data[i], i + 2));
    }
  }
  cachePut_("loanadditions", "all", out);
  return out;
}

function readAdditionsForLoan_(loanId) {
  var all = readAllAdditions_();
  return all
    .filter(function (a) { return String(a.loanId) === String(loanId); })
    .sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });
}

function additionCentsForLoan_(loanId) {
  var sumCents = 0;
  readAdditionsForLoan_(loanId).forEach(function (a) { sumCents += centsOf_(a.amount); });
  return sumCents;
}

function additionSumForLoan_(loanId) {
  return amountOf_(additionCentsForLoan_(loanId));
}

function additionSumMap_() {
  // Cents internally so the per-loan totals stay exact; exposed as decimals.
  var map = {};
  readAllAdditions_().forEach(function (a) {
    var key = String(a.loanId);
    map[key] = (map[key] || 0) + centsOf_(a.amount);
  });
  var out = {};
  for (var k in map) {
    if (Object.prototype.hasOwnProperty.call(map, k)) out[k] = amountOf_(map[k]);
  }
  return out;
}

function totalLoanAmount_(loan) {
  return amountOf_(centsOf_(loan.amount) + additionCentsForLoan_(loan.id));
}

// Same cent-exact shape as additionSumMap_(): accumulate in cents, expose as
// decimals. Summing raw .amount values in floating point made a long ledger's
// total depend on summation order.
function repaymentSumMap_() {
  var map = {};
  readAllPayments_().forEach(function (p) {
    var key = String(p.loanId);
    map[key] = (map[key] || 0) + centsOf_(p.amount);
  });
  var out = {};
  for (var k in map) {
    if (Object.prototype.hasOwnProperty.call(map, k)) out[k] = amountOf_(map[k]);
  }
  return out;
}

function findAdditionRowIndex_(additionId) {
  var sheet = getLoanAdditionsSheet_();
  if (sheet.getLastRow() < 2) return -1;
  var ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(additionId)) return i + 2;
  }
  return -1;
}

function findAdditionRequestRowIndex_(requestId) {
  if (!requestId) return -1;
  var sheet = getLoanAdditionsSheet_();
  function scan_() {
    if (sheet.getLastRow() < 2) return -1;
    var reqIds = sheet.getRange(2, 13, sheet.getLastRow() - 1, 1).getValues();
    for (var i = 0; i < reqIds.length; i++) {
      if (String(reqIds[i][0]) === String(requestId)) return i + 2;
    }
    return -1;
  }
  var found = scan_();
  // Just-written rows can be hidden by the addition cache; re-read once.
  if (found === -1) {
    cacheRemove_("loanadditions", "all");
    found = scan_();
  }
  return found;
}

function additionToClient_(a) {
  var wallet = a.walletId ? getWalletById_(a.walletId) : null;
  return {
    id: a.id, loanId: a.loanId, amount: a.amount, currency: a.currency,
    date: a.date, walletId: a.walletId, walletName: wallet ? wallet.WalletName : "",
    account: a.account, note: a.note || "", createdAt: a.createdAt, updatedAt: a.updatedAt,
    personId: a.personId || "",
  };
}

function findPaymentRowIndex_(paymentId) {
  var sheet = getLoanPaymentsSheet_();
  if (sheet.getLastRow() < 2) return -1;
  var ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(paymentId)) return i + 2;
  }
  return -1;
}

function findPaymentRequestRowIndex_(requestId) {
  if (!requestId) return -1;
  var sheet = getLoanPaymentsSheet_();
  if (sheet.getLastRow() < 2) return -1;
  var reqIds = sheet.getRange(2, 13, sheet.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < reqIds.length; i++) {
    if (String(reqIds[i][0]) === String(requestId)) return i + 2;
  }
  return -1;
}

// Recompute a loan's derived columns from its payment rows (single source of truth).
// Returns the fresh loan object or null if the loan row vanished.
function recalcLoan_(loanId, loansSheet) {
  var sheet = loansSheet || getLoansSheet_();
  var rowIdx = findLoanRowIndex_(loanId);
  if (rowIdx === -1) return null;
  var row = sheet.getRange(rowIdx, 1, 1, LOAN_HEADERS.length).getValues()[0];
  var loan = loanFromRow_(row, rowIdx);
  if (loan.status === "CANCELLED") return loan;

  var st = getLoanFinancialState_(loan);
  sheet.getRange(rowIdx, 15, 1, 3).setValues([[st.totalRepaid, st.remainingAmount, st.status]]);
  sheet.getRange(rowIdx, 20, 1, 1).setValue(nowStr());
  cacheRemove_("loans", loansCacheKey_());
  return loanFromRow_(sheet.getRange(rowIdx, 1, 1, LOAN_HEADERS.length).getValues()[0], rowIdx);
}

// ---------------- CLIENT SHAPES ----------------

function loanToClient_(loan, opts) {
  var wallet = loan.walletId ? getWalletById_(loan.walletId) : null;
  opts = opts || {};
  var st = opts.financialState;
  if (!st) {
    var addVal = opts.additionalAmount !== undefined && opts.additionalAmount !== null
      ? opts.additionalAmount : additionSumForLoan_(loan.id);
    st = getLoanFinancialState_(loan, addVal, opts.repaidAmount);
  }
  return {
    id: loan.id, personId: loan.personId || "", personName: loan.personName, phone: loan.phone,
    type: String(loan.typeStr).toLowerCase(), amount: loan.amount,
    originalAmount: st.originalAmount, additionalAmount: st.additionalAmount,
    totalAmount: st.totalLoanAmount,
    repaid: st.totalRepaid, totalRepaid: st.totalRepaid,
    remaining: st.remainingAmount, remainingAmount: st.remainingAmount,
    currency: loan.currency, walletId: loan.walletId, walletName: wallet ? wallet.WalletName : "",
    account: loan.account, loanDate: loan.loanDate, dueDate: loan.dueDate || "",
    reminderDate: loan.reminderDate || "", note: loan.note || "",
    status: String(st.status).toLowerCase(),
    createdBy: loan.createdBy, createdAt: loan.createdAt, updatedAt: loan.updatedAt,
  };
}

function paymentToClient_(p) {
  var wallet = p.walletId ? getWalletById_(p.walletId) : null;
  return {
    id: p.id, loanId: p.loanId, type: String(p.type).toLowerCase(),
    amount: p.amount, currency: p.currency, walletId: p.walletId,
    walletName: wallet ? wallet.WalletName : "", account: p.account,
    paymentDate: p.paymentDate, date: p.paymentDate, note: p.note || "", createdAt: p.createdAt,
  };
}

// ---------------- WALLET EFFECT ROWS ----------------

function effectTxnObj_(wallet, effectType, amount, date, account, personName, rowId, user) {
  return {
    ID: rowId, Date: date, Type: effectType, Currency: wallet.Currency, Account: account,
    SourceCategory: "Loan", WhereVendor: personName,
    Description: loanEffectDescription_(effectType), Amount: amount, Note: "", User: user,
    WalletID: wallet.WalletID, WalletName: wallet.WalletName,
  };
}

function writeLoanEffectRow_(wallet, effectType, amount, date, account, personName, rowId, user) {
  var resolved = resolveWalletSheet_(wallet.WalletID);
  if (!resolved) throw new Error("wallet sheet not found");
  resolved.sheet.appendRow([rowId, date, effectType, wallet.Currency, account, "Loan",
    personName, loanEffectDescription_(effectType), amount, "", user, new Date()]);
  cacheRemove_("txns", "txns_" + wallet.WalletID);
}

function deleteEffectRow_(walletId, effectRowId) {
  var resolved = resolveWalletSheet_(walletId);
  if (!resolved) return false;
  var rn = findTxnRow_(resolved.sheet, effectRowId);
  if (rn === -1) return false;
  resolved.sheet.deleteRow(rn);
  cacheRemove_("txns", "txns_" + walletId);
  return true;
}

function loadEffectRowSnapshot_(walletId, effectRowId) {
  var resolved = resolveWalletSheet_(walletId);
  if (!resolved) return null;
  var rn = findTxnRow_(resolved.sheet, effectRowId);
  if (rn === -1) return null;
  return { resolved: resolved, rowNum: rn, row: resolved.sheet.getRange(rn, 1, 1, TRANSACTION_HEADERS.length).getValues()[0] };
}

function restoreEffectRowSnapshot_(snap) {
  if (!snap) return;
  var sheet = snap.resolved.sheet;
  // The wallet sheet always has the header block at the top, so reuse the
  // original row index whenever possible, else re-append at the end.
  var targetRow = snap.rowNum;
  var lastRow = sheet.getLastRow();
  if (lastRow >= WALLET_DATA_START_ROW && targetRow <= lastRow && sheet.getRange(targetRow, 1).getValue() === "") {
    sheet.getRange(targetRow, 1, 1, TRANSACTION_HEADERS.length).setValues([snap.row]);
  } else {
    sheet.appendRow(snap.row);
  }
}

// ---------------- API: GET ----------------

function getLoans(username, type, opts) {
  setupDatabase();
  var permErr = requirePermission_(username, "VIEW_LOANS");
  if (permErr) return permErrWithCode_(permErr);

  opts = opts || {};
  var accessible = getUserWalletAccess_(getUserRecord_(username));
  // Loans are wallet-scoped: only loans whose wallet the user can access.
  var loans = readLoansRaw_().filter(function (l) { return accessible.indexOf(String(l.walletId)) !== -1; });

  if (type && type !== "all") {
    var wanted = String(type).toLowerCase();
    loans = loans.filter(function (l) { return String(l.typeStr).toLowerCase() === wanted; });
  }
  loans = loans.filter(function (l) { return l.status !== "CANCELLED" || opts.includeCancelled === true; });

  // One authoritative pass over the ledger: fresh repayment + addition sums so
  // every row is shown with its true financial state, never a stale column.
  var repayMap = repaymentSumMap_();
  var addMap = additionSumMap_();
  var stateMap = {};
  for (var k = 0; k < loans.length; k++) {
    stateMap[String(loans[k].id)] = getLoanFinancialState_(loans[k], addMap[String(loans[k].id)] || 0, repayMap[String(loans[k].id)] || 0);
  }

  var f = opts.filters || {};
  if (f.search) {
    var q = String(f.search).toLowerCase();
    loans = loans.filter(function (l) {
      return String(l.personName || "").toLowerCase().indexOf(q) !== -1 ||
        String(l.phone || "").toLowerCase().indexOf(q) !== -1;
    });
  }
  if (f.status && f.status !== "all") {
    loans = loans.filter(function (l) { return String(stateMap[String(l.id)].status).toLowerCase() === String(f.status).toLowerCase(); });
  }
  if (f.currency && f.currency !== "all") {
    loans = loans.filter(function (l) { return l.currency === f.currency; });
  }
  if (f.remaining === "due") loans = loans.filter(function (l) { return centsOf_(stateMap[String(l.id)].remainingAmount) > 0; });
  else if (f.remaining === "done") loans = loans.filter(function (l) { return centsOf_(stateMap[String(l.id)].remainingAmount) <= 0; });
  if (f.dateFrom) loans = loans.filter(function (l) { return String(l.loanDate || "") >= f.dateFrom; });
  if (f.dateTo) loans = loans.filter(function (l) { return String(l.loanDate || "") <= f.dateTo; });

  // Most-recently-updated first. updatedAt is a "dd-MMM-yyyy HH:mm" string, so
  // it must be parsed before comparing (lexicographic order breaks across
  // months/years). Loans with no usable timestamp fall back to loanDate order
  // and sort after dated rows so nothing ordered by recency is pushed down.
  loans.sort(function (a, b) {
    var at = parseServerTimestamp_(a.updatedAt);
    var bt = parseServerTimestamp_(b.updatedAt);
    var aOk = !isNaN(at);
    var bOk = !isNaN(bt);
    if (aOk && bOk && at !== bt) return bt - at;
    if (aOk !== bOk) return aOk ? -1 : 1;
    return String(b.loanDate || "").localeCompare(String(a.loanDate || ""));
  });

  return { status: "SUCCESS", loans: loans.map(function (l) {
    return loanToClient_(l, { financialState: stateMap[String(l.id)] });
  }) };
}

function getLoanDetails(username, loanId) {
  setupDatabase();
  var permErr = requirePermission_(username, "VIEW_LOANS");
  if (permErr) return permErrWithCode_(permErr);

  var loan = getLoanById_(loanId);
  if (!loan) return loanErr_("LOAN_NOT_FOUND", "লোন পাওয়া যায়নি!");
  if (!hasWalletAccess_(username, loan.walletId)) return loanErr_("UNAUTHORIZED_LOAN", "এই লোনে আপনার অ্যাক্সেস নেই।");

  var addRows = readAdditionsForLoan_(loanId);
  var payRows = readPaymentsForLoan_(loanId);
  // The financial state is derived from the FULL authoritative ledger, so the
  // totals here always match the list view.
  // sumAmounts_ returns CENTS, so the totals cannot depend on float order.
  var st = getLoanFinancialState_(loan,
    amountOf_(sumAmounts_(addRows.map(function (a) { return a.amount; }))),
    amountOf_(sumAmounts_(payRows.map(function (p) { return p.amount; }))));

  var client = loanToClient_(loan, { financialState: st });
  // The rows actually returned to the client are restricted to the loan's own
  // wallet — the one wallet this call authorized. Creation and editing now pin
  // an addition/repayment to it, so this is normally every row; it still keeps
  // a legacy cross-wallet row from leaking a financial record the caller may
  // have no access to the wallet of.
  client.payments = payRows.filter(function (p) { return String(p.walletId) === String(loan.walletId); }).map(paymentToClient_);
  client.additions = addRows.filter(function (a) { return String(a.walletId) === String(loan.walletId); }).map(additionToClient_);
  return { status: "SUCCESS", loan: client };
}

// ---------------- API: CREATE LOAN ----------------

function createLoan(data) {
  setupDatabase();
  if (!data || !data.user) return err_("লোনের প্রয়োজনীয় তথ্য অসম্পূর্ণ!");
  var mode = String(data.mode || data.createMode || "").toUpperCase();
  if (mode && mode !== "NEW_SEPARATE_LOAN" && mode !== "ADD_TO_EXISTING_LOAN") {
    return loanErr_("INVALID_MODE", "অজানা লোন মোড। শুধুমাত্র NEW_SEPARATE_LOAN বা ADD_TO_EXISTING_LOAN সমর্থিত।");
  }
  if (!mode) mode = "NEW_SEPARATE_LOAN"; // legacy callers that never send a mode
  var type = String(data.type || "").toUpperCase();
  if (type !== "GIVEN" && type !== "TAKEN") return loanErr_("INVALID_LOAN_TYPE", "হাওলাতের ধরন GIVEN বা TAKEN হতে হবে.");
  var permErr = authorize_(data.user, type === "GIVEN" ? "LOAN_GIVE" : "LOAN_TAKE", [data.walletId]);
  if (permErr) return permErrWithCode_(permErr);

  var personName = String(data.personName || "").trim();
  if (!personName) return loanErr_("INVALID_PERSON", "ব্যক্তির নাম লিখুন।");
  var phone = String(data.phone || "").trim();
  if (!phone) return loanErr_("PHONE_REQUIRED", "ফোন নম্বর আবশ্যক।");
  if (!isValidLoanPhone_(phone)) return loanErr_("INVALID_PHONE", "সঠিক ফোন নম্বর দিন।");

  if (!isValidAmount_(data.amount)) return loanErr_("INVALID_AMOUNT", amountError_(data.amount));
  var amount = amountOf_(toCents_(data.amount));
  if (!isValidTransactionDate_(data.loanDate)) return loanErr_("INVALID_DATE", "সঠিক তারিখ দিন।");

  // Stabilize the person's identity FIRST: the same name+phone always resolves
  // to the same personId (existing ids are reused), so the active-loan warning
  // and future additions share one identity.
  var allLoans = readLoansRaw_();
  var person = resolvePersonForLoanInput_(allLoans, personName, phone, data.personId);
  var personId = person.personId;

  // ---------------- MODE: ADD TO AN EXISTING LOAN ----------------
  // Creates a LoanAddition on an existing compatible loan, never another Loan.
  if (mode === "ADD_TO_EXISTING_LOAN") {
    if (!data.targetLoanId) return loanErr_("INVALID_TARGET_LOAN", "কোনো লোন নির্বাচন করা হয়নি।");
    var target = getLoanById_(data.targetLoanId);
    if (!target) return loanErr_("INVALID_TARGET_LOAN", "লোন পাওয়া যায়নি!");
    if (target.status === "CANCELLED") return loanErr_("INVALID_TARGET_LOAN", "বাতিল (CANCELLED) লোনে যোগ করা যাবে না।");
    if (!hasWalletAccess_(data.user, target.walletId)) return loanErr_("UNAUTHORIZED_LOAN", "এই লোনে আপনার অ্যাক্সেস নেই.");
    if (String(target.typeStr).toUpperCase() !== type) {
      return loanErr_("INVALID_TARGET_LOAN", type === "GIVEN" ? "GIVEN লোনে শুধু GIVEN যোগ করা যাবে।" : "TAKEN লোনে শুধু TAKEN যোগ করা যাবে।");
    }
    // The money must go to the SAME person the caller is acting for — never
    // merge a different caller's identity onto an existing loan.
    if (String(personName).trim() || String(phone).trim() || String(data.personId || "").trim()) {
      if (!loanPersonIdentityMatches_(target, personName, phone, data.personId)) {
        return loanErr_("PERSON_MISMATCH", "এই লোনটি ভিন্ন ব্যক্তির — আপনার নাম/ফোন এই লোনের সাথে মেলে না।");
      }
    }
    // The addition must be authorized for BOTH the addition wallet and the
    // target loan's wallet.
    var addPerm = authorize_(data.user, type === "GIVEN" ? "LOAN_GIVE" : "LOAN_TAKE", [data.walletId, target.walletId]);
    if (addPerm) return permErrWithCode_(addPerm);
    var additionData = {
      loanId: target.id, user: data.user, amount: String(amount), date: data.loanDate,
      walletId: data.walletId, account: data.account, currency: data.currency,
      note: data.note, requestId: data.requestId || data.clientId,
      personId: personId, personName: personName, phone: phone, type: type,
    };
    return addLoanAdditionCore_(target, additionData, getLoansSheet_());
  }

  // ---------------- MODE: NEW SEPARATE LOAN (default) ----------------

  // Optional dates are validated BEFORE the idempotency fingerprint is compared:
  // the fingerprint reads the validated dueDate/reminderDate values, so reading
  // them earlier would compare undefined and throw on every retry of a loan that
  // simply has no due date.
  var dueDate = validateOptionalLoanDate_(data.dueDate, data.loanDate, "INVALID_DUE_DATE");
  if (dueDate.error) return dueDate.error;
  var reminderDate = validateOptionalLoanDate_(data.reminderDate, data.loanDate, "INVALID_REMINDER_DATE");
  if (reminderDate.error) return reminderDate.error;

  // Idempotency FIRST: an identical retry of an already-created loan (same
  // requestId) returns the same loan before any active-loan decision — a
  // double-submit retry must never be blocked by the very loan it created.
  var requestId = String(data.requestId || data.clientId || "");
  if (requestId) {
    var dupIdx = findLoanRequestRowIndex_(requestId);
    if (dupIdx !== -1) {
      var dup = loanFromRow_(getLoansSheet_().getRange(dupIdx, 1, 1, LOAN_HEADERS.length).getValues()[0], dupIdx);
      // A retry is only the same request when EVERY submitted field matches,
      // compared in exact cents — a partial match (or a 0.005 float tolerance)
      // would silently return a different loan than the one being retried.
      var same = String(dup.user) === String(data.user) && dup.typeStr === type &&
        dup.personName === personName && sameAmount_(dup.amount, amount) &&
        String(dup.walletId) === String(data.walletId) && dup.account === data.account &&
        normDateStr_(dup.loanDate) === normDateStr_(data.loanDate) &&
        String(dup.note || "") === String(data.note || "").trim() &&
        normDateStr_(dup.dueDate) === normDateStr_(dueDate.value) &&
        normDateStr_(dup.reminderDate) === normDateStr_(reminderDate.value);
      if (!same) return loanErr_("DUPLICATE_REQUEST", "এই request ID আগে ভিন্ন তথ্য দিয়ে ব্যবহার করা হয়েছে।");
      return {
        status: "SUCCESS", message: "হাওলাত সফলভাবে যোগ হয়েছে!",
        loan: loanToClient_(dup), duplicated: true,
        transactions: effectRowsForLoan_(data.walletId, dup.id),
      };
    }
  }

  // Backend-authoritative active-loan check. Only GENUINELY outstanding loans
  // (ledger-derived; PAID / CANCELLED / DELETED / fully-repaid loans never
  // appear) require a decision. If the person has such a loan and this request
  // does NOT carry the user's explicit "separate loan" confirmation, the
  // creation is refused so the client cannot silently bypass the warning. The
  // frontend sets separateLoanConfirmed only after the warning was shown and
  // "নতুন আলাদা লোন তৈরি করুন" was chosen — that confirmed path is allowed.
  var outstandingCheck = personOutstandingLoans_(data.user, allLoans, personId, personName, phone);
  if (outstandingCheck && outstandingCheck.status === "ERROR") return outstandingCheck;
  if (outstandingCheck.loans.length > 0 && !data.separateLoanConfirmed) {
    return {
      status: "ERROR",
      code: "ACTIVE_LOAN_DECISION_REQUIRED",
      message: "সক্রিয় হাওলাত পাওয়া গেছে — আলাদা নাকি সক্রিয় লোনে যোগ করবেন, সিদ্ধান্ত নিন।",
      loans: outstandingCheck.loans,
      personId: personId,
    };
  }

  var wc = loanWalletCurrency_(data.user, data.walletId, data.account, null);
  if (wc.error) return wc.error;
  // Currency is NEVER client-supplied: derive from the wallet, reject disagreement.
  if (data.currency && data.currency !== wc.wallet.Currency) {
    return loanErr_("CURRENCY_MISMATCH", "কারেন্সি স্বয়ংক্রিয়ভাবে Wallet থেকে নেওয়া হয় — পাঠানো কারেন্সি Wallet কারেন্সির সাথে মেলে না।");
  }

  if (type === "GIVEN") {
    var balErr = requireSufficientBalance_(data.walletId, data.account, amount, null);
    if (balErr) return loanErr_("INSUFFICIENT_BALANCE", balErr.message);
  }

  var loanId = Utilities.getUuid();
  var effectRowId = "L_" + loanId;
  var ts = nowStr();
  var note = String(data.note || "").trim();
  var effectType = type === "GIVEN" ? "Loan Out" : "Loan In";

  // 1) Wallet money moves first.
  try {
    writeLoanEffectRow_(wc.wallet, effectType, amount, normDateStr_(data.loanDate), data.account, personName, effectRowId, data.user);
  } catch (e) {
    logAudit(data.user, "Loan create FAILED (wallet effect)", loanId, String(e));
    return loanErr_("DATA_CONFLICT", "হাওলাত তৈরি ব্যর্থ হয়েছে। কোনো পরিবর্তন হয়নি।");
  }
  // 2) Loan ledger row (stores the resolved stable personId).
  try {
    getLoansSheet_().appendRow([loanId, data.user, type, personId, personName, phone, amount,
      wc.wallet.Currency, normDateStr_(data.loanDate), data.walletId, data.account,
      dueDate.value || "", reminderDate.value || "", note, 0, amount, "ACTIVE", data.user, ts, ts, requestId]);
  } catch (e2) {
    // 3) Compensation: remove the wallet effect so nothing half-applies.
    var rollbackEff = true;
    var rollbackEffMsg = null;
    try { deleteEffectRow_(data.walletId, effectRowId); } catch (e3) { rollbackEff = false; rollbackEffMsg = String(e3); }
    logAudit(data.user, "Loan create FAILED" + (rollbackEff ? " — rolled back" : " — ROLLBACK ALSO FAILED — wallet effect left in place"), loanId, String(e2) + (rollbackEff ? "" : " (rollback failed: " + rollbackEffMsg + ")"));
    if (!rollbackEff) {
      invalidateLedgersAfterPartialWrite_([data.walletId]);
      return loanErr_("INCONSISTENT_STATE", "হওলাত তৈরি ব্যর্থ হয়েছে এবং পূর্বাবস্থায় ফেরত নেওয়াও যায়নি — Wallet ব্যালেন্সে অসম্পূর্ণতা থাকতে পারে। আবার চেষ্টা করবেন না; অনুগ্রহ করে Admin দিয়ে যাচাই করান। (কারণ: " + rollbackEffMsg + ")");
    }
    return loanErr_("DATA_CONFLICT", "হওলাত তৈরি ব্যর্থ হয়েছে এবং পূর্বাবস্থায় ফেরত নেওয়া হয়েছে। আবার চেষ্টা করুন।");
  }
  cacheRemove_("loans", loansCacheKey_());

  logAudit(data.user, "Loan created", loanId, type + " " + amount + " " + wc.wallet.Currency + " (" + effectType + ")");
  var created = recalcLoan_(loanId, getLoansSheet_());
  return {
    status: "SUCCESS", message: "হাওলাত সফলভাবে যোগ হয়েছে!",
    loan: loanToClient_(created),
    transactions: [effectTxnObj_(wc.wallet, effectType, amount, normDateStr_(data.loanDate), data.account, personName, effectRowId, data.user)],
  };
}

function effectRowsForLoan_(walletId, loanId) {
  var resolved = resolveWalletSheet_(walletId);
  if (!resolved) return [];
  var rn = findTxnRow_(resolved.sheet, "L_" + loanId);
  if (rn === -1) return [];
  var vals = resolved.sheet.getRange(rn, 1, 1, TRANSACTION_HEADERS.length).getValues()[0];
  var row = rowValsToObj_(vals);
  return [txnResultObj_(row.ID, row.Date, row.Type, row.Currency, row.Account, row.SourceCategory,
    row.WhereVendor, row.Description, row.Amount, row.Note, row.User, walletId, resolved.wallet.WalletName)];
}

// ---------------- API: UPDATE LOAN ----------------

function updateLoan(data, adminUsername) {
  setupDatabase();
  var permErr = requirePermission_(adminUsername, "MANAGE_LOANS");
  if (permErr) return permErrWithCode_(permErr);

  if (!data || !data.id) return loanErr_("LOAN_NOT_FOUND", "লোন পাওয়া যায়নি!");
  var sheet = getLoansSheet_();
  var rowIdx = findLoanRowIndex_(data.id);
  if (rowIdx === -1) return loanErr_("LOAN_NOT_FOUND", "লোন পাওয়া যায়নি!");
  var loan = loanFromRow_(sheet.getRange(rowIdx, 1, 1, LOAN_HEADERS.length).getValues()[0], rowIdx);
  if (!hasWalletAccess_(adminUsername, loan.walletId)) return loanErr_("UNAUTHORIZED_LOAN", "এই লোনে আপনার অ্যাক্সেস নেই.");
  if (loan.status === "CANCELLED") return loanErr_("DATA_CONFLICT", "বাতিল (CANCELLED) লোন এডিট করা যাবে না।");

  var updated = {
    personId: data.personId || loan.personId,
    personName: data.personName !== undefined && data.personName !== null && String(data.personName).trim() ? String(data.personName).trim() : loan.personName,
    phone: data.phone !== undefined && data.phone !== null && String(data.phone).trim() ? String(data.phone).trim() : loan.phone,
    // Canonical cents when the submitted amount is valid; an invalid value is
    // passed through untouched so the check below can report exactly what was
    // wrong with it instead of "0".
    amount: data.amount !== undefined && data.amount !== null && data.amount !== ""
      ? (isValidAmount_(data.amount) ? amountOf_(toCents_(data.amount)) : data.amount)
      : loan.amount,
    loanDate: data.loanDate ? data.loanDate : loan.loanDate,
    walletId: data.walletId ? String(data.walletId) : loan.walletId,
    account: data.account ? String(data.account) : loan.account,
    dueDate: data.dueDate !== undefined ? data.dueDate : loan.dueDate,
    reminderDate: data.reminderDate !== undefined ? data.reminderDate : loan.reminderDate,
    note: data.note !== undefined ? String(data.note).trim() : loan.note,
  };

  if (!String(updated.personName).trim()) return loanErr_("INVALID_PERSON", "ব্যক্তির নাম লিখুন।");
  if (!String(updated.phone).trim()) return loanErr_("PHONE_REQUIRED", "ফোন নম্বর আবশ্যক।");
  if (!isValidLoanPhone_(updated.phone)) return loanErr_("INVALID_PHONE", "সঠিক ফোন নম্বর দিন।");
  var stUp = getLoanFinancialState_(loan);
  var addSum = stUp.additionalAmount;
  if (!isValidAmount_(updated.amount)) return loanErr_("INVALID_AMOUNT", amountError_(updated.amount));
  // Compared in exact cents (not with a 0.005 float tolerance) so a new total
  // that is even one cent below what was already repaid is always refused.
  if (toCents_(updated.amount) + centsOf_(addSum) < centsOf_(stUp.totalRepaid)) {
    return loanErr_("CANNOT_REDUCE_LOAN_BELOW_REPAID_AMOUNT", "নতুন পরিমাণ ইতিমধ্যে ফেরত হওয়া টাকার কম হতে পারবে না।");
  }
  if (!isValidTransactionDate_(updated.loanDate)) return loanErr_("INVALID_DATE", "সঠিক তারিখ দিন।");
  var dueDate = validateOptionalLoanDate_(updated.dueDate, updated.loanDate, "INVALID_DUE_DATE");
  if (dueDate.error) return dueDate.error;
  var reminderDate = validateOptionalLoanDate_(updated.reminderDate, updated.loanDate, "INVALID_REMINDER_DATE");
  if (reminderDate.error) return reminderDate.error;

  // A loan's established currency NEVER changes, regardless of how much has
  // been repaid (repayment status alone must not unlock a currency swap).
  // Any wallet/account change must still match the loan's original currency.
  var wc = loanWalletCurrency_(adminUsername, updated.walletId, updated.account, loan.currency, loan.account);
  if (wc.error) return wc.error;

  var effectRowId = "L_" + loan.id;
  var snap = loadEffectRowSnapshot_(loan.walletId, effectRowId);
  var walletsChanged = String(updated.walletId) !== String(loan.walletId);

  // Refuse a wallet move the moment the loan has any financial history, BEFORE
  // any balance check or sheet write, so a rejected request can never leave the
  // old and new wallet disagreeing about the loan.
  if (walletsChanged) {
    var walletLockedMsg = loanWalletLockReason_(loan);
    if (walletLockedMsg) return loanErr_("LOAN_WALLET_CHANGE_NOT_ALLOWED", walletLockedMsg);
  }

  // GIVEN loans drive money OUT of the owning wallet. When the wallet changes,
  // the destination wallet must absorb the FULL amount; otherwise verify the
  // increase against the balance after the old outflow is removed.
  if (loan.typeStr === "GIVEN") {
    var balErr;
    if (walletsChanged) {
      balErr = requireSufficientBalance_(updated.walletId, updated.account, updated.amount, null);
    } else if (toCents_(updated.amount) > toCents_(loan.amount)) {
      balErr = requireSufficientBalance_(updated.walletId, updated.account, updated.amount, effectRowId);
    }
    if (balErr) return loanErr_("INSUFFICIENT_BALANCE", balErr.message);
  }

  // ---- apply wallet effect change first ----
  try {
    if (walletsChanged) {
      var resolvedNew = resolveWalletSheet_(updated.walletId);
      if (!resolvedNew) throw new Error("target wallet sheet missing");
      deleteEffectRow_(loan.walletId, effectRowId);
      writeLoanEffectRow_(resolvedNew.wallet, loan.typeStr === "GIVEN" ? "Loan Out" : "Loan In",
        updated.amount, updated.loanDate, updated.account, updated.personName, effectRowId, adminUsername);
      cacheRemove_("txns", "txns_" + loan.walletId);
    } else if (snap) {
      // in-place update of date/account/amount
      var effectType = loan.typeStr === "GIVEN" ? "Loan Out" : "Loan In";
      snap.resolved.sheet.getRange(snap.rowNum, 2, 1, 9).setValues([[
        updated.loanDate, effectType, snap.resolved.wallet.Currency, updated.account,
        "Loan", updated.personName, loanEffectDescription_(effectType), updated.amount, updated.note,
      ]]);
      cacheRemove_("txns", "txns_" + loan.walletId);
    }
  } catch (e) {
    try {
      if (walletsChanged) {
        // delete of the old row happened; re-append the snapshot to the OLD wallet
        restoreEffectRowAfterMove_(loan.walletId, snap);
      } else if (snap) {
        // in-place write failed; the row is still intact, overwrite it with the snapshot
        snap.resolved.sheet.getRange(snap.rowNum, 1, 1, TRANSACTION_HEADERS.length).setValues([snap.row]);
      }
    } catch (e2) {
      invalidateLedgersAfterPartialWrite_([loan.walletId, data.walletId]);
      return loanErr_("INCONSISTENT_STATE",
        "লোন আপডেট ব্যর্থ হয়েছে এবং Wallet ব্যালেন্স পূর্বাবস্থায় ফেরত নেওয়াও যায়নি — হিসাবে অসম্পূর্ণতা থাকতে পারে। অনুগ্রহ করে Admin দিয়ে যাচাই করান। (কারণ: " + String(e2) + ")");
    }
    logAudit(adminUsername, "Loan update FAILED - rolled back", loan.id, String(e));
    return loanErr_("DATA_CONFLICT", "লোন আপডেট ব্যর্থ হয়েছে এবং পূর্বাবস্থায় ফেরত নেওয়া হয়েছে।");
  }

  // ---- then apply ledger changes ----
  var newTotal = updated.amount + addSum;
  var newRemaining = newTotal - stUp.totalRepaid;
  var newStatus = computeLoanStatus_(newTotal, stUp.totalRepaid, dueDate.value || loan.dueDate);
  var loanRowSnapshot = sheet.getRange(rowIdx, 1, 1, LOAN_HEADERS.length).getValues()[0];
  try {
    sheet.getRange(rowIdx, 5, 1, 13).setValues([[
      updated.personName, updated.phone, updated.amount, wc.wallet.Currency, normDateStr_(updated.loanDate),
      updated.walletId, updated.account, dueDate.value || "", reminderDate.value || "", updated.note,
      stUp.totalRepaid, newRemaining, newStatus,
    ]]);
    sheet.getRange(rowIdx, 20, 1, 1).setValue(nowStr());
  } catch (e) {
    try {
      sheet.getRange(rowIdx, 1, 1, LOAN_HEADERS.length).setValues([loanRowSnapshot]);
      if (walletsChanged) {
        // undo the move: drop the new wallet's row, restore the old snapshot
        deleteEffectRow_(updated.walletId, effectRowId);
        restoreEffectRowAfterMove_(loan.walletId, snap);
      } else if (snap) {
        // undo the in-place effect edit by overwriting the original row
        snap.resolved.sheet.getRange(snap.rowNum, 1, 1, TRANSACTION_HEADERS.length).setValues([snap.row]);
      }
    } catch (e2) {
      invalidateLedgersAfterPartialWrite_([loan.walletId, data.walletId]);
      return loanErr_("INCONSISTENT_STATE",
        "লোন আপডেট ব্যর্থ হয়েছে এবং Wallet ব্যালেন্স পূর্বাবস্থায় ফেরত নেওয়াও যায়নি — হিসাবে অসম্পূর্ণতা থাকতে পারে। অনুগ্রহ করে Admin দিয়ে যাচাই করান। (কারণ: " + String(e2) + ")");
    }
    logAudit(adminUsername, "Loan update FAILED - ledger rollback", loan.id, String(e));
    return loanErr_("DATA_CONFLICT", "লোন আপডেট ব্যর্থ হয়েছে এবং পূর্বাবস্থায় ফেরত নেওয়া হয়েছে।");
  }
  cacheRemove_("loans", loansCacheKey_());

  logAudit(adminUsername, "Loan updated", loan.id, "amount=" + updated.amount + " " + wc.wallet.Currency);
  var refreshed = recalcLoan_(loan.id, sheet);
  return { status: "SUCCESS", message: "হাওলাত আপডেট হয়েছে!", loan: loanToClient_(refreshed) };
}

// eslint-style defensive: image of intent for delete helpers used above
function restoreEffectRowAfterMove_(oldWalletId, snap) {
  // If the snapshot still exists in the OLD sheet it must be restored in place;
  // otherwise re-append the captured row to the old wallet sheet. The row id is
  // read verbatim from the snapshot so L_/P_/A_ effect rows all work.
  if (!snap) return;
  var resolved = resolveWalletSheet_(oldWalletId);
  if (!resolved) return;
  var rn = findTxnRow_(resolved.sheet, String(snap.row ? snap.row[0] : ""));
  if (rn === -1) resolved.sheet.appendRow(snap.row);
  cacheRemove_("txns", "txns_" + oldWalletId);
}

// ---------------- API: DELETE LOAN (SOFT / CANCELLED) ----------------

function deleteLoan(loanId, adminUsername) {
  setupDatabase();
  var permErr = requirePermission_(adminUsername, "MANAGE_LOANS");
  if (permErr) return permErrWithCode_(permErr);

  var sheet = getLoansSheet_();
  var rowIdx = findLoanRowIndex_(loanId);
  if (rowIdx === -1) return loanErr_("LOAN_NOT_FOUND", "লোন পাওয়া যায়নি!");
  var loan = loanFromRow_(sheet.getRange(rowIdx, 1, 1, LOAN_HEADERS.length).getValues()[0], rowIdx);
  if (!hasWalletAccess_(adminUsername, loan.walletId)) return loanErr_("UNAUTHORIZED_LOAN", "এই লোনে আপনার অ্যাক্সেস নেই।");

  if (loan.status !== "CANCELLED") {
    // Reverse EVERY wallet effect this loan created — the initial Loan Out /
    // Loan In row, each repayment's Loan Repaid / Loan Payment row, and each
    // addition's effect row — so a cancelled loan never leaves cash moved in a
    // wallet with no ledger behind it. This is NOT best-effort: if any reversal
    // genuinely fails we restore what was already undone and refuse to CANCELLED
    // the loan, keeping the financial state consistent.
    var effects = [{ walletId: loan.walletId, effectRowId: "L_" + loanId }];
    var pays = readPaymentsForLoan_(loanId);
    for (var i = 0; i < pays.length; i++) {
      effects.push({ walletId: pays[i].walletId, effectRowId: "P_" + pays[i].id });
    }
    var adds = readAdditionsForLoan_(loanId);
    for (var j = 0; j < adds.length; j++) {
      effects.push({ walletId: adds[j].walletId, effectRowId: "A_" + adds[j].id });
    }

    var removed = [];
    var reversalFailed = "";
    var reversalErrorMsg = "";
    for (var k = 0; k < effects.length; k++) {
      var ef = effects[k];
      // Legacy loans may predate wallet-effect rows — no snapshot means there is
      // nothing to reverse, which is fine. Only a real failure blocks cancelling.
      var snap = loadEffectRowSnapshot_(ef.walletId, ef.effectRowId);
      if (!snap) continue;
      try {
        deleteEffectRow_(ef.walletId, ef.effectRowId);
        removed.push(snap);
      } catch (e) {
        reversalFailed = ef.effectRowId;
        reversalErrorMsg = String(e);
        break;
      }
    }
    if (reversalFailed) {
      // Rollback: put back every wallet row we already removed. A restore that
      // also fails leaves the sheet half-reversed, so we must NOT claim that
      // nothing changed — the caller is told to have an admin verify.
      var restoreFailures = [];
      for (var r = removed.length - 1; r >= 0; r--) {
        try { restoreEffectRowSnapshot_(removed[r]); } catch (e2) { restoreFailures.push(String(e2)); }
      }
      logAudit(adminUsername, "Loan cancel FAILED — wallet reversal error", loanId, reversalFailed + " :: " + reversalErrorMsg + (restoreFailures.length ? " :: restore failed: " + restoreFailures.join(" | ") : ""));
      if (restoreFailures.length) {
        invalidateLedgersAfterPartialWrite_([loan.walletId]);
        return loanErr_("INCONSISTENT_STATE",
          "হাওলাত বাতিল করা যায়নি এবং কিছু Wallet সম্পত্তি পূর্বাবস্থায় ফেরত নেওয়াও যায়নি — হিসাবে অসম্পূর্ণতা থাকতে পারে। অনুগ্রহ করে Admin দিয়ে যাচাই করান। (কারণ: " + restoreFailures.join(" | ") + ")");
      }
      return loanErr_("DATA_CONFLICT", "হাওলাত বাতিল করা যায়নি — Wallet সম্পত্তি মুছতে সমস্যা হয়েছে। কোনো পরিবর্তন হয়নি।");
    }

    sheet.getRange(rowIdx, 17, 1, 1).setValue("CANCELLED");
    sheet.getRange(rowIdx, 20, 1, 1).setValue(nowStr());
    cacheRemove_("loans", loansCacheKey_());
    logAudit(adminUsername, "Loan cancelled (soft delete)", loanId, loan.amount + " " + loan.currency + " + " + pays.length + " effect rows reversed");
  }
  var cancelled = loanFromRow_(sheet.getRange(rowIdx, 1, 1, LOAN_HEADERS.length).getValues()[0], rowIdx);
  return { status: "SUCCESS", message: "হাওলাত বাতিল (CANCELLED) করা হয়েছে।", loan: loanToClient_(cancelled) };
}

// ---------------- API: ADD PAYMENT ----------------

function addLoanPayment(data) {
  setupDatabase();
  if (!data || !data.user) return err_("ফেরতের প্রয়োজনীয় তথ্য অসম্পূর্ণ!");

  if (!data.loanId) return loanErr_("LOAN_NOT_FOUND", "লোন পাওয়া যায়নি!");
  var loansSheet = getLoansSheet_();
  var loanRowIdx = findLoanRowIndex_(data.loanId);
  if (loanRowIdx === -1) return loanErr_("LOAN_NOT_FOUND", "লোন পাওয়া যায়নি!");
  var loan = loanFromRow_(loansSheet.getRange(loanRowIdx, 1, 1, LOAN_HEADERS.length).getValues()[0], loanRowIdx);
  // Wallet scope first, then action: repayment must be scoped to BOTH the
  // payment wallet and the loan's own wallet.
  var permErr = authorize_(data.user, "LOAN_PAYMENT", [data.walletId, loan.walletId]);
  if (permErr) return permErrWithCode_(permErr);
  if (loan.status === "CANCELLED") return loanErr_("DATA_CONFLICT", "বাতিল (CANCELLED) লোনে ফেরত যোগ করা যাবে না।");
  // A repayment always moves money through the LOAN'S OWN wallet — never a
  // different wallet, even one with the same currency (§8/§9). The account may
  // still be chosen (Cash/Bank) within that wallet.
  if (String(data.walletId) !== String(loan.walletId)) {
    return loanErr_("REPAYMENT_WALLET_CHANGE_NOT_ALLOWED", "ফেরতের Wallet লোনের Wallet-ই হতে হবে — লোনের নিজস্ব Wallet ব্যবহার করুন।");
  }

  // ---- 1. request shape / field validation ----
  if (!isValidAmount_(data.amount)) return loanErr_("INVALID_AMOUNT", amountError_(data.amount));
  var amount = amountOf_(toCents_(data.amount));
  if (amount <= 0) return loanErr_("INVALID_AMOUNT", "টাকার পরিমাণ ০-এর বেশি হতে হবে।");
  if (!isValidTransactionDate_(data.paymentDate)) return loanErr_("INVALID_DATE", "সঠিক তারিখ দিন।");
  var paymentDate = normDateStr_(data.paymentDate);
  if (paymentDate < normDateStr_(loan.loanDate)) {
    return loanErr_("INVALID_DATE", "ফেরতের তারিখ হাওলাতের তারিখের আগে হতে পারবে না।");
  }

  var wc = loanWalletCurrency_(data.user, data.walletId, data.account, loan.currency);
  if (wc.error) return wc.error;
  if (data.currency && data.currency !== wc.wallet.Currency) {
    return loanErr_("CURRENCY_MISMATCH", "কারেন্সি স্বয়ংক্রিয়ভাবে Wallet থেকে নেওয়া হয় — পাঠানো কারেন্সি Wallet কারেন্সির সাথে মেলে না।");
  }

  // ---- 2. requestId duplicate / conflict handling ----
  // Runs AFTER the shape checks above but BEFORE every state-dependent
  // decision. Checking it last was a real bug: the balance, already-paid and
  // overpayment checks all evaluate the ledger that this very request changes,
  // so a retry of a payment that did land came back as
  // INSUFFICIENT_BALANCE / LOAN_ALREADY_PAID / REPAYMENT_EXCEEDS_LOAN and the
  // client could never tell a duplicate submit from a genuine failure.
  var note = String(data.note || "").trim();
  var requestId = String(data.requestId || data.clientId || "");
  if (requestId) {
    var dupIdx = findPaymentRequestRowIndex_(requestId);
    if (dupIdx !== -1) {
      var pSheet = getLoanPaymentsSheet_();
      var dupRow = pSheet.getRange(dupIdx, 1, 1, LOAN_PAYMENT_HEADERS.length).getValues()[0];
      var dupPayment = paymentFromRow_(dupRow, dupIdx);
      // A retry is only the same request when EVERY submitted field matches —
      // loanId, amount, wallet, account, paymentDate AND note. The note is part
      // of the fingerprint: two repayments of the same amount on the same day
      // to the same wallet are genuinely different repayments, so without it a
      // second real repayment was silently swallowed as a duplicate, and an
      // edited retry was silently accepted as the original.
      var match = String(dupPayment.loanId) === String(data.loanId) && sameAmount_(dupPayment.amount, amount) &&
        String(dupPayment.walletId) === String(data.walletId) && dupPayment.account === data.account &&
        dupPayment.paymentDate === paymentDate && String(dupPayment.note || "").trim() === note;
      if (!match) return loanErr_("DUPLICATE_REQUEST", "এই request ID আগে ভিন্ন তথ্য দিয়ে ব্যবহার করা হয়েছে।");
      return { status: "SUCCESS", message: "ফেরত সফলভাবে যোগ হয়েছে!", payment: paymentToClient_(dupPayment), loan: loanToClient_(recalcLoan_(loan.id, loansSheet)), duplicated: true };
    }
  }

  // ---- 2. requestId duplicate / conflict handling ----
  // ---- 3. authoritative financial-state decisions (after idempotency) ----
  var stPay = getLoanFinancialState_(loan);
  var remaining = stPay.remainingAmount;
  if (centsOf_(remaining) <= 0) return loanErr_("LOAN_ALREADY_PAID", "এই হাওলাত সম্পূর্ণ ফেরত হয়েছে।");
  // Both sides are cent-exact (amount comes from toCents_, remaining from
  // amountOf_ of an integer), so an epsilon is unnecessary — a real
  // overpayment is at least a full cent and is REJECTED, never silently
  // clamped down (§11: do not silently clamp the remaining).
  if (toCents_(amount) > centsOf_(remaining)) return loanErr_("REPAYMENT_EXCEEDS_LOAN", "ফেরতের পরিমাণ বাকি টাকার চেয়ে বেশি হতে পারবে না।");

  // Payment type is derived from the LOAN type — never trusted from the client.
  var payType = loan.typeStr === "GIVEN" ? "RECEIVED" : "PAID";
  var effectType = loan.typeStr === "GIVEN" ? "Loan Repaid" : "Loan Payment";
  if (loan.typeStr === "TAKEN") {
    var balErr = requireSufficientBalance_(data.walletId, data.account, amount, null);
    if (balErr) return loanErr_("INSUFFICIENT_BALANCE", balErr.message);
  }

  // ---- 4. writes ----
  var paymentId = Utilities.getUuid();
  var effectRowId = "P_" + paymentId;
  var ts = nowStr();

  try {
    getLoanPaymentsSheet_().appendRow([paymentId, loan.id, data.user, payType, amount, loan.currency,
      data.walletId, data.account, paymentDate, note, data.user, ts, requestId]);
  } catch (e) {
    return loanErr_("DATA_CONFLICT", "ফেরত যোগ করতে ব্যর্থ হয়েছে। কোনো পরিবর্তন হয়নি।");
  }
  try {
    writeLoanEffectRow_(wc.wallet, effectType, amount, paymentDate, data.account, loan.personName, effectRowId, data.user);
  } catch (e2) {
    // Compensation: remove the just-written payment record.
    var payRollbackErr = null;
    try {
      var prn = findPaymentRowIndex_(paymentId);
      if (prn !== -1) getLoanPaymentsSheet_().deleteRow(prn);
    } catch (e3) { payRollbackErr = String(e3); }
    cacheRemove_("loans", loansCacheKey_());
    logAudit(data.user, "Loan payment FAILED - rolled back", loan.id, String(e2) + (payRollbackErr ? " (rollback failed: " + payRollbackErr + ")" : ""));
    if (payRollbackErr) {
      invalidateLedgersAfterPartialWrite_([data.walletId, loan.walletId]);
      return loanErr_("INCONSISTENT_STATE",
        "ফেরত যোগ করতে ব্যর্থ হয়েছে এবং রেকর্ড পূর্বাবস্থায় ফেরত নেওয়াও যায়নি — হিসাবে অসম্পূর্ণতা থাকতে পারে। অনুগ্রহ করে Admin দিয়ে যাচাই করান। (কারণ: " + payRollbackErr + ")");
    }
    return loanErr_("DATA_CONFLICT", "ফেরত যোগ করতে ব্যর্থ হয়েছে এবং পূর্বাবস্থায় ফেরত নেওয়া হয়েছে। (কারণ: " + String(e2) + ")");
  }

  logAudit(data.user, "Loan payment", loan.id, payType + " " + amount + " " + loan.currency);
  var refreshed = recalcLoan_(loan.id, loansSheet);
  var newPayment = paymentFromRow_(getLoanPaymentsSheet_().getRange(findPaymentRowIndex_(paymentId), 1, 1, LOAN_PAYMENT_HEADERS.length).getValues()[0]);
  return {
    status: "SUCCESS", message: "ফেরত সফলভাবে যোগ হয়েছে!",
    transaction: paymentToClient_(newPayment), loan: loanToClient_(refreshed),
    transactions: [effectTxnObj_(wc.wallet, effectType, amount, paymentDate, data.account, loan.personName, effectRowId, data.user)],
  };
}

function paymentFromRow_(row, rowIndex) {
  return {
    _row: rowIndex || -1,
    id: String(row[0] || ""), loanId: String(row[1] || ""), user: row[2] || "",
    type: String(row[3] || "").toUpperCase(), amount: parseFloat(row[4]) || 0,
    currency: row[5] || "", walletId: row[6] || "", account: row[7] || "",
    paymentDate: normDateStr_(row[8]), note: row[9] || "", createdBy: row[10] || "",
    createdAt: row[11] || "", requestId: row[12] || "",
  };
}

// ---------------- API: UPDATE PAYMENT ----------------

function updateLoanPayment(data, adminUsername) {
  setupDatabase();
  var permErr = requirePermission_(adminUsername, "MANAGE_LOAN_TRANSACTIONS");
  if (permErr) return permErrWithCode_(permErr);

  if (!data || !data.id) return loanErr_("LOAN_NOT_FOUND", "পেমেন্ট পাওয়া যায়নি!");
  var paySheet = getLoanPaymentsSheet_();
  var payRowIdx = findPaymentRowIndex_(data.id);
  if (payRowIdx === -1) return loanErr_("LOAN_NOT_FOUND", "পেমেন্ট পাওয়া যায়নি!");
  var payment = paymentFromRow_(paySheet.getRange(payRowIdx, 1, 1, LOAN_PAYMENT_HEADERS.length).getValues()[0], payRowIdx);
  if (!hasWalletAccess_(adminUsername, payment.walletId)) return loanErr_("UNAUTHORIZED_LOAN", "এই পেমেন্টে আপনার অ্যাক্সেস নেই।");

  var loansSheet = getLoansSheet_();
  var loanRowIdx = findLoanRowIndex_(payment.loanId);
  if (loanRowIdx === -1) return loanErr_("LOAN_NOT_FOUND", "লোন পাওয়া যায়নি!");
  var loan = loanFromRow_(loansSheet.getRange(loanRowIdx, 1, 1, LOAN_HEADERS.length).getValues()[0], loanRowIdx);
  if (!hasWalletAccess_(adminUsername, loan.walletId)) return loanErr_("UNAUTHORIZED_LOAN", "এই লোনে আপনার অ্যাক্সেস নেই.");
  if (loan.status === "CANCELLED") return loanErr_("DATA_CONFLICT", "বাতিল (CANCELLED) লোনের পেমেন্ট এডিট করা যাবে না।");

  if (!isValidAmount_(data.amount)) return loanErr_("INVALID_AMOUNT", amountError_(data.amount));
  var newAmount = amountOf_(toCents_(data.amount));
  var stUpPay = getLoanFinancialState_(loan);
  var otherPayments = readPaymentsForLoan_(loan.id).filter(function (p) { return p.id !== payment.id; });
  // Exact-cent sum: the other payments plus the new one must not exceed the
  // authoritative loan total.
  var otherTotalCents = sumAmounts_(otherPayments.map(function (p) { return p.amount; }));
  if (otherTotalCents + toCents_(newAmount) > centsOf_(stUpPay.totalLoanAmount)) {
    return loanErr_("REPAYMENT_EXCEEDS_LOAN", "সকল পেমেন্ট মিলিয়ে মূল লোনের পরিমাণের বেশি হতে পারবে না।");
  }

  var paymentDate = data.paymentDate ? data.paymentDate : payment.paymentDate;
  if (!isValidTransactionDate_(paymentDate)) return loanErr_("INVALID_DATE", "সঠিক তারিখ দিন।");
  if (normDateStr_(paymentDate) < normDateStr_(loan.loanDate)) {
    return loanErr_("INVALID_DATE", "ফেরতের তারিখ হাওলাতের তারিখের আগে হতে পারবে না।");
  }
  var walletId = data.walletId ? String(data.walletId) : payment.walletId;
  var account = data.account ? String(data.account) : payment.account;
  // The repayment wallet is LOCKED to the wallet it was recorded in (which new
  // repayments always set to the loan's own wallet). Moving a repayment onto a
  // different wallet is forbidden (§10) — only the Account may change.
  if (String(walletId) !== String(payment.walletId)) {
    return loanErr_("REPAYMENT_WALLET_CHANGE_NOT_ALLOWED", "ফেরতের Wallet পরিবর্তন করা যাবে না — অর্থ লোনের Wallet-এ লক করা আছে।");
  }
  walletId = payment.walletId;
  var wc = loanWalletCurrency_(adminUsername, walletId, account, loan.currency, payment.account);
  if (wc.error) return wc.error;
  if (data.currency && data.currency !== wc.wallet.Currency) {
    return loanErr_("CURRENCY_MISMATCH", "কারেন্সি স্বয়ংক্রিয়ভাবে Wallet থেকে নেওয়া হয় — পাঠানো কারেন্সি Wallet কারেন্সির সাথে মেলে না।");
  }

  var effectType = loan.typeStr === "GIVEN" ? "Loan Repaid" : "Loan Payment";
  var effectRowId = "P_" + payment.id;
  // The repayment wallet is locked to payment.walletId above, so a wallet move
  // is currently impossible and every `walletsChanged` branch below is
  // unreachable. They are kept deliberately: if that lock is ever relaxed, the
  // move + restore-on-failure logic is already written and reviewed.
  var walletsChanged = false;

  // TAKEN repayment is money leaving the wallet ("Loan Payment" = -). When the
  // wallet changes, the destination must absorb the FULL amount; otherwise
  // verify the increase against the balance after the old row is removed.
  if (loan.typeStr === "TAKEN") {
    var balErr;
    if (walletsChanged) {
      balErr = requireSufficientBalance_(walletId, account, newAmount, null);
    } else if (toCents_(newAmount) > toCents_(payment.amount)) {
      balErr = requireSufficientBalance_(walletId, account, newAmount, effectRowId);
    }
    if (balErr) return loanErr_("INSUFFICIENT_BALANCE", balErr.message);
  }

  // TAKEN repayment is money leaving the wallet ("Loan Payment" = -). The old
  // P_ row is excluded because it is about to be replaced — the wallet must
  // still end up non-negative for the full new amount. (see walletsChanged above)
  var snap = loadEffectRowSnapshot_(payment.walletId, effectRowId);
  try {
    if (walletsChanged) {
      deleteEffectRow_(payment.walletId, effectRowId);
      var resolvedNew = resolveWalletSheet_(walletId);
      if (!resolvedNew) throw new Error("target wallet sheet missing");
      writeLoanEffectRow_(resolvedNew.wallet, effectType, newAmount, paymentDate, account, loan.personName, effectRowId, adminUsername);
    } else if (snap) {
      snap.resolved.sheet.getRange(snap.rowNum, 2, 1, 9).setValues([[
        paymentDate, effectType, snap.resolved.wallet.Currency, account, "Loan",
        loan.personName, loanEffectDescription_(effectType), newAmount, data.note !== undefined ? String(data.note).trim() : payment.note,
      ]]);
    }
  } catch (e) {
    try {
      if (walletsChanged) {
        // delete of the old row happened; re-append the snapshot to the OLD wallet
        restoreEffectRowAfterMove_(payment.walletId, snap);
      } else if (snap) {
        // in-place write failed; the row is still intact, overwrite it with the snapshot
        snap.resolved.sheet.getRange(snap.rowNum, 1, 1, TRANSACTION_HEADERS.length).setValues([snap.row]);
      }
    } catch (e2) {
      invalidateLedgersAfterPartialWrite_([payment.walletId, loan.walletId]);
      return loanErr_("INCONSISTENT_STATE",
        "পেমেন্ট আপডেট ব্যর্থ হয়েছে এবং Wallet ব্যালেন্স পূর্বাবস্থায় ফেরত নেওয়াও যায়নি — হিসাবে অসম্পূর্ণতা থাকতে পারে। অনুগ্রহ করে Admin দিয়ে যাচাই করান। (কারণ: " + String(e2) + ")");
    }
    logAudit(adminUsername, "Loan payment update FAILED — rolled back", payment.id, String(e));
    return loanErr_("DATA_CONFLICT", "পেমেন্ট আপডেট ব্যর্থ হয়েছে এবং পূর্বাবস্থায় ফেরত নেওয়া হয়েছে।");
  }

  var payRowSnapshot = paySheet.getRange(payRowIdx, 1, 1, LOAN_PAYMENT_HEADERS.length).getValues()[0];
  try {
    paySheet.getRange(payRowIdx, 5, 1, 4).setValues([[newAmount, loan.currency, walletId, account]]);
    paySheet.getRange(payRowIdx, 9, 1, 1).setValue(normDateStr_(paymentDate));
    paySheet.getRange(payRowIdx, 10, 1, 1).setValue(data.note !== undefined ? String(data.note).trim() : payment.note);
  } catch (e2) {
    var payLedgRollbackErr = null;
    try {
      paySheet.getRange(payRowIdx, 1, 1, LOAN_PAYMENT_HEADERS.length).setValues([payRowSnapshot]);
      if (snap) {
        if (walletsChanged) {
          // undo the move: drop the new wallet's row, restore the old snapshot
          deleteEffectRow_(walletId, effectRowId);
          restoreEffectRowAfterMove_(payment.walletId, snap);
        } else {
          // undo the in-place effect edit by overwriting the original row
          snap.resolved.sheet.getRange(snap.rowNum, 1, 1, TRANSACTION_HEADERS.length).setValues([snap.row]);
        }
      }
    } catch (e3) { payLedgRollbackErr = String(e3); }
    if (payLedgRollbackErr) {
      invalidateLedgersAfterPartialWrite_([payment.walletId, loan.walletId]);
      return loanErr_("INCONSISTENT_STATE",
        "পেমেন্ট আপডেট ব্যর্থ হয়েছে এবং পূর্বাবস্থায় ফেরত নেওয়াও যায়নি — হিসাবে অসম্পূর্ণতা থাকতে পারে। অনুগ্রহ করে Admin দিয়ে যাচাই করান। (কারণ: " + payLedgRollbackErr + ")");
    }
    return loanErr_("DATA_CONFLICT", "পেমেন্ট আপডেট ব্যর্থ হয়েছে এবং পূর্বাবস্থায় ফেরত নেওয়া হয়েছে।");
  }
  cacheRemove_("loans", loansCacheKey_());

  logAudit(adminUsername, "Loan payment updated", payment.loanId, payment.id + " amount=" + newAmount);
  var refreshed = recalcLoan_(loan.id, loansSheet);
  var updatedPayment = paymentFromRow_(paySheet.getRange(payRowIdx, 1, 1, LOAN_PAYMENT_HEADERS.length).getValues()[0], payRowIdx);
  return { status: "SUCCESS", message: "ফেরত আপডেট হয়েছে!", payment: paymentToClient_(updatedPayment), loan: loanToClient_(refreshed) };
}

// ---------------- API: DELETE PAYMENT ----------------

function deleteLoanPayment(paymentId, adminUsername) {
  setupDatabase();
  var permErr = requirePermission_(adminUsername, "MANAGE_LOAN_TRANSACTIONS");
  if (permErr) return permErrWithCode_(permErr);

  var paySheet = getLoanPaymentsSheet_();
  var payRowIdx = findPaymentRowIndex_(paymentId);
  if (payRowIdx === -1) return loanErr_("LOAN_NOT_FOUND", "পেমেন্ট পাওয়া যায়নি!");
  var payment = paymentFromRow_(paySheet.getRange(payRowIdx, 1, 1, LOAN_PAYMENT_HEADERS.length).getValues()[0], payRowIdx);
  if (!hasWalletAccess_(adminUsername, payment.walletId)) return loanErr_("UNAUTHORIZED_LOAN", "এই পেমেন্টে আপনার অ্যাক্সেস নেই।");

  var loansSheet = getLoansSheet_();
  var loanRowIdx = findLoanRowIndex_(payment.loanId);
  if (loanRowIdx === -1) return loanErr_("LOAN_NOT_FOUND", "লোন পাওয়া যায়নি!");
  var loan = loanFromRow_(loansSheet.getRange(loanRowIdx, 1, 1, LOAN_HEADERS.length).getValues()[0], loanRowIdx);
  if (!hasWalletAccess_(adminUsername, loan.walletId)) return loanErr_("UNAUTHORIZED_LOAN", "এই লোনে আপনার অ্যাক্সেস নেই.");
  if (loan.status === "CANCELLED") return loanErr_("DATA_CONFLICT", "বাতিল (CANCELLED) লোনের পেমেন্ট মুছে ফেলা যাবে না।");

  // Reverse the wallet effect FIRST (deleting money movement back out).
  var effectRowId = "P_" + payment.id;
  var snap = loadEffectRowSnapshot_(payment.walletId, effectRowId);
  try {
    deleteEffectRow_(payment.walletId, effectRowId);
  } catch (e) {
    return loanErr_("DATA_CONFLICT", "পেমেন্ট মুছতে ব্যর্থ হয়েছে। কোনো পরিবর্তন হয়নি।");
  }
  try {
    paySheet.deleteRow(payRowIdx);
  } catch (e2) {
    var restoreErr = null;
    try { restoreEffectRowSnapshot_(snap); } catch (e3) { restoreErr = String(e3); }
    logAudit(adminUsername, "Loan payment delete FAILED - rolled back", payment.id, String(e2) + (restoreErr ? " (restore failed: " + restoreErr + ")" : ""));
    if (restoreErr) {
      invalidateLedgersAfterPartialWrite_([payment.walletId, loan.walletId]);
      return loanErr_("INCONSISTENT_STATE",
        "পেমেন্ট মোছা যায়নি এবং Wallet ব্যালেন্স পূর্বাবস্থায় ফেরত নেওয়াও যায়নি — হিসাবে অসম্পূর্ণতা থাকতে পারে। অনুগ্রহ করে Admin দিয়ে যাচাই করান। (কারণ: " + restoreErr + ")");
    }
    return loanErr_("DATA_CONFLICT", "পেমেন্ট মোছা যায়নি এবং পূর্বাবস্থায় ফেরত নেওয়া হয়েছে।");
  }
  cacheRemove_("loans", loansCacheKey_());

  logAudit(adminUsername, "Loan payment deleted", payment.loanId, payment.id);
  var refreshed = recalcLoan_(loan.id, loansSheet);
  return { status: "SUCCESS", message: "ফেরত মুছে ফেলা হয়েছে!", loan: loanToClient_(refreshed) };
}

// ---------------- API: ADD ADDITION (extra money on a loan) ----------------

function addLoanAddition(data) {
  setupDatabase();
  if (!data || !data.user) return err_("হাওলাত যোগ করার জন্য প্রয়োজনীয় তথ্য অসম্পূর্ণ!");

  if (!data.loanId) return loanErr_("LOAN_NOT_FOUND", "লোন পাওয়া যায়নি!");
  var loansSheet = getLoansSheet_();
  var loanRowIdx = findLoanRowIndex_(data.loanId);
  if (loanRowIdx === -1) return loanErr_("LOAN_NOT_FOUND", "লোন পাওয়া যায়নি!");
  var loan = loanFromRow_(loansSheet.getRange(loanRowIdx, 1, 1, LOAN_HEADERS.length).getValues()[0], loanRowIdx);
  // Wallet scope first, then action: the addition must be scoped to BOTH the
  // addition wallet and the loan's own wallet.
  var permErr = authorize_(data.user, loan.typeStr === "GIVEN" ? "LOAN_GIVE" : "LOAN_TAKE", [data.walletId, loan.walletId]);
  if (permErr) return permErrWithCode_(permErr);
  if (loan.status === "CANCELLED") return loanErr_("DATA_CONFLICT", "বাতিল (CANCELLED) লোনে আরও টাকা যোগ করা যাবে না।");

  // The addition must belong to the SAME person as the loan. When the caller
  // supplies an identity it must match the loan's stored identity; otherwise a
  // per-entry personId would silently split one person's records.
  if (String(data.personName || "").trim() || String(data.phone || "").trim() || String(data.personId || "").trim()) {
    if (!loanPersonIdentityMatches_(loan, data.personName, data.phone, data.personId)) {
      return loanErr_("PERSON_MISMATCH", "এই লোনটি ভিন্ন ব্যক্তির — আপনার নাম/ফোন এই লোনের সাথে মেলে না।");
    }
  }

  // The addition must have the SAME direction (type) as the target loan.
  if (data.type && String(data.type).toUpperCase() !== String(loan.typeStr).toUpperCase()) {
    return loanErr_("TYPE_MISMATCH", loan.typeStr === "GIVEN"
      ? "GIVEN লোনে শুধু GIVEN টাকা যোগ করা যাবে।"
      : "TAKEN লোনে শুধু TAKEN টাকা যোগ করা যাবে।");
  }

  return addLoanAdditionCore_(loan, data, loansSheet);
}

// Shared core used by addLoanAddition AND createLoan (mode=ADD_TO_EXISTING_LOAN).
// All authoritative-state checks (cancelled / fully-paid / balance) live here so
// both entry points behave identically.
function addLoanAdditionCore_(loan, data, loansSheet) {
  var stCore = getLoanFinancialState_(loan);
  if (stCore.status === "CANCELLED") return loanErr_("DATA_CONFLICT", "বাতিল (CANCELLED) লোনে আরও টাকা যোগ করা যাবে না।");
  var remainingCore = stCore.remainingAmount;
  if (centsOf_(remainingCore) <= 0) {
    return loanErr_("PAID_LOAN", "এই লোনটি সম্পূর্ণ ফেরত হয়েছে — এতে আর টাকা যোগ করা যায় না। আগে একটি নতুন লোন তৈরি করুন।");
  }

  // An addition is part of the SAME loan ledger, so its money must move through
  // the loan's own wallet — exactly like a repayment (§8/§9). Accepting a
  // caller-chosen wallet let a request debit one account while the addition
  // row, its effect row and every later report attributed the money to
  // another, so the loan's history and the wallet ledger disagreed. The value
  // is pinned to the loan's wallet rather than silently redirected, and a
  // mismatch is refused so the caller is never told the wrong thing.
  if (String(data.walletId) !== String(loan.walletId)) {
    return loanErr_("ADDITION_WALLET_CHANGE_NOT_ALLOWED", "টাকা যোগ করার Wallet লোনের Wallet-ই হতে হবে — লোনের নিজস্ব Wallet ব্যবহার করুন।");
  }

  if (!isValidAmount_(data.amount)) return loanErr_("INVALID_AMOUNT", amountError_(data.amount));
  var amount = amountOf_(toCents_(data.amount));
  if (!isValidTransactionDate_(data.date)) return loanErr_("INVALID_DATE", "সঠিক তারিখ দিন।");
  if (normDateStr_(data.date) < normDateStr_(loan.loanDate)) {
    return loanErr_("INVALID_DATE", "তারিখ হাওলাতের তারিখের আগে হতে পারবে না।");
  }

  var wc = loanWalletCurrency_(data.user, data.walletId, data.account, loan.currency);
  if (wc.error) return wc.error;
  if (data.currency && data.currency !== wc.wallet.Currency) {
    return loanErr_("CURRENCY_MISMATCH", "কারেন্সি স্বয়ংক্রিয়ভাবে Wallet থেকে নেওয়া হয় — পাঠানো কারেন্সি Wallet কারেন্সির সাথে মেলে না।");
  }

  // The addition moves money the SAME direction as the original loan.
  if (loan.typeStr === "GIVEN") {
    var balErr = requireSufficientBalance_(data.walletId, data.account, amount, null);
    if (balErr) return loanErr_("INSUFFICIENT_BALANCE", balErr.message);
  }

  var requestId = String(data.requestId || data.clientId || "");
  if (requestId) {
    var dupIdx = findAdditionRequestRowIndex_(requestId);
    if (dupIdx !== -1) {
      var dup = additionFromRow_(getLoanAdditionsSheet_().getRange(dupIdx, 1, 1, LOAN_ADDITION_HEADERS.length).getValues()[0], dupIdx);
      // Every submitted field must match, compared in exact cents — otherwise a
      // retry with different data would be answered with the earlier addition.
      var same = String(dup.loanId) === String(data.loanId) && sameAmount_(dup.amount, amount) &&
        String(dup.walletId) === String(data.walletId) && dup.account === data.account &&
        normDateStr_(dup.date) === normDateStr_(data.date) &&
        String(dup.note || "") === String(data.note || "").trim();
      if (!same) return loanErr_("DUPLICATE_REQUEST", "এই request ID আগে ভিন্ন তথ্য দিয়ে ব্যবহার করা হয়েছে।");
      return {
        status: "SUCCESS", message: "হাওলাতে টাকা যোগ হয়েছে!",
        addition: additionToClient_(dup), loan: loanToClient_(recalcLoan_(loan.id, loansSheet)), duplicated: true,
      };
    }
  }

  var additionId = Utilities.getUuid();
  var effectRowId = "A_" + additionId;
  var ts = nowStr();
  var note = String(data.note || "").trim();
  var effectType = loan.typeStr === "GIVEN" ? "Loan Out" : "Loan In";
  var additionDate = normDateStr_(data.date);

  // 1) Wallet money moves first.
  try {
    writeLoanEffectRow_(wc.wallet, effectType, amount, additionDate, data.account, loan.personName, effectRowId, data.user);
  } catch (e) {
    logAudit(data.user, "Loan addition FAILED (wallet effect)", additionId, String(e));
    return loanErr_("DATA_CONFLICT", "টাকা যোগ করতে ব্যর্থ হয়েছে। কোনো পরিবর্তন হয়নি।");
  }
  // 2) Addition ledger row.
  try {
    getLoanAdditionsSheet_().appendRow([additionId, loan.id, data.user, amount, wc.wallet.Currency,
      additionDate, data.walletId, data.account, note, data.user, ts, ts, requestId, String(data.personId || loan.personId || "")]);
  } catch (e2) {
    // 3) Compensation: remove the wallet effect so nothing half-applies.
    var addRollbackErr = null;
    try { deleteEffectRow_(data.walletId, effectRowId); } catch (e3) { addRollbackErr = String(e3); }
    logAudit(data.user, "Loan addition FAILED - rolled back", additionId, String(e2) + (addRollbackErr ? " (rollback failed: " + addRollbackErr + ")" : ""));
    if (addRollbackErr) {
      invalidateLedgersAfterPartialWrite_([data.walletId, loan.walletId]);
      return loanErr_("INCONSISTENT_STATE",
        "টাকা যোগ করতে ব্যর্থ হয়েছে এবং Wallet ব্যালেন্স পূর্বাবস্থায় ফেরত নেওয়াও যায়নি — হিসাবে অসম্পূর্ণতা থাকতে পারে। অনুগ্রহ করে Admin দিয়ে যাচাই করান। (কারণ: " + addRollbackErr + ")");
    }
    return loanErr_("DATA_CONFLICT", "টাকা যোগ করতে ব্যর্থ হয়েছে এবং পূর্বাবস্থায় ফেরত নেওয়া হয়েছে।");
  }
  cacheRemove_("loanadditions", "all");
  cacheRemove_("loans", loansCacheKey_());

  logAudit(data.user, "Loan addition", loan.id, "+" + amount + " " + wc.wallet.Currency + " (" + effectType + ")");
  var refreshed = recalcLoan_(loan.id, loansSheet);
  var added = additionFromRow_(getLoanAdditionsSheet_().getRange(findAdditionRowIndex_(additionId), 1, 1, LOAN_ADDITION_HEADERS.length).getValues()[0]);
  return {
    status: "SUCCESS", message: "হাওলাতে টাকা যোগ হয়েছে!",
    addition: additionToClient_(added), loan: loanToClient_(refreshed),
    transactions: [effectTxnObj_(wc.wallet, effectType, amount, additionDate, data.account, loan.personName, effectRowId, data.user)],
  };
}

// ---------------- API: UPDATE ADDITION ----------------

function editLoanAddition(data, adminUsername) {
  setupDatabase();
  var permErr = requirePermission_(adminUsername, "MANAGE_LOANS");
  if (permErr) return permErrWithCode_(permErr);

  if (!data || !data.id) return loanErr_("LOAN_NOT_FOUND", "অ্যাডিশন পাওয়া যায়নি!");
  var sheet = getLoanAdditionsSheet_();
  var rowIdx = findAdditionRowIndex_(data.id);
  if (rowIdx === -1) return loanErr_("LOAN_NOT_FOUND", "অ্যাডিশন পাওয়া যায়নি!");
  var addition = additionFromRow_(sheet.getRange(rowIdx, 1, 1, LOAN_ADDITION_HEADERS.length).getValues()[0], rowIdx);
  if (!hasWalletAccess_(adminUsername, addition.walletId)) return loanErr_("UNAUTHORIZED_LOAN", "এই অ্যাডিশনে আপনার অ্যাক্সেস নেই।");

  var loansSheet = getLoansSheet_();
  var loanRowIdx = findLoanRowIndex_(addition.loanId);
  if (loanRowIdx === -1) return loanErr_("LOAN_NOT_FOUND", "লোন পাওয়া যায়নি!");
  var loan = loanFromRow_(loansSheet.getRange(loanRowIdx, 1, 1, LOAN_HEADERS.length).getValues()[0], loanRowIdx);
  if (!hasWalletAccess_(adminUsername, loan.walletId)) return loanErr_("UNAUTHORIZED_LOAN", "এই লোনে আপনার অ্যাক্সেস নেই.");
  if (loan.status === "CANCELLED") return loanErr_("DATA_CONFLICT", "বাতিল (CANCELLED) লোনের অ্যাডিশন এডিট করা যাবে না।");

  if (!isValidAmount_(data.amount)) return loanErr_("INVALID_AMOUNT", amountError_(data.amount));
  var newAmount = amountOf_(toCents_(data.amount));
  // Validate the COMPLETE resulting loan BEFORE touching wallet balances or the
  // ledger (§15): the new total may never drop below what has already been
  // repaid, otherwise the loan would become over-repaid.
  var stEdit = getLoanFinancialState_(loan);
  var otherAddsEdit = stEdit.additionalAmount - addition.amount;
  var newTotalLoanEdit = loan.amount + otherAddsEdit + newAmount;
  if (toCents_(newTotalLoanEdit) < centsOf_(stEdit.totalRepaid)) {
    return loanErr_("CANNOT_REDUCE_LOAN_BELOW_REPAID_AMOUNT",
      "অ্যাডিশন কমানো যাবে না — ফলে মোট হাওলাত ইতিমধ্যে ফেরত হওয়া টাকার কম হয়ে যাবে।");
  }
  var date = data.date ? data.date : addition.date;
  if (!isValidTransactionDate_(date)) return loanErr_("INVALID_DATE", "সঠিক তারিখ দিন।");
  if (normDateStr_(date) < normDateStr_(loan.loanDate)) {
    return loanErr_("INVALID_DATE", "তারিখ হাওলাতের তারিখের আগে হতে পারবে না।");
  }
  var walletId = data.walletId ? String(data.walletId) : addition.walletId;
  var account = data.account ? String(data.account) : addition.account;
  // An addition is locked to the loan's own wallet, exactly like a repayment
  // and like the creation rule in addLoanAdditionCore_ — so a stored addition
  // can never sit in a wallet that disagrees with the loan it belongs to.
  if (String(walletId) !== String(loan.walletId)) {
    return loanErr_("ADDITION_WALLET_CHANGE_NOT_ALLOWED", "অ্যাডিশনের Wallet পরিবর্তন করা যাবে না — অর্থ লোনের Wallet-এ লক করা আছে।");
  }
  walletId = loan.walletId;
  var wc = loanWalletCurrency_(adminUsername, walletId, account, loan.currency, addition.account);
  if (wc.error) return wc.error;
  if (data.currency && data.currency !== wc.wallet.Currency) {
    return loanErr_("CURRENCY_MISMATCH", "কারেন্সি স্বয়ংক্রিয়ভাবে Wallet থেকে নেওয়া হয় — পাঠানো কারেন্সি Wallet কারেন্সির সাথে মেলে না।");
  }

  var effectType = loan.typeStr === "GIVEN" ? "Loan Out" : "Loan In";
  var effectRowId = "A_" + addition.id;
  // Normally false: the wallet is pinned to the loan's own wallet above. It is
  // only true for a LEGACY addition stored under a different wallet, where the
  // move branch relocates the row (and its effect row) into the loan's wallet
  // so the ledger self-heals instead of staying inconsistent.
  var walletsChanged = String(walletId) !== String(addition.walletId);

  // GIVEN additions drive money OUT of the wallet. When the wallet changes,
  // the destination must absorb the FULL amount; otherwise verify the increase
  // against the balance after the old outflow is removed.
  if (loan.typeStr === "GIVEN") {
    var balErr;
    if (walletsChanged) {
      balErr = requireSufficientBalance_(walletId, account, newAmount, null);
    } else if (toCents_(newAmount) > toCents_(addition.amount)) {
      balErr = requireSufficientBalance_(walletId, account, newAmount, effectRowId);
    }
    if (balErr) return loanErr_("INSUFFICIENT_BALANCE", balErr.message);
  }

  var snap = loadEffectRowSnapshot_(addition.walletId, effectRowId);
  try {
    if (walletsChanged) {
      deleteEffectRow_(addition.walletId, effectRowId);
      var resolvedNew = resolveWalletSheet_(walletId);
      if (!resolvedNew) throw new Error("target wallet sheet missing");
      writeLoanEffectRow_(resolvedNew.wallet, effectType, newAmount, date, account, loan.personName, effectRowId, adminUsername);
    } else if (snap) {
      snap.resolved.sheet.getRange(snap.rowNum, 2, 1, 9).setValues([[
        date, effectType, snap.resolved.wallet.Currency, account, "Loan",
        loan.personName, loanEffectDescription_(effectType), newAmount,
        data.note !== undefined ? String(data.note).trim() : addition.note,
      ]]);
      cacheRemove_("txns", "txns_" + addition.walletId);
    }
  } catch (e) {
    try {
      if (walletsChanged) {
        restoreEffectRowAfterMove_(addition.walletId, snap);
      } else if (snap) {
        snap.resolved.sheet.getRange(snap.rowNum, 1, 1, TRANSACTION_HEADERS.length).setValues([snap.row]);
      }
    } catch (e2) {
      invalidateLedgersAfterPartialWrite_([addition.walletId, loan.walletId]);
      return loanErr_("INCONSISTENT_STATE",
        "অ্যাডিশন আপডেট ব্যর্থ হয়েছে এবং Wallet ব্যালেন্স পূর্বাবস্থায় ফেরত নেওয়াও যায়নি — হিসাবে অসম্পূর্ণতা থাকতে পারে। অনুগ্রহ করে Admin দিয়ে যাচাই করান। (কারণ: " + String(e2) + ")");
    }
    logAudit(adminUsername, "Loan addition update FAILED — rolled back", addition.id, String(e));
    return loanErr_("DATA_CONFLICT", "অ্যাডিশন আপডেট ব্যর্থ হয়েছে এবং পূর্বাবস্থায় ফেরত নেওয়া হয়েছে।");
  }

  var rowSnapshot = sheet.getRange(rowIdx, 1, 1, LOAN_ADDITION_HEADERS.length).getValues()[0];
  try {
    sheet.getRange(rowIdx, 4, 1, 3).setValues([[newAmount, wc.wallet.Currency, date]]);
    sheet.getRange(rowIdx, 7, 1, 2).setValues([[walletId, account]]);
    sheet.getRange(rowIdx, 9, 1, 1).setValue(data.note !== undefined ? String(data.note).trim() : addition.note);
    sheet.getRange(rowIdx, 12, 1, 1).setValue(nowStr());
  } catch (e2) {
    var addLedgRollbackErr = null;
    try {
      sheet.getRange(rowIdx, 1, 1, LOAN_ADDITION_HEADERS.length).setValues([rowSnapshot]);
      if (snap) {
        if (walletsChanged) {
          deleteEffectRow_(walletId, effectRowId);
          restoreEffectRowAfterMove_(addition.walletId, snap);
        } else {
          snap.resolved.sheet.getRange(snap.rowNum, 1, 1, TRANSACTION_HEADERS.length).setValues([snap.row]);
        }
      }
    } catch (e3) { addLedgRollbackErr = String(e3); }
    if (addLedgRollbackErr) {
      invalidateLedgersAfterPartialWrite_([addition.walletId, loan.walletId]);
      return loanErr_("INCONSISTENT_STATE",
        "অ্যাডিশন আপডেট ব্যর্থ হয়েছে এবং পূর্বাবস্থায় ফেরত নেওয়াও যায়নি — হিসাবে অসম্পূর্ণতা থাকতে পারে। অনুগ্রহ করে Admin দিয়ে যাচাই করান। (কারণ: " + addLedgRollbackErr + ")");
    }
    return loanErr_("DATA_CONFLICT", "অ্যাডিশন আপডেট ব্যর্থ হয়েছে এবং পূর্বাবস্থায় ফেরত নেওয়া হয়েছে।");
  }
  cacheRemove_("loanadditions", "all");
  cacheRemove_("loans", loansCacheKey_());

  logAudit(adminUsername, "Loan addition updated", addition.loanId, addition.id + " amount=" + newAmount);
  var refreshed = recalcLoan_(loan.id, loansSheet);
  var updated = additionFromRow_(sheet.getRange(rowIdx, 1, 1, LOAN_ADDITION_HEADERS.length).getValues()[0], rowIdx);
  return { status: "SUCCESS", message: "অ্যাডিশন আপডেট হয়েছে!", addition: additionToClient_(updated), loan: loanToClient_(refreshed) };
}

// ---------------- API: DELETE ADDITION ----------------

function deleteLoanAddition(additionId, adminUsername) {
  setupDatabase();
  var permErr = requirePermission_(adminUsername, "MANAGE_LOANS");
  if (permErr) return permErrWithCode_(permErr);

  var sheet = getLoanAdditionsSheet_();
  var rowIdx = findAdditionRowIndex_(additionId);
  if (rowIdx === -1) return loanErr_("LOAN_NOT_FOUND", "অ্যাডিশন পাওয়া যায়নি!");
  var addition = additionFromRow_(sheet.getRange(rowIdx, 1, 1, LOAN_ADDITION_HEADERS.length).getValues()[0], rowIdx);
  if (!hasWalletAccess_(adminUsername, addition.walletId)) return loanErr_("UNAUTHORIZED_LOAN", "এই অ্যাডিশনে আপনার অ্যাক্সেস নেই।");

  var loansSheet = getLoansSheet_();
  var loanRowIdx = findLoanRowIndex_(addition.loanId);
  if (loanRowIdx === -1) return loanErr_("LOAN_NOT_FOUND", "লোন পাওয়া যায়নি!");
  var loan = loanFromRow_(loansSheet.getRange(loanRowIdx, 1, 1, LOAN_HEADERS.length).getValues()[0], loanRowIdx);
  if (!hasWalletAccess_(adminUsername, loan.walletId)) return loanErr_("UNAUTHORIZED_LOAN", "এই লোনে আপনার অ্যাক্সেস নেই.");
  if (loan.status === "CANCELLED") return loanErr_("DATA_CONFLICT", "বাতিল (CANCELLED) লোনের অ্যাডিশন মুছে ফেলা যাবে না।");
  // Deleting an addition shrinks the total loan; it is rejected when the
  // remaining total would fall below what has already been repaid (§7).
  var stDel = getLoanFinancialState_(loan);
  var totalsWithout = loan.amount + (stDel.additionalAmount - addition.amount);
  if (toCents_(totalsWithout) < centsOf_(stDel.totalRepaid)) {
    return loanErr_("CANNOT_REDUCE_LOAN_BELOW_REPAID_AMOUNT",
      "অ্যাডিশন মুছে ফেলা যাবে না — ফলে মোট হাওলাত ইতিমধ্যে ফেরত হওয়া টাকার কম হয়ে যাবে।");
  }

  // Reverse the wallet effect FIRST (undo the money movement).
  var effectRowId = "A_" + addition.id;
  var snap = loadEffectRowSnapshot_(addition.walletId, effectRowId);
  try {
    deleteEffectRow_(addition.walletId, effectRowId);
  } catch (e) {
    return loanErr_("DATA_CONFLICT", "অ্যাডিশন মুছতে ব্যর্থ হয়েছে। কোনো পরিবর্তন হয়নি।");
  }
  try {
    sheet.deleteRow(rowIdx);
  } catch (e2) {
    var delRestoreErr = null;
    try { restoreEffectRowSnapshot_(snap); } catch (e3) { delRestoreErr = String(e3); }
    logAudit(adminUsername, "Loan addition delete FAILED - rolled back", addition.id, String(e2) + (delRestoreErr ? " (restore failed: " + delRestoreErr + ")" : ""));
    if (delRestoreErr) {
      invalidateLedgersAfterPartialWrite_([addition.walletId, loan.walletId]);
      return loanErr_("INCONSISTENT_STATE",
        "অ্যাডিশন মোছা যায়নি এবং Wallet ব্যালেন্স পূর্বাবস্থায় ফেরত নেওয়াও যায়নি — হিসাবে অসম্পূর্ণতা থাকতে পারে। অনুগ্রহ করে Admin দিয়ে যাচাই করান। (কারণ: " + delRestoreErr + ")");
    }
    return loanErr_("DATA_CONFLICT", "অ্যাডিশন মোছা যায়নি এবং পূর্বাবস্থায় ফেরত নেওয়া হয়েছে।");
  }
  cacheRemove_("loanadditions", "all");
  cacheRemove_("loans", loansCacheKey_());

  logAudit(adminUsername, "Loan addition deleted", addition.loanId, addition.id);
  var refreshed = recalcLoan_(loan.id, loansSheet);
  return { status: "SUCCESS", message: "অ্যাডিশন মুছে ফেলা হয়েছে!", loan: loanToClient_(refreshed) };
}

// ---------------- FRONTEND ALIASES (keep contract stable) ----------------

function addLoan(data) { return createLoan(data); }
function addLoanRepayment(data) { return addLoanPayment(data); }