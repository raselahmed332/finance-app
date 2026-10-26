// ============================================================
// সঞ্চয় (SAVINGS) MODULE
// ============================================================
// Three savings kinds share one plan table (SavingsPlans) and keep their
// ledgers in dedicated sheets:
//   GROUP    -> SavingsGroupMembers / SavingsGroupObligations / SavingsGroupRounds
//   FIXED    -> SavingsFixedInstallments
//   FLEXIBLE -> SavingsFlexDeposits / SavingsFlexWithdrawals
//
// Every money movement is ALSO written into the owning wallet's transaction
// sheet under dedicated types that change the wallet balance but are NEVER
// counted as Income/Expense (see Database.gs getAccountBalance_ and
// Reports.gs):
//   flex deposit        -> "Savings Deposit"      (wallet -)
//   flex withdrawal     -> "Savings Withdrawal"   (wallet +)
//   group contribution  -> "Savings Contribution" (wallet -)
//   group payout        -> "Savings Payout"       (wallet +)
//   fixed installment   -> "Savings Payment"      (wallet -)
//
// Currency is ALWAYS derived from the selected wallet; a client-supplied
// currency is only cross-checked and rejected on mismatch. Creating a plan
// itself NEVER moves money — only the explicit ledger actions above do.
// ============================================================

// ---------------- ERROR HELPERS ----------------

function savingsErr_(code, message) {
  return { status: "ERROR", code: code, message: message };
}

// authorize_()/requirePermission_() return a { code, message } error; convert it
// into the module's own error shape so callers see one consistent code.
function savingsPermErr_(permErr) {
  return { status: "ERROR", code: permErr.code || "PERMISSION_DENIED", message: permErr.message || "You do not have permission to perform this action." };
}

// True when the user holds ANY of the supplied permissions.
function savingsHasAny_(user, perms) {
  for (var i = 0; i < perms.length; i++) {
    if (hasPermission_(user, perms[i])) return true;
  }
  return false;
}

// ---------------- WALLET EFFECT TYPES ----------------

var SAVINGS_TXN_EFFECT = {
  "Savings Deposit": -1,
  "Savings Withdrawal": 1,
  "Savings Contribution": -1,
  "Savings Payout": 1,
  "Savings Payment": -1,
};

function savingsEffectDescription_(effectType) {
  if (effectType === "Savings Deposit") return "সঞ্চয় জমা";
  if (effectType === "Savings Withdrawal") return "সঞ্চয় উত্তোলন";
  if (effectType === "Savings Contribution") return "সঞ্চয় কিস্তি";
  if (effectType === "Savings Payout") return "সঞ্চয় পেলাম";
  if (effectType === "Savings Payment") return "সঞ্চয় পরিশোধ";
  return effectType;
}

// ---------------- SHEET GETTERS ----------------

function getSavingsPlansSheet_() {
  var sheet = getOrCreateSheet_("SavingsPlans", SAVINGS_PLAN_HEADERS);
  setDateColumnsAsText_(sheet, [7, 24]); // StartDate, ClosedDate
  return sheet;
}
function getSavingsGroupMembersSheet_() {
  var sheet = getOrCreateSheet_("SavingsGroupMembers", SAVINGS_GROUP_MEMBER_HEADERS);
  ensureHeaderColumns_(sheet, SAVINGS_GROUP_MEMBER_HEADERS); // older sheets lack the IsSelf column
  return sheet;
}
function getSavingsGroupObligationsSheet_() {
  var sheet = getOrCreateSheet_("SavingsGroupObligations", SAVINGS_GROUP_OBLIGATION_HEADERS);
  setDateColumnsAsText_(sheet, [5, 10]); // DueDate, PaidDate
  return sheet;
}
function getSavingsGroupRoundsSheet_() {
  var sheet = getOrCreateSheet_("SavingsGroupRounds", SAVINGS_GROUP_ROUND_HEADERS);
  setDateColumnsAsText_(sheet, [7, 9]); // CollectionDate, PayoutDate
  return sheet;
}
function getSavingsFixedInstallmentsSheet_() {
  var sheet = getOrCreateSheet_("SavingsFixedInstallments", SAVINGS_FIXED_INSTALLMENT_HEADERS);
  setDateColumnsAsText_(sheet, [4, 7]); // DueDate, PaidDate
  return sheet;
}
function getSavingsFlexDepositsSheet_() {
  var sheet = getOrCreateSheet_("SavingsFlexDeposits", SAVINGS_FLEX_DEPOSIT_HEADERS);
  setDateColumnsAsText_(sheet, [4]); // Date
  return sheet;
}
function getSavingsFlexWithdrawalsSheet_() {
  var sheet = getOrCreateSheet_("SavingsFlexWithdrawals", SAVINGS_FLEX_WITHDRAWAL_HEADERS);
  setDateColumnsAsText_(sheet, [4]); // Date
  return sheet;
}

// ---------------- LOW-LEVEL ROW HELPERS ----------------

function readSheetRows_(sheet, headers) {
  var out = [];
  if (sheet.getLastRow() >= 2) {
    var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues();
    for (var i = 0; i < data.length; i++) {
      if (!data[i][0]) continue;
      out.push({ row: data[i], rowNum: i + 2 });
    }
  }
  return out;
}

function findSavingsRowByColValue_(sheet, col, value) {
  if (value === undefined || value === null || value === "") return -1;
  if (sheet.getLastRow() < 2) return -1;
  var vals = sheet.getRange(2, col, sheet.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][0]) === String(value)) return i + 2;
  }
  return -1;
}

// ---------------- CLIENT SHAPES ----------------

function rowToSavingsPlan_(row) {
  return {
    _row: row,
    planId: String(row[0] || ""),
    type: String(row[1] || "").toUpperCase(),
    name: row[2] || "",
    walletId: row[3] || "",
    account: row[4] || "",
    currency: row[5] || "",
    startDate: normDateStr_(row[6]),
    status: String(row[7] || "").toUpperCase(),
    user: row[8] || "",
    createdBy: row[9] || "",
    createdAt: row[10] || "",
    updatedAt: row[11] || "",
    requestId: row[12] || "",
    group: {
      memberCount: parseInt(row[13], 10) || 0,
      contribution: parseFloat(row[14]) || 0,
      frequency: row[15] || "",
      rounds: parseInt(row[16], 10) || 0,
      recipientOrder: row[17] || "",
      note: row[18] || "",
    },
    fixed: {
      amount: parseFloat(row[19]) || 0,
      durationMonths: parseInt(row[20], 10) || 0,
      dueDay: parseInt(row[21], 10) || 0,
      note: row[22] || "",
      closedDate: normDateStr_(row[23]),
      closureAmount: row[24] === "" || row[24] === undefined ? 0 : (parseFloat(row[24]) || 0),
      closureNote: row[25] || "",
    },
    flex: {
      note: row[26] || "",
    },
  };
}

function savingsPlanToClient_(plan, wallet, summary) {
  var out = {
    PlanID: plan.planId, Type: plan.type, Name: plan.name,
    WalletID: plan.walletId, WalletName: wallet ? wallet.WalletName : "",
    Account: plan.account, Currency: plan.currency, StartDate: plan.startDate,
    Status: plan.status, CreatedBy: plan.createdBy, CreatedAt: plan.createdAt,
    UpdatedAt: plan.updatedAt,
    Group: plan.type === "GROUP" ? {
      MemberCount: plan.group.memberCount, Contribution: plan.group.contribution,
      Frequency: plan.group.frequency, Rounds: plan.group.rounds,
      RecipientOrder: plan.group.recipientOrder, Note: plan.group.note,
    } : null,
    Fixed: plan.type === "FIXED" ? {
      Amount: plan.fixed.amount, DurationMonths: plan.fixed.durationMonths,
      DueDay: plan.fixed.dueDay, Note: plan.fixed.note,
      ClosedDate: plan.fixed.closedDate, ClosureAmount: plan.fixed.closureAmount,
      ClosureNote: plan.fixed.closureNote,
    } : null,
    // Closure fields (ClosedDate/ClosureAmount/ClosureNote) live in the shared
    // plan columns 24-26 and are used by FIXED and FLEXIBLE alike.
    Flexible: plan.type === "FLEXIBLE" ? {
      Note: plan.flex.note,
      ClosedDate: plan.fixed.closedDate, ClosureAmount: plan.fixed.closureAmount,
      ClosureNote: plan.fixed.closureNote,
    } : null,
  };
  if (summary) out.Summary = summary;
  return out;
}

// ---------------- SUMMARIES (ledger-derived) ----------------

function savingsAllObligations_() {
  return readSheetRows_(getSavingsGroupObligationsSheet_(), SAVINGS_GROUP_OBLIGATION_HEADERS)
    .map(function (r) { return r.row; });
}
function savingsAllRounds_() {
  return readSheetRows_(getSavingsGroupRoundsSheet_(), SAVINGS_GROUP_ROUND_HEADERS)
    .map(function (r) { return r.row; });
}
function savingsAllInstallments_() {
  return readSheetRows_(getSavingsFixedInstallmentsSheet_(), SAVINGS_FIXED_INSTALLMENT_HEADERS)
    .map(function (r) { return r.row; });
}
function savingsAllDeposits_() {
  return readSheetRows_(getSavingsFlexDepositsSheet_(), SAVINGS_FLEX_DEPOSIT_HEADERS)
    .map(function (r) { return r.row; });
}
function savingsAllWithdrawals_() {
  return readSheetRows_(getSavingsFlexWithdrawalsSheet_(), SAVINGS_FLEX_WITHDRAWAL_HEADERS)
    .map(function (r) { return r.row; });
}

function savingsSummaryForPlan_(plan) {
  if (plan.type === "FLEXIBLE") {
    var depCents = 0, wdCents = 0;
    savingsAllDeposits_().forEach(function (r) { if (String(r[1]) === String(plan.planId)) depCents += centsOf_(r[2]); });
    savingsAllWithdrawals_().forEach(function (r) { if (String(r[1]) === String(plan.planId)) wdCents += centsOf_(r[2]); });
    return { Deposited: amountOf_(depCents), Withdrawn: amountOf_(wdCents), Balance: amountOf_(depCents - wdCents) };
  }
  if (plan.type === "FIXED") {
    var reqCents = 0, paidCents = 0, count = 0;
    savingsAllInstallments_().forEach(function (r) {
      if (String(r[1]) !== String(plan.planId)) return;
      count++;
      reqCents += centsOf_(r[4]);
      paidCents += centsOf_(r[5]);
    });
    return { InstallmentCount: count, Required: amountOf_(reqCents), Paid: amountOf_(paidCents), Balance: amountOf_(reqCents - paidCents) };
  }
  if (plan.type === "GROUP") {
    var collectedCents = 0, payoutCents = 0;
    savingsAllObligations_().forEach(function (r) { if (String(r[1]) === String(plan.planId)) collectedCents += centsOf_(r[6]); });
    savingsAllRounds_().forEach(function (r) { if (String(r[1]) === String(plan.planId)) payoutCents += centsOf_(r[7]); });
    return { Collected: amountOf_(collectedCents), PaidOut: amountOf_(payoutCents), Balance: amountOf_(collectedCents - payoutCents) };
  }
  return null;
}

// ---------------- VALIDATION HELPERS ----------------

function savingsTypePerm_(type) {
  if (type === "GROUP") return "SAVINGS_GROUP";
  if (type === "FIXED") return "SAVINGS_FIXED";
  if (type === "FLEXIBLE") return "SAVINGS_FLEXIBLE";
  return null;
}

function savingsValidType_(type) {
  return type === "GROUP" || type === "FIXED" || type === "FLEXIBLE";
}

// ---------------- LIVE STATUS + DUE DATES ----------------
//
// A stored status is written when money moves, so it goes stale the moment a
// due date passes. "DUE"/"MISSED" are therefore recomputed at read time (mirrors
// loans' statusOf): PAID stays PAID; otherwise a past due date means MISSED,
// today means DUE, and an unmet future date keeps the stored UNPAID/PARTIAL.

function savingsTodayStr_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
}

function savingsEffectiveStatus_(storedStatus, dueDate, today) {
  var s = String(storedStatus || "").toUpperCase();
  if (s === "PAID") return "PAID";
  var due = normDateStr_(dueDate);
  var t = today || savingsTodayStr_();
  if (due && due < t) return "MISSED";
  if (due && due === t) return "DUE";
  if (s === "PARTIAL") return "PARTIAL";
  return s || "UNPAID";
}

function savingsAddDays_(dateStr, dayOffset) {
  var parts = String(dateStr).split("-").map(Number);
  var d = new Date(parts[0], parts[1] - 1, parts[2] + dayOffset);
  return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
}

// Expected due date for a group round, derived from the plan's start date and
// frequency (WEEKLY = +7 days, YEARLY = +12 months, otherwise monthly).
function savingsRoundDueDate_(plan, round) {
  var offset = Math.max(0, (parseInt(round, 10) || 1) - 1);
  if (plan.group.frequency === "WEEKLY") return savingsAddDays_(plan.startDate, offset * 7);
  if (plan.group.frequency === "YEARLY") return savingsAddMonths_(plan.startDate, offset * 12, 0);
  return savingsAddMonths_(plan.startDate, offset, 0);
}

// Resolve + authorize the plan's wallet for a write. Mirrors
// loanWalletCurrency_: wallet access, active wallet, valid account and a
// currency that matches the plan (when the plan already has one).
// previousAccount (optional) is the plan's stored account: an edit that leaves
// the account untouched may keep an account that has since been deactivated.
function savingsWalletCurrency_(username, walletId, account, expectedCurrency, previousAccount) {
  if (!walletId) return { error: savingsErr_("WALLET_REQUIRED", "Wallet নির্বাচন করুন।") };
  var accessErr = requireWalletAccess_(username, walletId);
  if (accessErr) return { error: savingsErr_("INVALID_WALLET", accessErr.message) };
  var activeErr = requireActiveWallet_(walletId);
  if (activeErr) return { error: savingsErr_("INVALID_WALLET", activeErr.message) };
  var wallet = getWalletById_(walletId);
  var accountErr = requireActiveAccount_(walletId, account);
  if (accountErr) {
    var unchanged = previousAccount !== undefined && previousAccount !== null &&
      String(previousAccount) === String(account);
    if (!unchanged || !isValidAccountForWallet_(walletId, account)) {
      return { error: savingsErr_("INVALID_ACCOUNT", accountErr.message) };
    }
  }
  if (expectedCurrency && String(wallet.Currency) !== String(expectedCurrency)) {
    return { error: savingsErr_("CURRENCY_MISMATCH", "Wallet কারেন্সি সঞ্চয় পরিকল্পনার কারেন্সির সাথে মেলে না।") };
  }
  return { wallet: wallet };
}

// ---------------- WALLET EFFECT ROWS ----------------

function savingsEffectTxnObj_(wallet, effectType, amount, date, account, label, rowId, user) {
  return {
    ID: rowId, Date: date, Type: effectType, Currency: wallet.Currency, Account: account,
    SourceCategory: "Savings", WhereVendor: label,
    Description: savingsEffectDescription_(effectType), Amount: amount, Note: "", User: user,
    WalletID: wallet.WalletID, WalletName: wallet.WalletName,
  };
}

function writeSavingsEffectRow_(wallet, effectType, amount, date, account, label, rowId, user) {
  var resolved = resolveWalletSheet_(wallet.WalletID);
  if (!resolved) throw new Error("wallet sheet not found");
  resolved.sheet.appendRow([rowId, normDateStr_(date), effectType, wallet.Currency, account, "Savings",
    label, savingsEffectDescription_(effectType), amount, "", user, new Date()]);
  cacheRemove_("txns", "txns_" + wallet.WalletID);
}

function deleteSavingsEffectRow_(walletId, effectRowId) {
  var resolved = resolveWalletSheet_(walletId);
  if (!resolved) return false;
  var rn = findTxnRow_(resolved.sheet, effectRowId);
  if (rn === -1) return false;
  resolved.sheet.deleteRow(rn);
  cacheRemove_("txns", "txns_" + walletId);
  return true;
}

// ============================================================
// API: GET
// ============================================================

function getSavingsPlans(username, type, opts) {
  setupDatabase();
  var permErr = requirePermission_(username, "VIEW_SAVINGS");
  if (permErr) return permErr;

  var accessible = getUserWalletAccess_(getUserRecord_(username));
  var wanted = type ? String(type).toUpperCase() : "";
  var plans = readSheetRows_(getSavingsPlansSheet_(), SAVINGS_PLAN_HEADERS)
    .map(function (r) { return rowToSavingsPlan_(r.row); })
    .filter(function (p) { return p.planId && accessible.indexOf(String(p.walletId)) !== -1; });

  if (wanted && wanted !== "ALL") {
    plans = plans.filter(function (p) { return p.type === wanted; });
  }
  if (!(opts && opts.includeClosed)) {
    plans = plans.filter(function (p) { return p.status !== "CLOSED"; });
  }

  var out = plans.map(function (p) {
    return savingsPlanToClient_(p, getWalletById_(p.walletId), savingsSummaryForPlan_(p));
  });
  return { status: "SUCCESS", plans: out };
}

function getSavingsPlanDetails(planId, username) {
  setupDatabase();
  var permErr = requirePermission_(username, "VIEW_SAVINGS");
  if (permErr) return permErr;

  var sheet = getSavingsPlansSheet_();
  var rn = findSavingsRowByColValue_(sheet, 1, planId);
  if (rn === -1) return savingsErr_("NOT_FOUND", "সঞ্চয় পরিকল্পনা পাওয়া যায়নি।");
  var plan = rowToSavingsPlan_(sheet.getRange(rn, 1, 1, SAVINGS_PLAN_HEADERS.length).getValues()[0]);
  if (!hasWalletAccess_(username, plan.walletId)) {
    return savingsErr_("WALLET_ACCESS_DENIED", "এই সঞ্চয় পরিকল্পনায় আপনার অ্যাক্সেস নেই।");
  }

  var today = savingsTodayStr_();
  var details = {
    status: "SUCCESS",
    plan: savingsPlanToClient_(plan, getWalletById_(plan.walletId), savingsSummaryForPlan_(plan)),
    members: [], obligations: [], rounds: [], installments: [], deposits: [], withdrawals: [],
  };

  function filterById(rows, idColIndex) {
    return rows.filter(function (r) { return String(r[idColIndex]) === String(planId); });
  }

  if (plan.type === "GROUP") {
    details.members = readSheetRows_(getSavingsGroupMembersSheet_(), SAVINGS_GROUP_MEMBER_HEADERS)
      .map(function (r) { return r.row; })
      .filter(function (r) { return String(r[1]) === String(planId); })
      .map(function (r) {
        var isSelf = String(r[6] || "").toUpperCase() === "TRUE";
        return { MemberID: r[0], PlanID: r[1], MemberName: r[2], OrderIndex: r[3], Status: r[4], CreatedAt: r[5], IsSelf: isSelf };
      });
    details.obligations = filterById(savingsAllObligations_(), 1).map(function (r) {
      return { ObligationID: r[0], PlanID: r[1], Round: r[2], MemberID: r[3], DueDate: normDateStr_(r[4]),
        RequiredAmount: parseFloat(r[5]) || 0, PaidAmount: parseFloat(r[6]) || 0, Balance: parseFloat(r[7]) || 0,
        Status: r[8], EffectiveStatus: savingsEffectiveStatus_(r[8], r[4], today), PaidDate: normDateStr_(r[9]), Note: r[10] };
    });
    details.rounds = filterById(savingsAllRounds_(), 1).map(function (r) {
      return { RoundID: r[0], PlanID: r[1], Round: r[2], RecipientMemberID: r[3],
        ExpectedAmount: parseFloat(r[4]) || 0, CollectedAmount: parseFloat(r[5]) || 0,
        CollectionDate: normDateStr_(r[6]), PayoutAmount: parseFloat(r[7]) || 0,
        PayoutDate: normDateStr_(r[8]), Status: r[9], Note: r[10] };
    });
  } else if (plan.type === "FIXED") {
    details.installments = filterById(savingsAllInstallments_(), 1).map(function (r) {
      return { InstallmentID: r[0], PlanID: r[1], InstallmentNo: r[2], DueDate: normDateStr_(r[3]),
        RequiredAmount: parseFloat(r[4]) || 0, ActualAmount: parseFloat(r[5]) || 0,
        PaidDate: normDateStr_(r[6]), Status: r[7], EffectiveStatus: savingsEffectiveStatus_(r[7], r[3], today),
        TransactionRef: r[8], Note: r[9] };
    });
  } else if (plan.type === "FLEXIBLE") {
    details.deposits = filterById(savingsAllDeposits_(), 1).map(function (r) {
      return { DepositID: r[0], PlanID: r[1], Amount: parseFloat(r[2]) || 0, Date: normDateStr_(r[3]),
        WalletID: r[4], Account: r[5], Description: r[6], TransactionRef: r[7], CreatedBy: r[8], CreatedAt: r[9] };
    });
    details.withdrawals = filterById(savingsAllWithdrawals_(), 1).map(function (r) {
      return { WithdrawalID: r[0], PlanID: r[1], Amount: parseFloat(r[2]) || 0, Date: normDateStr_(r[3]),
        WalletID: r[4], Account: r[5], Description: r[6], TransactionRef: r[7], CreatedBy: r[8], CreatedAt: r[9] };
    });
  }
  return details;
}

// ============================================================
// API: CREATE / UPDATE / DELETE PLAN
// ============================================================

function createSavingsPlan(data) {
  setupDatabase();
  if (!data || !data.user) return savingsErr_("INVALID_INPUT", "সঞ্চয় পরিকল্পনার তথ্য অসম্পূর্ণ।");

  var type = String(data.type || data.Type || "").toUpperCase();
  if (!savingsValidType_(type)) return savingsErr_("INVALID_TYPE", "সঞ্চয়ের ধরন GROUP, FIXED বা FLEXIBLE হতে হবে।");
  var typePerm = savingsTypePerm_(type);

  var name = String(data.name || data.Name || "").trim();
  if (!name) return savingsErr_("INVALID_NAME", "সঞ্চয় পরিকল্পনার একটি নাম দিন।");
  if (name.length > 80) return savingsErr_("INVALID_NAME", "নাম ৮০ অক্ষরের বেশি হতে পারবে না।");

  if (!isValidTransactionDate_(data.startDate || data.StartDate)) {
    return savingsErr_("INVALID_DATE", "সঠিক শুরুর তারিখ দিন।");
  }
  var startDate = normDateStr_(data.startDate || data.StartDate);

  // The plan must be tied to a wallet the caller can reach and holds the type
  // permission (SAVINGS_GROUP/FIXED/FLEXIBLE is auto-granted by wallet access).
  var wc = savingsWalletCurrency_(data.user, data.walletId || data.WalletID, data.account || data.Account, data.currency || data.Currency);
  if (wc.error) return wc.error;
  if (!savingsHasAny_(data.user, [typePerm, "MANAGE_SAVINGS"])) {
    return savingsErr_("PERMISSION_DENIED", "এই ধরনের সঞ্চয় তৈরির অনুমতি আপনার নেই।");
  }

  // Type-specific validation.
  var group = {}, fixed = {};
  if (type === "GROUP") {
    var contribution = data.contribution !== undefined ? data.contribution : data.Group_Contribution;
    if (!isValidAmount_(contribution)) return savingsErr_("INVALID_AMOUNT", amountError_(contribution));
    group.contribution = amountOf_(toCents_(contribution));
    var roundsRaw = data.rounds !== undefined ? data.rounds : data.Group_Rounds;
    var rounds = parseInt(roundsRaw, 10);
    if (!Number.isFinite(rounds) || rounds < 1 || rounds > 1000) return savingsErr_("INVALID_ROUNDS", "রাউন্ড সংখ্যা ১ থেকে ১০০০ এর মধ্যে দিন।");
    group.rounds = rounds;
    var freq = String(data.frequency || data.Group_Frequency || "MONTHLY").toUpperCase();
    if (["WEEKLY", "MONTHLY", "YEARLY"].indexOf(freq) === -1) return savingsErr_("INVALID_FREQUENCY", "ফ্রিকোয়েন্সি WEEKLY, MONTHLY বা YEARLY হতে হবে।");
    group.frequency = freq;
    group.note = String(data.groupNote || data.Group_Note || "").trim();
    var members = Array.isArray(data.members) ? data.members : [];
    group.members = members.map(function (m, i) {
      var isSelf = !!(m && (m.isSelf || m.IsSelf));
      return { name: String((m && (m.name || m.MemberName)) || "").trim(), orderIndex: i + 1, isSelf: isSelf };
    }).filter(function (m) { return m.name; });
    group.memberCount = group.members.length;
    if (data.memberCount !== undefined && group.memberCount === 0) group.memberCount = parseInt(data.memberCount, 10) || 0;
    // When members exist, rounds = member count (so every member contributes once per round)
    if (group.members.length > 0) {
      group.rounds = group.members.length;
    }
  } else if (type === "FIXED") {
    var amount = data.amount !== undefined ? data.amount : data.Fixed_Amount;
    if (!isValidAmount_(amount)) return savingsErr_("INVALID_AMOUNT", amountError_(amount));
    fixed.amount = amountOf_(toCents_(amount));
    var months = parseInt(data.durationMonths !== undefined ? data.durationMonths : data.Fixed_DurationMonths, 10);
    if (!Number.isFinite(months) || months < 1 || months > 600) return savingsErr_("INVALID_DURATION", "মেয়াদ ১ থেকে ৬০০ মাসের মধ্যে দিন।");
    fixed.durationMonths = months;
    var dueDay = data.dueDay !== undefined && data.dueDay !== "" ? parseInt(data.dueDay, 10) : (data.Fixed_DueDay ? parseInt(data.Fixed_DueDay, 10) : 0);
    if (dueDay && (dueDay < 1 || dueDay > 31)) return savingsErr_("INVALID_DUE_DAY", "মাসিক কিস্তির দিন ১ থেকে ৩১ এর মধ্যে দিন।");
    fixed.dueDay = dueDay || 0;
    fixed.note = String(data.fixedNote || data.Fixed_Note || "").trim();
  } else {
    var flexNote = String(data.flexNote || data.Flex_Note || "").trim();
    group = {};
    fixed = {};
  }

  // Idempotency: an identical retry (same RequestID) returns the same plan.
  var requestId = String(data.requestId || data.RequestID || data.clientId || "");
  if (requestId) {
    var dupRow = findSavingsRowByColValue_(getSavingsPlansSheet_(), 13, requestId);
    if (dupRow !== -1) {
      var dup = rowToSavingsPlan_(getSavingsPlansSheet_().getRange(dupRow, 1, 1, SAVINGS_PLAN_HEADERS.length).getValues()[0]);
      var sameRequest = String(dup.user) === String(data.user) && dup.type === type &&
        dup.name === name && String(dup.walletId) === String(wc.wallet.WalletID) &&
        sameAmount_(dup.group.contribution, group.contribution || 0) && sameAmount_(dup.fixed.amount, fixed.amount || 0);
      if (!sameRequest) return savingsErr_("DUPLICATE_REQUEST", "এই request ID আগে ভিন্ন তথ্য দিয়ে ব্যবহার করা হয়েছে।");
      return { status: "SUCCESS", message: "সঞ্চয় পরিকল্পনা আগেই তৈরি হয়েছে।", plan: savingsPlanToClient_(dup, wc.wallet, savingsSummaryForPlan_(dup)), duplicated: true };
    }
  }

  var planId = Utilities.getUuid();
  var ts = nowStr();
  var row = [
    planId, type, name, wc.wallet.WalletID, String(data.account || data.Account), wc.wallet.Currency, startDate,
    "ACTIVE", data.user, data.user, ts, ts, requestId,
    group.memberCount || "", group.contribution || "", group.frequency || "", group.rounds || "",
    "", group.note || "",
    fixed.amount || "", fixed.durationMonths || "", fixed.dueDay || "", fixed.note || "",
    "", "", "",
    (type === "FLEXIBLE" ? String(data.flexNote || data.Flex_Note || "").trim() : ""),
  ];

  try {
    getSavingsPlansSheet_().appendRow(row);
  } catch (e) {
    logAudit(data.user, "Savings create FAILED", planId, String(e));
    return savingsErr_("DATA_CONFLICT", "সঞ্চয় পরিকল্পনা তৈরি ব্যর্থ হয়েছে। কোনো পরিবর্তন হয়নি।");
  }

  // Group members (optional at creation) — each is its own row so the
  // recipient order can be edited later without rewriting the plan.
  if (type === "GROUP" && group.members.length) {
    var memberSheet = getSavingsGroupMembersSheet_();
    group.members.forEach(function (m) {
      memberSheet.appendRow([Utilities.getUuid(), planId, m.name, m.orderIndex, "ACTIVE", ts, m.isSelf ? "TRUE" : ""]);
    });
    var order = group.members.slice().sort(function (a, b) { return a.orderIndex - b.orderIndex; })
      .map(function (m) { return m.name; }).join(", ");
    getSavingsPlansSheet_().getRange(findSavingsRowByColValue_(getSavingsPlansSheet_(), 1, planId), 18, 1, 1).setValue(order);
  }

  logAudit(data.user, "Savings plan created", planId, type + " " + name);
  var created = rowToSavingsPlan_(getSavingsPlansSheet_().getRange(findSavingsRowByColValue_(getSavingsPlansSheet_(), 1, planId), 1, 1, SAVINGS_PLAN_HEADERS.length).getValues()[0]);
  return {
    status: "SUCCESS", message: "সঞ্চয় পরিকল্পনা সফলভাবে তৈরি হয়েছে!",
    plan: savingsPlanToClient_(created, wc.wallet, savingsSummaryForPlan_(created)),
  };
}

function updateSavingsPlan(data, adminUsername) {
  setupDatabase();
  if (!data) return savingsErr_("INVALID_INPUT", "তথ্য অসম্পূর্ণ।");
  var user = adminUsername || data.user;
  var permErr = requirePermission_(user, "MANAGE_SAVINGS");
  if (permErr) return savingsPermErr_(permErr);

  var planId = data.planId || data.PlanID;
  var sheet = getSavingsPlansSheet_();
  var rn = findSavingsRowByColValue_(sheet, 1, planId);
  if (rn === -1) return savingsErr_("NOT_FOUND", "সঞ্চয় পরিকল্পনা পাওয়া যায়নি।");
  var plan = rowToSavingsPlan_(sheet.getRange(rn, 1, 1, SAVINGS_PLAN_HEADERS.length).getValues()[0]);
  if (!hasWalletAccess_(user, plan.walletId)) return savingsErr_("WALLET_ACCESS_DENIED", "এই সঞ্চয় পরিকল্পনায় আপনার অ্যাক্সেস নেই।");

  var name = data.name !== undefined ? String(data.name).trim() : plan.name;
  if (!name) return savingsErr_("INVALID_NAME", "সঞ্চয় পরিকল্পনার একটি নাম দিন।");

  // Structural fields can only change while the plan has no ledger activity —
  // otherwise earlier rows would disagree with the plan they belong to.
  var hasActivity = savingsPlanHasActivity_(planId);
  var values = sheet.getRange(rn, 1, 1, SAVINGS_PLAN_HEADERS.length).getValues()[0];
  values[2] = name;
  if (plan.type === "GROUP") {
    if (data.groupNote !== undefined) values[18] = String(data.groupNote).trim();
    if (!hasActivity && data.contribution !== undefined && isValidAmount_(data.contribution)) values[14] = amountOf_(toCents_(data.contribution));
    if (!hasActivity && data.frequency !== undefined) {
      var freq = String(data.frequency).toUpperCase();
      if (["WEEKLY", "MONTHLY", "YEARLY"].indexOf(freq) !== -1) values[15] = freq;
    }
    if (!hasActivity && data.rounds !== undefined) {
      var memberCountCur = savingsGroupMemberCount_(plan.planId);
      if (memberCountCur > 0) {
        values[16] = memberCountCur;
      } else {
        var rounds = parseInt(data.rounds, 10);
        if (Number.isFinite(rounds) && rounds >= 1 && rounds <= 1000) values[16] = rounds;
      }
    }
  } else if (plan.type === "FIXED") {
    if (data.fixedNote !== undefined) values[22] = String(data.fixedNote).trim();
    if (!hasActivity && data.amount !== undefined && isValidAmount_(data.amount)) values[19] = amountOf_(toCents_(data.amount));
    if (!hasActivity && data.durationMonths !== undefined) {
      var months = parseInt(data.durationMonths, 10);
      if (Number.isFinite(months) && months >= 1 && months <= 600) values[20] = months;
    }
  } else {
    if (data.flexNote !== undefined) values[26] = String(data.flexNote).trim();
  }
  values[11] = nowStr();
  sheet.getRange(rn, 1, 1, SAVINGS_PLAN_HEADERS.length).setValues([values]);
  logAudit(user, "Savings plan updated", planId, plan.type);

  var updated = rowToSavingsPlan_(values);
  return { status: "SUCCESS", message: "সঞ্চয় পরিকল্পনা আপডেট হয়েছে।", plan: savingsPlanToClient_(updated, getWalletById_(updated.walletId), savingsSummaryForPlan_(updated)) };
}

function savingsPlanHasActivity_(planId) {
  function any(sheet, idCol) {
    if (sheet.getLastRow() < 2) return false;
    return findSavingsRowByColValue_(sheet, idCol, planId) !== -1;
  }
  return any(getSavingsGroupMembersSheet_(), 2) ||
    any(getSavingsGroupObligationsSheet_(), 2) ||
    any(getSavingsGroupRoundsSheet_(), 2) ||
    any(getSavingsFixedInstallmentsSheet_(), 2) ||
    any(getSavingsFlexDepositsSheet_(), 2) ||
    any(getSavingsFlexWithdrawalsSheet_(), 2);
}

function deleteSavingsPlan(planId, adminUsername) {
  setupDatabase();
  var permErr = requirePermission_(adminUsername, "MANAGE_SAVINGS");
  if (permErr) return savingsPermErr_(permErr);

  var sheet = getSavingsPlansSheet_();
  var rn = findSavingsRowByColValue_(sheet, 1, planId);
  if (rn === -1) return savingsErr_("NOT_FOUND", "সঞ্চয় পরিকল্পনা পাওয়া যায়নি।");
  var plan = rowToSavingsPlan_(sheet.getRange(rn, 1, 1, SAVINGS_PLAN_HEADERS.length).getValues()[0]);
  if (!hasWalletAccess_(adminUsername, plan.walletId)) return savingsErr_("WALLET_ACCESS_DENIED", "এই সঞ্চয় পরিকল্পনায় আপনার অ্যাক্সেস নেই।");

  // Protect history: a plan with any ledger row cannot be hard-deleted. It must
  // be CLOSED instead so every past deposit/payment keeps its audit trail.
  if (savingsPlanHasActivity_(planId)) {
    return savingsErr_("PLAN_HAS_ACTIVITY", "এই সঞ্চয় পরিকল্পনায় লেনদেন রয়েছে — মুছে ফেলা যাবে না। বদলে এটি বন্ধ (CLOSE) করুন।");
  }

  sheet.deleteRow(rn);
  logAudit(adminUsername, "Savings plan deleted", planId, plan.type + " " + plan.name);
  return { status: "SUCCESS", message: "সঞ্চয় পরিকল্পনা মুছে ফেলা হয়েছে।", deletedId: planId };
}

// ============================================================
// API: GROUP OPERATIONS
// ============================================================

function savingsRequirePlan_(planId, user, acceptTypes) {
  var sheet = getSavingsPlansSheet_();
  var rn = findSavingsRowByColValue_(sheet, 1, planId);
  if (rn === -1) return { error: savingsErr_("NOT_FOUND", "সঞ্চয় পরিকল্পনা পাওয়া যায়নি।") };
  var plan = rowToSavingsPlan_(sheet.getRange(rn, 1, 1, SAVINGS_PLAN_HEADERS.length).getValues()[0]);
  if (acceptTypes && acceptTypes.indexOf(plan.type) === -1) {
    return { error: savingsErr_("INVALID_TYPE", "এই কাজটি এই ধরনের সঞ্চয়ে প্রযোজ্য নয়।") };
  }
  if (user && !hasWalletAccess_(user, plan.walletId)) {
    return { error: savingsErr_("WALLET_ACCESS_DENIED", "এই সঞ্চয় পরিকল্পনায় আপনার অ্যাক্সেস নেই।") };
  }
  if (plan.status === "CLOSED") {
    return { error: savingsErr_("PLAN_CLOSED", "এই সঞ্চয় পরিকল্পনা বন্ধ করা হয়েছে।") };
  }
  return { plan: plan, rowNum: rn };
}

function addSavingsGroupMember(data) {
  setupDatabase();
  if (!data || !data.user) return savingsErr_("INVALID_INPUT", "তথ্য অসম্পূর্ণ।");
  var r = savingsRequirePlan_(data.planId, data.user, ["GROUP"]);
  if (r.error) return r.error;
  if (!savingsHasAny_(data.user, ["SAVINGS_GROUP", "MANAGE_SAVINGS"])) return savingsErr_("PERMISSION_DENIED", "অনুমতি নেই।");

  var name = String(data.memberName || data.name || "").trim();
  if (!name) return savingsErr_("INVALID_NAME", "সদস্যের নাম দিন।");
  var orderIndex = parseInt(data.orderIndex, 10);
  if (!Number.isFinite(orderIndex) || orderIndex < 1) {
    var existing = readSheetRows_(getSavingsGroupMembersSheet_(), SAVINGS_GROUP_MEMBER_HEADERS)
      .map(function (x) { return x.row; })
      .filter(function (row) { return String(row[1]) === String(data.planId); });
    orderIndex = existing.length + 1;
  }
  var ts = nowStr();
  var memberId = Utilities.getUuid();
  getSavingsGroupMembersSheet_().appendRow([memberId, data.planId, name, orderIndex, "ACTIVE", ts]);
  logAudit(data.user, "Savings group member added", data.planId, name);
  getSavingsPlansSheet_().getRange(r.rowNum, 14, 1, 1).setValue(savingsGroupMemberCount_(data.planId));
  // Ensure rounds column matches member count
  getSavingsPlansSheet_().getRange(r.rowNum, 17, 1, 1).setValue(savingsGroupMemberCount_(data.planId));
  return { status: "SUCCESS", message: "সদস্য যোগ হয়েছে।", member: { MemberID: memberId, PlanID: data.planId, MemberName: name, OrderIndex: orderIndex, Status: "ACTIVE", CreatedAt: ts } };
}

function savingsGroupMemberCount_(planId) {
  return readSheetRows_(getSavingsGroupMembersSheet_(), SAVINGS_GROUP_MEMBER_HEADERS)
    .map(function (x) { return x.row; })
    .filter(function (row) { return String(row[1]) === String(planId); }).length;
}

function updateSavingsGroupMember(data, adminUsername) {
  setupDatabase();
  var user = adminUsername || (data && data.user);
  var permErr = requirePermission_(user, "MANAGE_SAVINGS");
  if (permErr) return savingsPermErr_(permErr);
  if (!data) return savingsErr_("INVALID_INPUT", "তথ্য অসম্পূর্ণ।");

  var sheet = getSavingsGroupMembersSheet_();
  var rn = findSavingsRowByColValue_(sheet, 1, data.memberId || data.MemberID);
  if (rn === -1) return savingsErr_("NOT_FOUND", "সদস্য পাওয়া যায়নি।");
  var name = String(data.memberName || data.name || "").trim();
  if (name === "") {
    // Allow updates that only toggle IsSelf
    if (data.isSelf === undefined && data.IsSelf === undefined) return savingsErr_("INVALID_NAME", "সদস্যের নাম দিন।");
  } else {
    sheet.getRange(rn, 3).setValue(name);
  }
  // IsSelf toggle
  if (data.isSelf !== undefined || data.IsSelf !== undefined) {
    var isSelf = !!(data.isSelf || data.IsSelf);
    // If setting this member as self, clear others in same plan
    var planId = sheet.getRange(rn, 2).getValue();
    if (isSelf) {
      var all = readSheetRows_(sheet, SAVINGS_GROUP_MEMBER_HEADERS);
      for (var i = 0; i < all.length; i++) {
        if (String(all[i].row[1]) === String(planId)) {
          var srn = all[i].rowNum;
          if (srn === rn) sheet.getRange(srn, 7).setValue("TRUE");
          else sheet.getRange(srn, 7).setValue("");
        }
      }
    } else {
      sheet.getRange(rn, 7).setValue("");
    }
  }
  logAudit(user, "Savings group member updated", data.memberId, name || "");
  return { status: "SUCCESS", message: "সদস্যের তথ্য আপডেট হয়েছে।" };
}

function removeSavingsGroupMember(memberId, adminUsername) {
  setupDatabase();
  var permErr = requirePermission_(adminUsername, "MANAGE_SAVINGS");
  if (permErr) return savingsPermErr_(permErr);

  var sheet = getSavingsGroupMembersSheet_();
  var rn = findSavingsRowByColValue_(sheet, 1, memberId);
  if (rn === -1) return savingsErr_("NOT_FOUND", "সদস্য পাওয়া যায়নি।");
  var row = sheet.getRange(rn, 1, 1, SAVINGS_GROUP_MEMBER_HEADERS.length).getValues()[0];
  var planId = row[1];
  // A member with recorded obligations cannot be removed — that would orphan
  // the money already attributed to them.
  var obligations = savingsAllObligations_().filter(function (o) { return String(o[3]) === String(memberId); });
  if (obligations.length) {
    return savingsErr_("MEMBER_HAS_ACTIVITY", "এই সদস্যের সঞ্চয় রেকর্ড রয়েছে — মুছে ফেলা যাবে না।");
  }
  sheet.deleteRow(rn);
  getSavingsPlansSheet_().getRange(findSavingsRowByColValue_(getSavingsPlansSheet_(), 1, planId), 14, 1, 1).setValue(savingsGroupMemberCount_(planId));
  getSavingsPlansSheet_().getRange(findSavingsRowByColValue_(getSavingsPlansSheet_(), 1, planId), 17, 1, 1).setValue(savingsGroupMemberCount_(planId));
  logAudit(adminUsername, "Savings group member removed", memberId, String(row[2]));
  return { status: "SUCCESS", message: "সদস্য মুছে ফেলা হয়েছে।" };
}

function setSavingsGroupRecipientOrder(data) {
  setupDatabase();
  var user = data && (data.user || data.username);
  var permErr = requirePermission_(user, "MANAGE_SAVINGS");
  if (permErr) return savingsPermErr_(permErr);
  var r = savingsRequirePlan_(data.planId, user, ["GROUP"]);
  if (r.error) return r.error;

  var orderedIds = Array.isArray(data.order) ? data.order.map(String) : [];
  if (!orderedIds.length) return savingsErr_("INVALID_INPUT", "সদস্যদের ক্রম দিন।");

  var sheet = getSavingsGroupMembersSheet_();
  var rows = readSheetRows_(sheet, SAVINGS_GROUP_MEMBER_HEADERS);
  var names = [];
  orderedIds.forEach(function (memberId, i) {
    for (var k = 0; k < rows.length; k++) {
      if (String(rows[k].row[0]) === memberId && String(rows[k].row[1]) === String(data.planId)) {
        sheet.getRange(rows[k].rowNum, 4).setValue(i + 1);
        names.push(rows[k].row[2]);
        break;
      }
    }
  });
  getSavingsPlansSheet_().getRange(r.rowNum, 18).setValue(names.join(", "));
  logAudit(user, "Savings group order set", data.planId, names.join(", "));
  return { status: "SUCCESS", message: "গ্রহণের ক্রম সংরক্ষণ হয়েছে।", order: names };
}

function recordSavingsGroupContribution(data) {
  setupDatabase();
  if (!data || !data.user) return savingsErr_("INVALID_INPUT", "তথ্য অসম্পূর্ণ।");
  var r = savingsRequirePlan_(data.planId, data.user, ["GROUP"]);
  if (r.error) return r.error;
  var plan = r.plan;
  if (!savingsHasAny_(data.user, ["SAVINGS_GROUP", "MANAGE_SAVINGS", "MANAGE_SAVINGS_TRANSACTIONS"])) {
    return savingsErr_("PERMISSION_DENIED", "অনুমতি নেই।");
  }

  if (!isValidAmount_(data.amount)) return savingsErr_("INVALID_AMOUNT", amountError_(data.amount));
  var amount = amountOf_(toCents_(data.amount));
  var date = data.date || data.Date;
  if (!isValidTransactionDate_(date)) return savingsErr_("INVALID_DATE", "সঠিক তারিখ দিন।");
  date = normDateStr_(date);
  if (date < plan.startDate) return savingsErr_("INVALID_DATE", "তারিখ শুরুর তারিখের আগে হতে পারবে না।");
  var round = parseInt(data.round, 10);
  if (!Number.isFinite(round) || round < 1) return savingsErr_("INVALID_ROUND", "সঠিক রাউন্ড দিন।");
  // Check against rounds/memberCount
  if (plan.group && plan.group.rounds) {
    if (round > plan.group.rounds) return savingsErr_("INVALID_ROUND", "রাউন্ড সংখ্যাটি সর্বোচ্চ রাউন্ডের বেশি হতে পারবে না।");
  }
  var memberCount = savingsGroupMemberCount_(plan.planId);
  if (memberCount && round > memberCount) return savingsErr_("INVALID_ROUND", "রাউন্ড সংখ্যাটি সদস্য সংখ্যার বেশি হতে পারবে না।");
  if (!data.memberId) return savingsErr_("INVALID_MEMBER", "সদস্য নির্বাচন করুন।");

  var wc = savingsWalletCurrency_(data.user, plan.walletId, data.account || plan.account, plan.currency, plan.account);
  if (wc.error) return wc.error;
  var effectType = "Savings Contribution";
  var isSelfMember = isMemberSelf_(plan.planId, data.memberId);
  if (isSelfMember) {
    var balErr = requireSufficientBalance_(plan.walletId, data.account || plan.account, amount, null);
    if (balErr) return savingsErr_("INSUFFICIENT_BALANCE", balErr.message);
  }

  var requestId = String(data.requestId || data.clientId || "");
  if (requestId) {
    var dupRn = findSavingsRowByColValue_(getSavingsGroupObligationsSheet_(), 13, requestId);
    if (dupRn !== -1) {
      return { status: "SUCCESS", message: "কিস্তি আগেই রেকর্ড হয়েছে।", duplicated: true };
    }
  }

  var oblSheet = getSavingsGroupObligationsSheet_();
  // One obligation row per (plan, round, member): a later contribution tops it up.
  var obligationId = null, oblRn = -1, paidCents = 0;
  var oblRows = readSheetRows_(oblSheet, SAVINGS_GROUP_OBLIGATION_HEADERS);
  for (var i = 0; i < oblRows.length; i++) {
    var row = oblRows[i].row;
    if (String(row[1]) === String(plan.planId) && String(row[3]) === String(data.memberId) && String(row[2]) === String(round)) {
      obligationId = row[0]; oblRn = oblRows[i].rowNum; paidCents = centsOf_(row[6]); break;
    }
  }
  var requiredCents = centsOf_(plan.group.contribution);
  var newPaidCents = paidCents + toCents_(amount);
  if (requiredCents > 0 && newPaidCents > requiredCents) {
    return savingsErr_("CONTRIBUTION_EXCEEDS", "এই রাউন্ডের নির্ধারিত কিস্তির চেয়ে বেশি যোগ করা যাবে না।");
  }
  var effectRowId = "SC_" + (obligationId || Utilities.getUuid());
  var ts = nowStr();
  var status = requiredCents > 0 && newPaidCents >= requiredCents ? "PAID" : (newPaidCents > 0 ? "PARTIAL" : "UNPAID");

  try {
    if (isSelfMember) {
      writeSavingsEffectRow_(wc.wallet, effectType, amount, date, data.account || plan.account, plan.name, effectRowId, data.user);
    }
  } catch (e) {
    return savingsErr_("DATA_CONFLICT", "কিস্তি রেকর্ড করা যায়নি। কোনো পরিবর্তন হয়নি।");
  }

  try {
    if (oblRn === -1) {
      obligationId = obligationId || Utilities.getUuid();
      oblSheet.appendRow([obligationId, plan.planId, round, data.memberId, savingsRoundDueDate_(plan, round), requiredCents ? amountOf_(requiredCents) : "",
        amount, amountOf_(requiredCents - newPaidCents), status, date, String(data.note || "").trim(), ts, requestId]);
    } else {
      oblSheet.getRange(oblRn, 7).setValue(amountOf_(newPaidCents));
      oblSheet.getRange(oblRn, 8).setValue(requiredCents ? amountOf_(requiredCents - newPaidCents) : "");
      oblSheet.getRange(oblRn, 9).setValue(status);
      oblSheet.getRange(oblRn, 10).setValue(date);
      oblSheet.getRange(oblRn, 12).setValue(ts);
    }
  } catch (e2) {
    try { if (isSelfMember) deleteSavingsEffectRow_(plan.walletId, effectRowId); } catch (e3) { /* best effort */ }
    return savingsErr_("DATA_CONFLICT", "কিস্তি রেকর্ড করা যায়নি এবং পূর্বাবস্থায় ফেরত নেওয়া হয়েছে।");
  }

  savingsUpdateRoundCollected_(plan, round, date);
  logAudit(data.user, "Savings contribution", plan.planId, "round " + round + " " + amount);
  return {
    status: "SUCCESS", message: "কিস্তি সফলভাবে রেকর্ড হয়েছে!",
    transaction: isSelfMember ? savingsEffectTxnObj_(wc.wallet, effectType, amount, date, data.account || plan.account, plan.name, effectRowId, data.user) : null,
    plan: savingsPlanToClient_(plan, wc.wallet, savingsSummaryForPlan_(plan)),
  };
}

function savingsUpdateRoundCollected_(plan, round, date) {
  var planId = plan.planId;
  var oblSheet = getSavingsGroupObligationsSheet_();
  var collectedCents = 0;
  readSheetRows_(oblSheet, SAVINGS_GROUP_OBLIGATION_HEADERS).forEach(function (x) {
    var row = x.row;
    if (String(row[1]) === String(planId) && String(row[2]) === String(round)) collectedCents += centsOf_(row[6]);
  });
  var roundsSheet = getSavingsGroupRoundsSheet_();
  var rn = -1;
  readSheetRows_(roundsSheet, SAVINGS_GROUP_ROUND_HEADERS).forEach(function (x) {
    if (rn === -1 && String(x.row[1]) === String(planId) && String(x.row[2]) === String(round)) rn = x.rowNum;
  });
  // Expected collection for the round = contribution x active member count.
  var expectedCents = centsOf_(plan.group.contribution) * savingsGroupMemberCount_(planId);
  var ts = nowStr();
  if (rn === -1) {
    roundsSheet.appendRow([Utilities.getUuid(), planId, round, "", expectedCents ? amountOf_(expectedCents) : "",
      amountOf_(collectedCents), date, "", "", "OPEN", "", ts, ""]);
  } else {
    roundsSheet.getRange(rn, 6).setValue(amountOf_(collectedCents));
    // Always keep expected amount in sync with current member count
    if (expectedCents) {
      roundsSheet.getRange(rn, 5).setValue(amountOf_(expectedCents));
    } else {
      roundsSheet.getRange(rn, 5).setValue("");
    }
    roundsSheet.getRange(rn, 12).setValue(ts);
  }
}

function isMemberSelf_(planId, memberId) {
  var sheet = getSavingsGroupMembersSheet_();
  var rn = findSavingsRowByColValue_(sheet, 1, memberId);
  if (rn === -1) return false;
  var row = sheet.getRange(rn, 1, 1, SAVINGS_GROUP_MEMBER_HEADERS.length).getValues()[0];
  if (String(row[1]) !== String(planId)) return false;
  return String(row[6] || "").toUpperCase() === "TRUE";
}

function recordSavingsGroupPayout(data) {
  setupDatabase();
  if (!data || !data.user) return savingsErr_("INVALID_INPUT", "তথ্য অসম্পূর্ণ।");
  var r = savingsRequirePlan_(data.planId, data.user, ["GROUP"]);
  if (r.error) return r.error;
  var plan = r.plan;
  if (!savingsHasAny_(data.user, ["SAVINGS_GROUP", "MANAGE_SAVINGS", "MANAGE_SAVINGS_TRANSACTIONS"])) {
    return savingsErr_("PERMISSION_DENIED", "অনুমতি নেই।");
  }

  if (!isValidAmount_(data.amount)) return savingsErr_("INVALID_AMOUNT", amountError_(data.amount));
  var amount = amountOf_(toCents_(data.amount));
  var date = data.date || data.Date;
  if (!isValidTransactionDate_(date)) return savingsErr_("INVALID_DATE", "সঠিক তারিখ দিন।");
  date = normDateStr_(date);
  var round = parseInt(data.round, 10);
  if (!Number.isFinite(round) || round < 1) return savingsErr_("INVALID_ROUND", "সঠিক রাউন্ড দিন।");
  if (plan.group && plan.group.rounds) {
    if (round > plan.group.rounds) return savingsErr_("INVALID_ROUND", "রাউন্ড সংখ্যাটি সর্বোচ্চ রাউন্ডের বেশি হতে পারবে না।");
  }
  var memberCount = savingsGroupMemberCount_(plan.planId);
  if (memberCount && round > memberCount) return savingsErr_("INVALID_ROUND", "রাউন্ড সংখ্যাটি সদস্য সংখ্যার বেশি হতে পারবে না।");

  var wc = savingsWalletCurrency_(data.user, plan.walletId, data.account || plan.account, plan.currency, plan.account);
  if (wc.error) return wc.error;

  var roundsSheet = getSavingsGroupRoundsSheet_();
  var rn = -1;
  readSheetRows_(roundsSheet, SAVINGS_GROUP_ROUND_HEADERS).forEach(function (x) {
    if (rn === -1 && String(x.row[1]) === String(plan.planId) && String(x.row[2]) === String(round)) rn = x.rowNum;
  });
  // A payout only makes sense once the round has been opened by a contribution.
  if (rn === -1) return savingsErr_("ROUND_NOT_OPEN", "প্রথমে এই রাউন্ডে কিস্তি রেকর্ড করুন তারপর পেআউট দিন।");

  var roundId = String(roundsSheet.getRange(rn, 1).getValue());
  var existingStatus = String(roundsSheet.getRange(rn, 10).getValue() || "").toUpperCase();
  // Only a MANAGE_SAVINGS holder may deliberately overwrite an earlier payout.
  var allowCorrection = !!(data.allowCorrection && hasPermission_(data.user, "MANAGE_SAVINGS"));

  if (existingStatus === "PAID" && !allowCorrection) {
    return savingsErr_("ROUND_ALREADY_PAID", "এই রাউন্ডের পেআউট আগেই রেকর্ড হয়েছে। সংশোধনের অনুমতি ছাড়া আবার দেওয়া যাবে না।");
  }

  // Gate: all members must have contributed this round before payout (collected >= expected)
  var collectedCents = centsOf_(roundsSheet.getRange(rn, 6).getValue());
  var expectedCents = centsOf_(roundsSheet.getRange(rn, 5).getValue());
  if (expectedCents > 0 && collectedCents < expectedCents && !allowCorrection) {
    return savingsErr_("NOT_ALL_COLLECTED", "সব সদস্য কিস্তি জমা দেওয়া পর্যন্ত পেআউট দেওয়া যাবে না।");
  }

  // A member may receive the collection at most once per group. Re-collecting
  // into a different round (or an earlier round) is refused unless the operator
  // explicitly asks for a correction.
  var recipientMemberId = String(data.recipientMemberId || "");
  if (recipientMemberId && !allowCorrection) {
    var alreadyReceived = savingsAllRounds_().some(function (row) {
      return String(row[1]) === String(plan.planId) && String(row[3]) === recipientMemberId &&
        String(row[9]).toUpperCase() === "PAID" && String(row[0]) !== roundId;
    });
    if (alreadyReceived) {
      return savingsErr_("MEMBER_ALREADY_RECEIVED", "এই সদস্য ইতিমধ্যে একবার গ্রহণ করেছেন। একই কমিটিতে দ্বিতীয়বার দেওয়া যাবে না।");
    }
  }

  var effectRowId = "SO_" + roundId;
  var effectType = "Savings Payout";
  var recipientIsSelf = recipientMemberId ? isMemberSelf_(plan.planId, recipientMemberId) : false;
  // effectRowId is deterministic per round, so first clear any wallet effect
  // already recorded for this round. A correction that changes the recipient (or
  // toggles IsSelf) must replace the previous effect — writing first and deleting
  // after would remove the row we just wrote and silently lose the credit.
  try { while (deleteSavingsEffectRow_(plan.walletId, effectRowId)) {} } catch (eOld) { /* best effort */ }
  // Wallet credit only when recipient is "Me" (IsSelf)
  try {
    if (recipientIsSelf) {
      writeSavingsEffectRow_(wc.wallet, effectType, amount, date, data.account || plan.account, plan.name, effectRowId, data.user);
    }
  } catch (e) {
    return savingsErr_("DATA_CONFLICT", "পেআউট রেকর্ড করা যায়নি। কোনো পরিবর্তন হয়নি।");
  }
  try {
    roundsSheet.getRange(rn, 4).setValue(recipientMemberId);
    roundsSheet.getRange(rn, 8).setValue(amount);
    roundsSheet.getRange(rn, 9).setValue(date);
    roundsSheet.getRange(rn, 10).setValue("PAID");
    roundsSheet.getRange(rn, 12).setValue(nowStr());
  } catch (e2) {
    try { if (recipientIsSelf) deleteSavingsEffectRow_(plan.walletId, effectRowId); } catch (e3) { /* best effort */ }
    return savingsErr_("DATA_CONFLICT", "পেআউট রেকর্ড করা যায়নি এবং পূর্বাবস্থায় ফেরত নেওয়া হয়েছে।");
  }
  logAudit(data.user, "Savings payout", plan.planId, "round " + round + " " + amount);
  return {
    status: "SUCCESS", message: "পেআউট সফলভাবে রেকর্ড হয়েছে!",
    transaction: recipientIsSelf ? savingsEffectTxnObj_(wc.wallet, effectType, amount, date, data.account || plan.account, plan.name, effectRowId, data.user) : null,
    plan: savingsPlanToClient_(plan, wc.wallet, savingsSummaryForPlan_(plan)),
  };
}

// ============================================================
// API: FIXED OPERATIONS
// ============================================================

function savingsAddMonths_(dateStr, monthOffset, dueDay) {
  var parts = String(dateStr).split("-").map(Number);
  var y = parts[0], m = parts[1], d = dueDay || parts[2];
  var target = new Date(y, m - 1 + monthOffset, 1);
  var lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  if (d > lastDay) d = lastDay;
  var mm = ("0" + (target.getMonth() + 1)).slice(-2);
  var dd = ("0" + d).slice(-2);
  return target.getFullYear() + "-" + mm + "-" + dd;
}

function generateSavingsFixedInstallments(data) {
  setupDatabase();
  var user = data && (data.user || data.username);
  var permErr = requirePermission_(user, "MANAGE_SAVINGS");
  if (permErr) return savingsPermErr_(permErr);
  var r = savingsRequirePlan_(data.planId, user, ["FIXED"]);
  if (r.error) return r.error;
  var plan = r.plan;

  var existing = savingsAllInstallments_().filter(function (row) { return String(row[1]) === String(plan.planId); });
  if (existing.length) return savingsErr_("ALREADY_GENERATED", "এই পরিকল্পনার কিস্তি আগেই তৈরি করা হয়েছে।");

  var sheet = getSavingsFixedInstallmentsSheet_();
  var ts = nowStr();
  var count = plan.fixed.durationMonths;
  for (var n = 1; n <= count; n++) {
    var dueDate = savingsAddMonths_(plan.startDate, n, plan.fixed.dueDay);
    sheet.appendRow([Utilities.getUuid(), plan.planId, n, dueDate, plan.fixed.amount, 0, "", "UNPAID", "", "", ts, ""]);
  }
  logAudit(user, "Savings fixed installments generated", plan.planId, String(count));
  return { status: "SUCCESS", message: count + "টি কিস্তি তৈরি হয়েছে।", count: count };
}

function addSavingsFixedPayment(data) {
  setupDatabase();
  if (!data || !data.user) return savingsErr_("INVALID_INPUT", "তথ্য অসম্পূর্ণ।");
  var r = savingsRequirePlan_(data.planId, data.user, ["FIXED"]);
  if (r.error) return r.error;
  var plan = r.plan;
  if (!savingsHasAny_(data.user, ["SAVINGS_FIXED", "MANAGE_SAVINGS", "MANAGE_SAVINGS_TRANSACTIONS"])) {
    return savingsErr_("PERMISSION_DENIED", "অনুমতি নেই।");
  }

  if (!isValidAmount_(data.amount)) return savingsErr_("INVALID_AMOUNT", amountError_(data.amount));
  var amount = amountOf_(toCents_(data.amount));
  var date = data.date || data.Date;
  if (!isValidTransactionDate_(date)) return savingsErr_("INVALID_DATE", "সঠিক তারিখ দিন।");
  date = normDateStr_(date);

  var instSheet = getSavingsFixedInstallmentsSheet_();
  var instRn = findSavingsRowByColValue_(instSheet, 1, data.installmentId);
  if (instRn === -1) return savingsErr_("NOT_FOUND", "কিস্তি পাওয়া যায়নি।");
  var inst = instSheet.getRange(instRn, 1, 1, SAVINGS_FIXED_INSTALLMENT_HEADERS.length).getValues()[0];
  if (String(inst[1]) !== String(plan.planId)) return savingsErr_("INVALID_INSTALLMENT", "এই কিস্তি এই পরিকল্পনার নয়।");

  var paidCents = centsOf_(inst[5]);
  var requiredCents = centsOf_(inst[4]);
  var newPaidCents = paidCents + toCents_(amount);
  if (requiredCents > 0 && newPaidCents > requiredCents) return savingsErr_("PAYMENT_EXCEEDS", "কিস্তির পরিমাণের চেয়ে বেশি পরিশোধ করা যাবে না।");

  var wc = savingsWalletCurrency_(data.user, plan.walletId, data.account || plan.account, plan.currency, plan.account);
  if (wc.error) return wc.error;
  var balErr = requireSufficientBalance_(plan.walletId, data.account || plan.account, amount, null);
  if (balErr) return savingsErr_("INSUFFICIENT_BALANCE", balErr.message);

  var requestId = String(data.requestId || data.clientId || "");
  if (requestId) {
    var dupRn = findSavingsRowByColValue_(instSheet, 12, requestId);
    if (dupRn !== -1) return { status: "SUCCESS", message: "পরিশোধ আগেই রেকর্ড হয়েছে।", duplicated: true };
  }

  var effectType = "Savings Payment";
  var effectRowId = "SF_" + String(inst[0]) + "_" + Date.now();
  try {
    writeSavingsEffectRow_(wc.wallet, effectType, amount, date, data.account || plan.account, plan.name, effectRowId, data.user);
  } catch (e) {
    return savingsErr_("DATA_CONFLICT", "পরিশোধ রেকর্ড করা যায়নি। কোনো পরিবর্তন হয়নি।");
  }
  try {
    instSheet.getRange(instRn, 6).setValue(amountOf_(newPaidCents));
    instSheet.getRange(instRn, 7).setValue(date);
    instSheet.getRange(instRn, 8).setValue(requiredCents > 0 && newPaidCents >= requiredCents ? "PAID" : "PARTIAL");
    instSheet.getRange(instRn, 9).setValue(effectRowId);
    instSheet.getRange(instRn, 11).setValue(nowStr());
    instSheet.getRange(instRn, 12).setValue(requestId);
  } catch (e2) {
    try { deleteSavingsEffectRow_(plan.walletId, effectRowId); } catch (e3) { /* best effort */ }
    return savingsErr_("DATA_CONFLICT", "পরিশোধ রেকর্ড করা যায়নি এবং পূর্বাবস্থায় ফেরত নেওয়া হয়েছে।");
  }
  logAudit(data.user, "Savings fixed payment", plan.planId, amount + " " + plan.currency);
  return {
    status: "SUCCESS", message: "কিস্তি পরিশোধ সফলভাবে রেকর্ড হয়েছে!",
    transaction: savingsEffectTxnObj_(wc.wallet, effectType, amount, date, data.account || plan.account, plan.name, effectRowId, data.user),
    plan: savingsPlanToClient_(plan, wc.wallet, savingsSummaryForPlan_(plan)),
  };
}

function closeSavingsFixedPlan(data) {
  setupDatabase();
  var user = data && (data.user || data.username);
  var permErr = requirePermission_(user, "MANAGE_SAVINGS");
  if (permErr) return savingsPermErr_(permErr);
  var r = savingsRequirePlan_(data.planId, user, ["FIXED"]);
  if (r.error) return r.error;
  var plan = r.plan;

  var closureDate = data.closureDate || data.date || data.ClosureDate;
  if (!isValidTransactionDate_(closureDate)) return savingsErr_("INVALID_DATE", "বন্ধ করার সঠিক তারিখ দিন।");
  closureDate = normDateStr_(closureDate);
  var closureAmount = 0;
  if (data.closureAmount !== undefined && data.closureAmount !== "" && Number(data.closureAmount) !== 0) {
    if (!isValidAmount_(data.closureAmount)) return savingsErr_("INVALID_AMOUNT", amountError_(data.closureAmount));
    closureAmount = amountOf_(toCents_(data.closureAmount));
  }

  // An explicit closure amount is money returned to the wallet (e.g. early
  // encashment). It is only moved when the operator enters a non-zero amount.
  var effectRowId = null;
  if (closureAmount > 0) {
    var wc = savingsWalletCurrency_(user, plan.walletId, data.account || plan.account, plan.currency, plan.account);
    if (wc.error) return wc.error;
    effectRowId = "SWC_" + plan.planId;
    try {
      writeSavingsEffectRow_(wc.wallet, "Savings Withdrawal", closureAmount, closureDate, data.account || plan.account, plan.name, effectRowId, user);
    } catch (e) {
      return savingsErr_("DATA_CONFLICT", "পরিকল্পনা বন্ধ করা যায়নি। কোনো পরিবর্তন হয়নি।");
    }
  }

  try {
    getSavingsPlansSheet_().getRange(r.rowNum, 8).setValue("CLOSED");
    getSavingsPlansSheet_().getRange(r.rowNum, 24).setValue(closureDate);
    getSavingsPlansSheet_().getRange(r.rowNum, 25).setValue(closureAmount || "");
    getSavingsPlansSheet_().getRange(r.rowNum, 26).setValue(String(data.closureNote || "").trim());
    getSavingsPlansSheet_().getRange(r.rowNum, 12).setValue(nowStr());
  } catch (e2) {
    if (effectRowId) { try { deleteSavingsEffectRow_(plan.walletId, effectRowId); } catch (e3) { /* best effort */ } }
    return savingsErr_("DATA_CONFLICT", "পরিকল্পনা বন্ধ করা যায়নি এবং পূর্বাবস্থায় ফেরত নেওয়া হয়েছে।");
  }
  logAudit(user, "Savings fixed plan closed", plan.planId, closureDate + " " + closureAmount);
  return { status: "SUCCESS", message: "সঞ্চয় পরিকল্পনা বন্ধ করা হয়েছে।" };
}

// ============================================================
// API: FLEXIBLE OPERATIONS
// ============================================================

function addSavingsFlexDeposit(data) {
  setupDatabase();
  if (!data || !data.user) return savingsErr_("INVALID_INPUT", "তথ্য অসম্পূর্ণ।");
  var r = savingsRequirePlan_(data.planId, data.user, ["FLEXIBLE"]);
  if (r.error) return r.error;
  var plan = r.plan;
  if (!savingsHasAny_(data.user, ["SAVINGS_FLEXIBLE", "MANAGE_SAVINGS", "MANAGE_SAVINGS_TRANSACTIONS"])) {
    return savingsErr_("PERMISSION_DENIED", "অনুমতি নেই।");
  }
  if (!isValidAmount_(data.amount)) return savingsErr_("INVALID_AMOUNT", amountError_(data.amount));
  var amount = amountOf_(toCents_(data.amount));
  var date = data.date || data.Date;
  if (!isValidTransactionDate_(date)) return savingsErr_("INVALID_DATE", "সঠিক তারিখ দিন।");
  date = normDateStr_(date);

  var wc = savingsWalletCurrency_(data.user, plan.walletId, data.account || plan.account, plan.currency, plan.account);
  if (wc.error) return wc.error;
  var balErr = requireSufficientBalance_(plan.walletId, data.account || plan.account, amount, null);
  if (balErr) return savingsErr_("INSUFFICIENT_BALANCE", balErr.message);

  var requestId = String(data.requestId || data.clientId || "");
  if (requestId) {
    var dupRn = findSavingsRowByColValue_(getSavingsFlexDepositsSheet_(), 11, requestId);
    if (dupRn !== -1) return { status: "SUCCESS", message: "জমা আগেই রেকর্ড হয়েছে।", duplicated: true };
  }

  var depositId = Utilities.getUuid();
  var effectRowId = "SD_" + depositId;
  try {
    writeSavingsEffectRow_(wc.wallet, "Savings Deposit", amount, date, data.account || plan.account, plan.name, effectRowId, data.user);
  } catch (e) {
    return savingsErr_("DATA_CONFLICT", "জমা রেকর্ড করা যায়নি। কোনো পরিবর্তন হয়নি।");
  }
  try {
    getSavingsFlexDepositsSheet_().appendRow([depositId, plan.planId, amount, date, plan.walletId,
      data.account || plan.account, String(data.description || "").trim(), effectRowId, data.user, nowStr(), requestId]);
  } catch (e2) {
    try { deleteSavingsEffectRow_(plan.walletId, effectRowId); } catch (e3) { /* best effort */ }
    return savingsErr_("DATA_CONFLICT", "জমা রেকর্ড করা যায়নি এবং পূর্বাবস্থায় ফেরত নেওয়া হয়েছে।");
  }
  logAudit(data.user, "Savings flex deposit", plan.planId, amount + " " + plan.currency);
  return {
    status: "SUCCESS", message: "জমা সফলভাবে রেকর্ড হয়েছে!",
    transaction: savingsEffectTxnObj_(wc.wallet, "Savings Deposit", amount, date, data.account || plan.account, plan.name, effectRowId, data.user),
    plan: savingsPlanToClient_(plan, wc.wallet, savingsSummaryForPlan_(plan)),
  };
}

function addSavingsFlexWithdrawal(data) {
  setupDatabase();
  if (!data || !data.user) return savingsErr_("INVALID_INPUT", "তথ্য অসম্পূর্ণ।");
  var r = savingsRequirePlan_(data.planId, data.user, ["FLEXIBLE"]);
  if (r.error) return r.error;
  var plan = r.plan;
  if (!savingsHasAny_(data.user, ["SAVINGS_FLEXIBLE", "MANAGE_SAVINGS", "MANAGE_SAVINGS_TRANSACTIONS"])) {
    return savingsErr_("PERMISSION_DENIED", "অনুমতি নেই।");
  }
  if (!isValidAmount_(data.amount)) return savingsErr_("INVALID_AMOUNT", amountError_(data.amount));
  var amount = amountOf_(toCents_(data.amount));
  var date = data.date || data.Date;
  if (!isValidTransactionDate_(date)) return savingsErr_("INVALID_DATE", "সঠিক তারিখ দিন।");
  date = normDateStr_(date);

  // A withdrawal can never exceed what has actually been deposited into THIS
  // plan (deposited - already withdrawn), independent of the wallet balance.
  var summary = savingsSummaryForPlan_(plan);
  if (toCents_(amount) > centsOf_(summary.Balance)) {
    return savingsErr_("INSUFFICIENT_SAVINGS", "সঞ্চয় ব্যালেন্সের চেয়ে বেশি উত্তোলন করা যাবে না।");
  }

  var wc = savingsWalletCurrency_(data.user, plan.walletId, data.account || plan.account, plan.currency, plan.account);
  if (wc.error) return wc.error;

  var requestId = String(data.requestId || data.clientId || "");
  if (requestId) {
    var dupRn = findSavingsRowByColValue_(getSavingsFlexWithdrawalsSheet_(), 11, requestId);
    if (dupRn !== -1) return { status: "SUCCESS", message: "উত্তোলন আগেই রেকর্ড হয়েছে।", duplicated: true };
  }

  var withdrawalId = Utilities.getUuid();
  var effectRowId = "SW_" + withdrawalId;
  try {
    writeSavingsEffectRow_(wc.wallet, "Savings Withdrawal", amount, date, data.account || plan.account, plan.name, effectRowId, data.user);
  } catch (e) {
    return savingsErr_("DATA_CONFLICT", "উত্তোলন রেকর্ড করা যায়নি। কোনো পরিবর্তন হয়নি।");
  }
  try {
    getSavingsFlexWithdrawalsSheet_().appendRow([withdrawalId, plan.planId, amount, date, plan.walletId,
      data.account || plan.account, String(data.description || "").trim(), effectRowId, data.user, nowStr(), requestId]);
  } catch (e2) {
    try { deleteSavingsEffectRow_(plan.walletId, effectRowId); } catch (e3) { /* best effort */ }
    return savingsErr_("DATA_CONFLICT", "উত্তোলন রেকর্ড করা যায়নি এবং পূর্বাবস্থায় ফেরত নেওয়া হয়েছে।");
  }
  logAudit(data.user, "Savings flex withdrawal", plan.planId, amount + " " + plan.currency);
  return {
    status: "SUCCESS", message: "উত্তোলন সফলভাবে রেকর্ড হয়েছে!",
    transaction: savingsEffectTxnObj_(wc.wallet, "Savings Withdrawal", amount, date, data.account || plan.account, plan.name, effectRowId, data.user),
    plan: savingsPlanToClient_(plan, wc.wallet, savingsSummaryForPlan_(plan)),
  };
}

function deleteSavingsFlexTransaction(txnId, type, adminUsername) {
  setupDatabase();
  var permErr = requirePermission_(adminUsername, "MANAGE_SAVINGS_TRANSACTIONS");
  if (permErr) return savingsPermErr_(permErr);

  var isDeposit = String(type || "").toLowerCase() === "deposit";
  var sheet = isDeposit ? getSavingsFlexDepositsSheet_() : getSavingsFlexWithdrawalsSheet_();
  var rn = findSavingsRowByColValue_(sheet, 1, txnId);
  if (rn === -1) return savingsErr_("NOT_FOUND", "লেনদেন পাওয়া যায়নি।");
  var row = sheet.getRange(rn, 1, 1, (isDeposit ? SAVINGS_FLEX_DEPOSIT_HEADERS : SAVINGS_FLEX_WITHDRAWAL_HEADERS).length).getValues()[0];
  var planId = row[1], walletId = row[4], effectRowId = row[7];

  var r = savingsRequirePlan_(planId, adminUsername, ["FLEXIBLE"]);
  if (r.error) return r.error;

  // Reverse the wallet effect first so a failed ledger delete cannot leave the
  // money movement in place with no ledger row behind it.
  try {
    if (effectRowId) deleteSavingsEffectRow_(walletId, effectRowId);
  } catch (e) {
    return savingsErr_("DATA_CONFLICT", "লেনদেন মুছে ফেলা যায়নি। কোনো পরিবর্তন হয়নি।");
  }
  try {
    sheet.deleteRow(rn);
  } catch (e2) {
    // Restore the wallet effect to keep the two sides consistent.
    try {
      var wallet = getWalletById_(walletId);
      if (wallet) writeSavingsEffectRow_(wallet, isDeposit ? "Savings Deposit" : "Savings Withdrawal", row[2], row[3], row[5], planId, effectRowId, row[8]);
    } catch (e3) { invalidateLedgersAfterPartialWrite_([walletId]); }
    return savingsErr_("DATA_CONFLICT", "লেনদেন মুছে ফেলা যায়নি এবং পূর্বাবস্থায় ফেরত নেওয়া হয়েছে।");
  }
  logAudit(adminUsername, "Savings flex txn deleted", planId, (isDeposit ? "deposit " : "withdrawal ") + txnId);
  return { status: "SUCCESS", message: "লেনদেন মুছে ফেলা হয়েছে।" };
}

function closeSavingsFlexPlan(data) {
  setupDatabase();
  var user = data && (data.user || data.username);
  var permErr = requirePermission_(user, "MANAGE_SAVINGS");
  if (permErr) return savingsPermErr_(permErr);
  var r = savingsRequirePlan_(data.planId, user, ["FLEXIBLE"]);
  if (r.error) return r.error;
  var plan = r.plan;

  var closureDate = data.closureDate || data.date || data.ClosureDate;
  if (!isValidTransactionDate_(closureDate)) return savingsErr_("INVALID_DATE", "বন্ধ করার সঠিক তারিখ দিন।");
  closureDate = normDateStr_(closureDate);

  // Closing returns the ENTIRE remaining savings balance to the wallet. An
  // explicit amount is accepted only when it equals the full balance, so a
  // closed plan can never silently strand money inside it.
  var summary = savingsSummaryForPlan_(plan);
  var balanceCents = centsOf_(summary.Balance);
  var closureAmountCents = balanceCents;
  // A non-empty, non-zero amount is accepted only when it equals the full
  // balance. An empty/omitted amount (or an explicit 0, which the UI sends for an
  // already-empty plan) simply means "return the whole balance" (possibly 0).
  if (data.closureAmount !== undefined && data.closureAmount !== "" && data.closureAmount !== null && Number(data.closureAmount) !== 0) {
    if (!isValidAmount_(data.closureAmount)) return savingsErr_("INVALID_AMOUNT", amountError_(data.closureAmount));
    var requestedCents = toCents_(data.closureAmount);
    if (requestedCents !== balanceCents) {
      return savingsErr_("INVALID_AMOUNT", "বন্ধ করার পরিমাণ অবশিষ্ট সঞ্চয় ব্যালেন্সের সমান হতে হবে (" + amountOf_(balanceCents) + ")।");
    }
    closureAmountCents = requestedCents;
  }
  var closureAmount = amountOf_(closureAmountCents);

  var wc = null, effectRowId = null;
  if (closureAmountCents > 0) {
    wc = savingsWalletCurrency_(user, plan.walletId, data.account || plan.account, plan.currency, plan.account);
    if (wc.error) return wc.error;
    effectRowId = "SFC_" + plan.planId;
    try {
      writeSavingsEffectRow_(wc.wallet, "Savings Withdrawal", closureAmount, closureDate, data.account || plan.account, plan.name, effectRowId, user);
    } catch (e) {
      return savingsErr_("DATA_CONFLICT", "পরিকল্পনা বন্ধ করা যায়নি। কোনো পরিবর্তন হয়নি।");
    }
  }

  var ledgerId = null;
  try {
    if (closureAmountCents > 0) {
      // A withdrawal ledger row keeps Summary.Balance at zero and leaves a
      // visible trail of where the closing money went.
      ledgerId = Utilities.getUuid();
      getSavingsFlexWithdrawalsSheet_().appendRow([ledgerId, plan.planId, closureAmount, closureDate, plan.walletId,
        data.account || plan.account, String(data.description || "").trim() || "সঞ্চয় পরিকল্পনা বন্ধের ফলে ফেরত",
        effectRowId, user, nowStr(), ""]);
    }
    getSavingsPlansSheet_().getRange(r.rowNum, 8).setValue("CLOSED");
    getSavingsPlansSheet_().getRange(r.rowNum, 24).setValue(closureDate);
    getSavingsPlansSheet_().getRange(r.rowNum, 25).setValue(closureAmount || "");
    getSavingsPlansSheet_().getRange(r.rowNum, 26).setValue(String(data.closureNote || "").trim());
    getSavingsPlansSheet_().getRange(r.rowNum, 12).setValue(nowStr());
  } catch (e2) {
    if (ledgerId) {
      try {
        var ledgerRn = findSavingsRowByColValue_(getSavingsFlexWithdrawalsSheet_(), 1, ledgerId);
        if (ledgerRn !== -1) getSavingsFlexWithdrawalsSheet_().deleteRow(ledgerRn);
      } catch (eL) { /* best effort */ }
    }
    if (effectRowId) { try { deleteSavingsEffectRow_(plan.walletId, effectRowId); } catch (e3) { /* best effort */ } }
    return savingsErr_("DATA_CONFLICT", "পরিকল্পনা বন্ধ করা যায়নি এবং পূর্বাবস্থায় ফেরত নেওয়া হয়েছে।");
  }
  logAudit(user, "Savings flex plan closed", plan.planId, closureDate + " " + closureAmount);
  var closed = rowToSavingsPlan_(getSavingsPlansSheet_().getRange(r.rowNum, 1, 1, SAVINGS_PLAN_HEADERS.length).getValues()[0]);
  return {
    status: "SUCCESS", message: "সঞ্চয় পরিকল্পনা বন্ধ করা হয়েছে।",
    transaction: wc ? savingsEffectTxnObj_(wc.wallet, "Savings Withdrawal", closureAmount, closureDate, data.account || plan.account, plan.name, effectRowId, user) : null,
    plan: savingsPlanToClient_(closed, getWalletById_(closed.walletId), savingsSummaryForPlan_(closed)),
  };
}