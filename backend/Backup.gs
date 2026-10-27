// ---------------- BACKUP ----------------

// 0-based indexes into the loan sheets, used by the scoped restore to decide
// which existing rows belong to a wallet the caller cannot reach and must
// therefore be preserved instead of wiped.
var LOAN_COL_WALLET_ID = 9; // LoanID User Type PersonID PersonName Phone Amount Currency LoanDate WalletID ...
var LOAN_PAYMENT_COL_LOAN_ID = 1; // PaymentID LoanID ...
var LOAN_ADDITION_COL_LOAN_ID = 1; // AdditionID LoanID ...

// Wipes every row from `startRow` down (used before a restore so the target
// sheet's last row reflects the restored data instead of stale cleared rows).
function wipeRows_(sheet, startRow) {
  var lastRow = sheet.getLastRow();
  if (lastRow >= startRow) sheet.deleteRows(startRow, lastRow - startRow + 1);
}

// Number of populated rows from `startRow` down (empty/skipped cells don't count).
function populatedRowCount_(sheet, startRow, lastCol) {
  if (sheet.getLastRow() < startRow) return 0;
  var data = sheet.getRange(startRow, 1, sheet.getLastRow() - startRow + 1, lastCol).getValues();
  var n = 0;
  for (var i = 0; i < data.length; i++) {
    if (data[i][0] !== "" && data[i][0] !== null && data[i][0] !== undefined) n++;
  }
  return n;
}

// Restores each wallet's opening balances (registry + sheet header block) from
// the backup's wallet list. Runs inside the try so a failure triggers rollback.
function restoreWalletOpeningBalances_(backup, username) {
  var wallets = Array.isArray(backup && backup.wallets) ? backup.wallets : [];
  // A restore must never invent money: `parseFloat(x) || 0` would turn a corrupt
  // value in a hand-edited backup into a silent 0 and shift every later balance
  // for that wallet. An unusable opening balance leaves the wallet untouched and
  // is reported back to the caller instead.
  var skipped = [];
  wallets.forEach(function (wb) {
    if (!wb || !wb.WalletID) return;
    if (!hasWalletAccess_(username, wb.WalletID)) return;
    var wallet = getWalletById_(wb.WalletID);
    if (!wallet) return;
    var ocCents = openingAmountCents_(wb.OpeningCash);
    var obCents = openingAmountCents_(wb.OpeningBank);
    if (isNaN(ocCents) || isNaN(obCents)) {
      skipped.push(wb.WalletID);
      return;
    }
    var oc = amountOf_(ocCents);
    var ob = amountOf_(obCents);
    var rowIdx = findWalletRowIndex_(wb.WalletID);
    if (rowIdx !== -1) {
      getWalletsSheet_().getRange(rowIdx, 8, 1, 2).setValues([[oc, ob]]);
      wallet.OpeningCash = oc;
      wallet.OpeningBank = ob;
    }
    var resolved = resolveWalletSheet_(wb.WalletID);
    if (resolved) writeWalletHeaderBlock_(resolved.sheet, wallet);
  });
  return skipped;
}

// ---------------- LOAN BACKUP SHAPING ----------------

function loanToBackupObj_(l) {
  return {
    id: l.id, user: l.user, type: l.typeStr, personId: l.personId, personName: l.personName,
    phone: l.phone, amount: l.amount, currency: l.currency, loanDate: l.loanDate,
    walletId: l.walletId, account: l.account, dueDate: l.dueDate, reminderDate: l.reminderDate,
    note: l.note, totalRepaid: l.totalRepaid, remainingAmount: l.remainingAmount,
    status: l.status, createdBy: l.createdBy, createdAt: l.createdAt, updatedAt: l.updatedAt,
    requestId: l.requestId,
  };
}

function paymentToBackupObj_(p) {
  return {
    id: p.id, loanId: p.loanId, user: p.user, type: p.type, amount: p.amount,
    currency: p.currency, walletId: p.walletId, account: p.account,
    paymentDate: p.paymentDate, note: p.note, createdBy: p.createdBy,
    createdAt: p.createdAt, requestId: p.requestId,
  };
}

function loanBackupRow_(l) {
  var loanType = String(l.type || "").toUpperCase();
  return [
    l.id, l.user, loanType, l.personId || "", l.personName || "", l.phone || "",
    amountOf_(centsOf_(l.amount)), l.currency, l.loanDate || "", l.walletId, l.account || "",
    l.dueDate || "", l.reminderDate || "", l.note || "",
    amountOf_(centsOf_(l.totalRepaid)), amountOf_(centsOf_(l.remainingAmount)), l.status || "ACTIVE",
    l.createdBy || l.user, l.createdAt || "", l.updatedAt || "", l.requestId || "",
  ];
}

function paymentBackupRow_(p) {
  var payType = String(p.type || "PAID").toUpperCase();
  return [
    p.id, p.loanId, p.user, payType, amountOf_(centsOf_(p.amount)), p.currency,
    p.walletId, p.account, p.paymentDate || "", p.note || "",
    p.createdBy || p.user, p.createdAt || "", p.requestId || "",
  ];
}

function additionToBackupObj_(a) {
  return {
    id: a.id, loanId: a.loanId, user: a.user, amount: a.amount,
    currency: a.currency, date: a.date, walletId: a.walletId, account: a.account,
    note: a.note, createdBy: a.createdBy, createdAt: a.createdAt, updatedAt: a.updatedAt,
    requestId: a.requestId, personId: a.personId,
  };
}

function additionBackupRow_(a) {
  return [
    a.id, a.loanId, a.user, amountOf_(centsOf_(a.amount)), a.currency, a.date || "",
    a.walletId, a.account || "", a.note || "", a.createdBy || a.user,
    a.createdAt || "", a.updatedAt || "", a.requestId || "", a.personId || "",
  ];
}

// Validates a backup's loan/payment payload without mutating anything.
// Returns { error } on failure, { skip: true } when the backup carries no
// loan data (legacy backups must NOT touch the loan sheets).
//
//   { skip: true }                          no loan array at all -> do not touch
//                                           the loan sheets
//   { error: "..." }                       payload is unusable
//   { skip: false, loanWalletIds: {...} }   valid; loanWalletIds lists every
//                                           wallet the loan data touches
//
// Every payment/addition is checked against the loan it belongs to, not just
// against the wallet sheet, so a crafted backup cannot park a payment in one
// wallet while claiming it belongs to a loan in another.
var VALID_LOAN_STATUSES = ["ACTIVE", "PARTIAL", "PAID", "OVERDUE", "CANCELLED"];

function validateLoanBackup_(loans, payments, additions, adminUsername, walletCache, backupAccountsByWallet) {
  if (!Array.isArray(loans)) return { skip: true };

  function walletOf_(walletId, where) {
    if (!walletId) return { error: where + ": Wallet ID is missing." };
    var w = walletCache[walletId] !== undefined ? walletCache[walletId] : getWalletById_(walletId);
    walletCache[walletId] = w;
    if (!w) return { error: where + ": Wallet does not exist." };
    if (!hasWalletAccess_(adminUsername, w.WalletID)) return { error: where + ": You do not have access to this wallet." };
    if (String(w.Status) !== "Active") return { error: where + ": Wallet is inactive." };
    return { wallet: w };
  }

  var loanWalletIds = {};
  var seenIds = {};
  var loanById = {};
  for (var i = 0; i < loans.length; i++) {
    var l = loans[i];
    var where = "Loan #" + (i + 1) + (l && l.id ? " (ID " + l.id + ")" : "");

    if (!l || !l.id) return { error: where + ": Loan ID is missing." };
    if (seenIds[l.id]) return { error: where + ": Duplicate loan ID in backup (" + l.id + ")." };
    seenIds[l.id] = true;

    var loanType = String(l.type || "").toUpperCase();
    if (loanType !== "GIVEN" && loanType !== "TAKEN") {
      return { error: where + ": Invalid loan type." };
    }
    if (!isValidAmount_(l.amount)) return { error: where + ": Invalid amount." };
    if (!isValidTransactionDate_(l.loanDate)) return { error: where + ": Invalid date." };
    if (l.dueDate && !isValidTransactionDate_(l.dueDate)) return { error: where + ": Invalid due date." };
    if (l.reminderDate && !isValidTransactionDate_(l.reminderDate)) return { error: where + ": Invalid reminder date." };
    if (l.dueDate && String(l.dueDate) < String(l.loanDate)) {
      return { error: where + ": Due date is before the loan date." };
    }
    if (l.reminderDate && String(l.reminderDate) < String(l.loanDate)) {
      return { error: where + ": Reminder date is before the loan date." };
    }
    if (!accountKnownInWallet_(l.walletId, l.account, backupAccountsByWallet)) return { error: where + ": Invalid account for its wallet." };
    if (!isLoanCurrency_(l.currency)) {
      return { error: where + ": Loan currency (" + l.currency + ") is not enabled for loans." };
    }
    if (l.status !== undefined && l.status !== null && l.status !== "" &&
        VALID_LOAN_STATUSES.indexOf(String(l.status).toUpperCase()) === -1) {
      return { error: where + ": Invalid loan status (" + l.status + ")." };
    }

    var w = walletOf_(l.walletId, where);
    if (w.error) return { error: w.error };
    if (l.currency !== w.wallet.Currency) {
      return { error: where + ": Loan currency (" + l.currency + ") does not match Wallet currency (" + w.wallet.Currency + ")." };
    }
    loanById[l.id] = l;
    loanWalletIds[String(l.walletId)] = true;
  }

  var payArr = Array.isArray(payments) ? payments : [];
  var paySeen = {};
  // Cent-exact per-loan totals, used for the aggregate overpayment check below.
  var payCentsByLoan = {};
  for (var j = 0; j < payArr.length; j++) {
    var p = payArr[j];
    var pWhere = "Payment #" + (j + 1) + (p && p.id ? " (ID " + p.id + ")" : "");

    if (!p || !p.id) return { error: pWhere + ": Payment ID is missing." };
    if (paySeen[p.id]) return { error: pWhere + ": Duplicate payment ID in backup (" + p.id + ")." };
    paySeen[p.id] = true;

    if (!loanById[p.loanId]) return { error: pWhere + ": References a loan that is not in the backup." };
    var parentLoan = loanById[p.loanId];
    if (!isValidAmount_(p.amount)) return { error: pWhere + ": Invalid amount." };
    var payType = String(p.type || "").toUpperCase();
    if (payType !== "RECEIVED" && payType !== "PAID") return { error: pWhere + ": Invalid payment type." };
    // The only writer of a payment row derives its type purely from the parent
    // loan (addLoanPayment_: loan.typeStr === "GIVEN" ? "RECEIVED" : "PAID"), so
    // a GIVEN loan can never hold a "PAID" row and a TAKEN loan can never hold a
    // "RECEIVED" one. Accepting the cross-pairing let a hand-edited backup create
    // a repayment whose stored direction contradicts the loan it belongs to.
    var parentLoanType = String(parentLoan.type).toUpperCase();
    var expectedPayType = parentLoanType === "GIVEN" ? "RECEIVED" : "PAID";
    if (payType !== expectedPayType) {
      return { error: pWhere + ": Payment type (" + payType + ") does not match its " + parentLoanType + " loan (expected " + expectedPayType + ")." };
    }
    if (!isValidTransactionDate_(p.paymentDate)) return { error: pWhere + ": Invalid date." };
    if (String(p.paymentDate) < String(parentLoan.loanDate)) {
      return { error: pWhere + ": Payment date is before the loan date." };
    }
    if (p.currency !== parentLoan.currency) {
      return { error: pWhere + ": Payment currency does not match its loan's currency." };
    }
    // Without this a backup could write a repayment against an account the
    // live loan screens reject.
    if (!accountKnownInWallet_(p.walletId, p.account, backupAccountsByWallet)) return { error: pWhere + ": Invalid account for its wallet." };

    var pw = walletOf_(p.walletId, pWhere);
    if (pw.error) return { error: pw.error };
    if (p.currency !== pw.wallet.Currency) {
      return { error: pWhere + ": Payment currency does not match its Wallet currency." };
    }
    // A repayment moves money against the loan's own wallet. A different
    // wallet here would desynchronise the loan ledger from the wallet the loan
    // is actually tracked in.
    if (String(p.walletId) !== String(parentLoan.walletId)) {
      return { error: pWhere + ": Payment wallet (" + p.walletId + ") does not match its loan's wallet (" + parentLoan.walletId + ")." };
    }
    payCentsByLoan[String(p.loanId)] = (payCentsByLoan[String(p.loanId)] || 0) + toCents_(p.amount);
  }

  var addArr = Array.isArray(additions) ? additions : [];
  var addSeen = {};
  var addCentsByLoan = {};
  for (var k = 0; k < addArr.length; k++) {
    var a = addArr[k];
    var aWhere = "Addition #" + (k + 1) + (a && a.id ? " (ID " + a.id + ")" : "");

    if (!a || !a.id) return { error: aWhere + ": Addition ID is missing." };
    if (addSeen[a.id]) return { error: aWhere + ": Duplicate addition ID in backup (" + a.id + ")." };
    addSeen[a.id] = true;

    if (!loanById[a.loanId]) return { error: aWhere + ": References a loan that is not in the backup." };
    var addLoan = loanById[a.loanId];
    if (!isValidAmount_(a.amount)) return { error: aWhere + ": Invalid amount." };
    if (!isValidTransactionDate_(a.date)) return { error: aWhere + ": Invalid date." };
    if (String(a.date) < String(addLoan.loanDate)) {
      return { error: aWhere + ": Addition date is before the loan date." };
    }
    if (a.currency !== addLoan.currency) {
      return { error: aWhere + ": Addition currency does not match its loan's currency." };
    }
    if (!accountKnownInWallet_(a.walletId, a.account, backupAccountsByWallet)) return { error: aWhere + ": Invalid account for its wallet." };

    var aw = walletOf_(a.walletId, aWhere);
    if (aw.error) return { error: aw.error };
    if (a.currency !== aw.wallet.Currency) {
      return { error: aWhere + ": Addition currency does not match its Wallet currency." };
    }
    if (String(a.walletId) !== String(addLoan.walletId)) {
      return { error: aWhere + ": Addition wallet (" + a.walletId + ") does not match its loan's wallet (" + addLoan.walletId + ")." };
    }
    addCentsByLoan[String(a.loanId)] = (addCentsByLoan[String(a.loanId)] || 0) + toCents_(a.amount);
  }

  // Mirror the live "never overpay" rule (addLoanPayment_: amount > remaining is
  // REJECTED, cent-exact, never clamped) at the aggregate level. Every mutating
  // path enforces remaining >= 0, so a backup whose repayments outrun
  // originalAmount + additions would restore a negative remaining that the live
  // ledger can never produce. Recomputed here in integer cents from the rows
  // being restored, never from the backup's own TotalRepaid column.
  for (var li = 0; li < loans.length; li++) {
    var lk = loans[li];
    var lkId = String(lk.id);
    var totalLoanCents = toCents_(lk.amount) + (addCentsByLoan[lkId] || 0);
    var paidCents = payCentsByLoan[lkId] || 0;
    if (paidCents > totalLoanCents) {
      return {
        error: "Loan #" + (li + 1) + " (ID " + lk.id + "): Total repayments (" + amountOf_(paidCents) +
          " " + lk.currency + ") exceed the loan total (" + amountOf_(totalLoanCents) + " " + lk.currency + ").",
      };
    }
  }

  // A loan's own TotalRepaid/RemainingAmount/Status in the backup are never
  // trusted: they are re-derived from the restored payment/addition rows by
  // recalcLoan_() after the write, so a backup cannot desynchronise the loan
  // ledger by shipping hand-edited totals.
  return { skip: false, loanWalletIds: loanWalletIds };
}

// ----------------- SAVINGS BACKUP SHAPING -----------------
//
// Savings sheets are simple, PlanID-keyed tables. A backup ships each plan row
// (with its owning wallet id, so scope can be enforced) plus every child ledger
// row that hangs off an in-scope plan. Rows travel as raw arrays so the restore
// path can write them back verbatim.

function savingsRawRows_(sheet, headers) {
  var out = [];
  if (sheet.getLastRow() >= 2) {
    var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues();
    for (var i = 0; i < data.length; i++) {
      if (data[i][0]) out.push(data[i]);
    }
  }
  return out;
}

function savingsChildrenByPlan_(sheet, headers, planIds) {
  return savingsRawRows_(sheet, headers)
    .filter(function (r) { return planIds[String(r[1])] === true; })
    .map(function (r) { return { planId: String(r[1]), row: r }; });
}

function getBackupData(username) {
  setupDatabase();
  var permErr = requirePermission_(username, "BACKUP_RESTORE");
  if (permErr) return permErr;
  var user = getUserRecord_(username);
  var isFullAdmin = user.Role === "Admin";
  var walletIds = (isFullAdmin ? getAllWalletIds_() : getUserWalletAccess_(user))
    .filter(function (id) {
      var w = getWalletById_(id);
      return w && String(w.Status) === "Active";
    });

  var transactions = [];
  walletIds.forEach(function (id) {
    var resolved = resolveWalletSheet_(id);
    if (resolved) transactions = transactions.concat(readWalletTransactions_(resolved.sheet, resolved.wallet));
  });

  var loans = [], loanPayments = [], loanAdditions = [];
  var savingsPlans = [], savingsGroupMembers = [], savingsGroupObligations = [], savingsGroupRounds = [], savingsFixedInstallments = [], savingsFlexDeposits = [], savingsFlexWithdrawals = [];
  var canSeeLoans = true;
  if (canSeeLoans) {
    var loansInScope = readLoansRaw_().filter(function (l) {
      return walletIds.indexOf(String(l.walletId)) !== -1;
    });
    loans = loansInScope.map(loanToBackupObj_);
    var inScopeIds = {};
    loans.forEach(function (l) { inScopeIds[l.id] = true; });
    if (Object.keys(inScopeIds).length) {
      var paySheet = getLoanPaymentsSheet_();
      if (paySheet.getLastRow() >= 2) {
        var pdata = paySheet.getRange(2, 1, paySheet.getLastRow() - 1, LOAN_PAYMENT_HEADERS.length).getValues();
        for (var i = 0; i < pdata.length; i++) {
          if (!pdata[i][0]) continue;
          var p = paymentFromRow_(pdata[i]);
          if (inScopeIds[p.loanId]) loanPayments.push(paymentToBackupObj_(p));
        }
      }
      var addSheet = getLoanAdditionsSheet_();
      if (addSheet.getLastRow() >= 2) {
        var adata = addSheet.getRange(2, 1, addSheet.getLastRow() - 1, LOAN_ADDITION_HEADERS.length).getValues();
        for (var j2 = 0; j2 < adata.length; j2++) {
          if (!adata[j2][0]) continue;
          var a = additionFromRow_(adata[j2]);
          if (inScopeIds[a.loanId]) loanAdditions.push(additionToBackupObj_(a));
        }
      }
    }
  }

  var canSeeSavings = savingsHasAny_(username, ["VIEW_SAVINGS", "SAVINGS_GROUP", "SAVINGS_FIXED", "SAVINGS_FLEXIBLE"]);
  if (canSeeSavings) {
    var plansInScope = savingsRawRows_(getSavingsPlansSheet_(), SAVINGS_PLAN_HEADERS).filter(function (row) {
      return walletIds.indexOf(String(row[3])) !== -1;
    });
    savingsPlans = plansInScope.map(function (row) {
      return { planId: String(row[0]), walletId: String(row[3]), row: row };
    });
    var savingsPlanIds = {};
    savingsPlans.forEach(function (p) { savingsPlanIds[p.planId] = true; });
    savingsGroupMembers = savingsChildrenByPlan_(getSavingsGroupMembersSheet_(), SAVINGS_GROUP_MEMBER_HEADERS, savingsPlanIds);
    savingsGroupObligations = savingsChildrenByPlan_(getSavingsGroupObligationsSheet_(), SAVINGS_GROUP_OBLIGATION_HEADERS, savingsPlanIds);
    savingsGroupRounds = savingsChildrenByPlan_(getSavingsGroupRoundsSheet_(), SAVINGS_GROUP_ROUND_HEADERS, savingsPlanIds);
    savingsFixedInstallments = savingsChildrenByPlan_(getSavingsFixedInstallmentsSheet_(), SAVINGS_FIXED_INSTALLMENT_HEADERS, savingsPlanIds);
    savingsFlexDeposits = savingsChildrenByPlan_(getSavingsFlexDepositsSheet_(), SAVINGS_FLEX_DEPOSIT_HEADERS, savingsPlanIds);
    savingsFlexWithdrawals = savingsChildrenByPlan_(getSavingsFlexWithdrawalsSheet_(), SAVINGS_FLEX_WITHDRAWAL_HEADERS, savingsPlanIds);
  }

  var shopSheets = shopLedgerSheets_();
  var shopLedgers = savingsRawRows_(shopSheets.shops, SHOP_LEDGER_HEADERS).filter(function (row) {
    return walletIds.indexOf(String(row[4])) !== -1;
  });
  var shopIds = {};
  shopLedgers.forEach(function (row) { shopIds[String(row[0])] = true; });
  var shopMarkets = savingsRawRows_(shopSheets.markets, SHOP_MARKET_HEADERS).filter(function (row) {
    return shopIds[String(row[1])] === true;
  });
  var shopPayments = savingsRawRows_(shopSheets.payments, SHOP_PAYMENT_HEADERS).filter(function (row) {
    return shopIds[String(row[1])] === true;
  });
  var shopLedgerHistory = savingsRawRows_(shopSheets.history, SHOP_LEDGER_HISTORY_HEADERS).filter(function (row) {
    return shopIds[String(row[1])] === true;
  });
  var shopLedgerOperations = savingsRawRows_(shopSheets.operations, SHOP_LEDGER_OPERATION_HEADERS).filter(function (row) {
    return walletIds.indexOf(String(row[3])) !== -1;
  });

  logAudit(username, "Backup exported", "", transactions.length + " transactions across " + walletIds.length + " wallet(s)"
    + (canSeeLoans ? " and " + loans.length + " loan(s)" + (loanAdditions.length ? " and " + loanAdditions.length + " addition(s)" : "") : "")
    + (canSeeSavings && savingsPlans.length ? " and " + savingsPlans.length + " savings plan(s)" : "")
    + (shopLedgers.length ? " and " + shopLedgers.length + " shop ledger(s)" : ""));
  return {
    status: "SUCCESS", transactions: transactions,
    wallets: getAllWalletsSafe_().filter(function (w) { return walletIds.indexOf(w.WalletID) !== -1; }),
    loans: loans, loanPayments: loanPayments, loanAdditions: loanAdditions,
    savingsPlans: savingsPlans, savingsGroupMembers: savingsGroupMembers, savingsGroupObligations: savingsGroupObligations, savingsGroupRounds: savingsGroupRounds, savingsFixedInstallments: savingsFixedInstallments, savingsFlexDeposits: savingsFlexDeposits, savingsFlexWithdrawals: savingsFlexWithdrawals,
    // The account registry rides along so a restore onto a fresh deployment keeps
    // the accounts its transaction/loan rows name. Types are global config;
    // financial accounts are scoped to the wallets in this export.
    accountTypes: savingsRawRows_(getAccountTypesSheet_(), ACCOUNT_TYPE_HEADERS),
    financialAccounts: savingsRawRows_(getFinancialAccountsSheet_(), FINANCIAL_ACCOUNT_HEADERS)
      .filter(function (r) { return walletIds.indexOf(String(r[1])) !== -1; }),
    shopLedgers: shopLedgers.map(function (row) { return { shopId: String(row[0]), walletId: String(row[4]), row: row }; }),
    shopMarkets: shopMarkets.map(function (row) { return { shopId: String(row[1]), row: row }; }),
    shopPayments: shopPayments.map(function (row) { return { shopId: String(row[1]), row: row }; }),
    shopLedgerHistory: shopLedgerHistory.map(function (row) { return { shopId: String(row[1]), row: row }; }),
    shopLedgerOperations: shopLedgerOperations.map(function (row) { return { walletId: String(row[3]), row: row }; }),
    shopLedgerWalletIds: walletIds.slice(),
  };
}

function validateShopLedgerBackup_(backup, username, backupAccountsByWallet) {
  var keys = ["shopLedgers", "shopMarkets", "shopPayments", "shopLedgerHistory", "shopLedgerOperations"];
  var hasAny = keys.some(function (key) { return Array.isArray(backup && backup[key]); });
  if (!hasAny) return { skip: true, paymentWallets: {} };
  for (var k = 0; k < keys.length; k++) {
    if (!Array.isArray(backup[keys[k]])) return { error: "Backup shop ledger section is incomplete (" + keys[k] + ")." };
  }

  var walletIds = Array.isArray(backup.shopLedgerWalletIds) ? backup.shopLedgerWalletIds.map(String) : [];
  if (!walletIds.length && Array.isArray(backup.wallets)) {
    walletIds = backup.wallets.map(function (wallet) { return String(wallet && wallet.WalletID || ""); }).filter(Boolean);
  }
  var walletSet = {};
  for (var w = 0; w < walletIds.length; w++) {
    if (!hasWalletAccess_(username, walletIds[w])) return { error: "Backup includes a shop ledger wallet outside your access." };
    walletSet[walletIds[w]] = true;
  }

  var shopMap = {};
  var shopRows = [];
  for (var i = 0; i < backup.shopLedgers.length; i++) {
    var item = backup.shopLedgers[i];
    var row = item && item.row;
    if (!row || row.length !== SHOP_LEDGER_HEADERS.length || !row[0] || !row[4]) {
      return { error: "Backup shop ledger #" + (i + 1) + " is malformed." };
    }
    var shopId = String(row[0]);
    var walletId = String(row[4]);
    if (item.shopId && String(item.shopId) !== shopId) return { error: "Backup shop ID does not match its row." };
    if (item.walletId && String(item.walletId) !== walletId) return { error: "Backup shop wallet does not match its row." };
    if (!walletSet[walletId] || !hasWalletAccess_(username, walletId)) return { error: "Backup shop " + shopId + " is outside your wallet access." };
    if (shopMap[shopId]) return { error: "Backup contains duplicate shop ID " + shopId + "." };
    if (row[5] !== SHOP_LEDGER_ACTIVE && row[5] !== SHOP_LEDGER_INACTIVE) return { error: "Backup shop " + shopId + " has an invalid status." };
    if (!row[1] || !row[2] || isNaN(openingAmountCents_(row[6]))) return { error: "Backup shop " + shopId + " has invalid details or opening balance." };
    shopMap[shopId] = { walletId: walletId, status: row[5] };
    shopRows.push(row);
  }

  function childRows_(items, headers, label, keyColumn) {
    var result = [];
    var seen = {};
    for (var j = 0; j < items.length; j++) {
      var child = items[j];
      var childRow = child && child.row;
      if (!childRow || childRow.length !== headers.length || !childRow[0] || !childRow[keyColumn]) {
        return { error: "Backup " + label + " #" + (j + 1) + " is malformed." };
      }
      var id = String(childRow[0]);
      var parentId = String(childRow[keyColumn]);
      if (child.shopId && String(child.shopId) !== parentId) {
        return { error: "Backup " + label + " parent does not match its row." };
      }
      if (!shopMap[parentId]) return { error: "Backup " + label + " " + id + " refers to a shop not in the backup." };
      if (seen[id]) return { error: "Backup contains duplicate " + label + " ID " + id + "." };
      if (childRow[5] !== SHOP_LEDGER_ACTIVE && childRow[5] !== "Deleted") {
        return { error: "Backup " + label + " " + id + " has an invalid status." };
      }
      if (!shopLedgerDate_(String(childRow[2]))) return { error: "Backup " + label + " " + id + " has an invalid date." };
      seen[id] = true;
      result.push(childRow);
    }
    return { rows: result, ids: seen };
  }

  var marketData = childRows_(backup.shopMarkets, SHOP_MARKET_HEADERS, "market", 1);
  if (marketData.error) return marketData;
  for (var m = 0; m < marketData.rows.length; m++) {
    var marketRow = marketData.rows[m];
    var products;
    try { products = JSON.parse(String(marketRow[3])); } catch (error) { return { error: "Backup market " + marketRow[0] + " has malformed product data." }; }
    if (!Array.isArray(products) || !products.length) return { error: "Backup market " + marketRow[0] + " has no products." };
    var productTotal = 0;
    for (var p = 0; p < products.length; p++) {
      var productCents = toCents_(products[p] && products[p].Total);
      if (!products[p] || !products[p].Name || !isFinite(productCents) || productCents < 0) {
        return { error: "Backup market " + marketRow[0] + " has an invalid product." };
      }
      productTotal += productCents;
    }
    if (productTotal <= 0 || productTotal !== toCents_(marketRow[4])) {
      return { error: "Backup market " + marketRow[0] + " total does not match its products." };
    }
  }

  var paymentData = childRows_(backup.shopPayments, SHOP_PAYMENT_HEADERS, "payment", 1);
  if (paymentData.error) return paymentData;
  var paymentWallets = {};
  var paymentBalances = {};
  for (var q = 0; q < paymentData.rows.length; q++) {
    var paymentRow = paymentData.rows[q];
    var allocations;
    try { allocations = JSON.parse(String(paymentRow[3])); } catch (error2) { return { error: "Backup payment " + paymentRow[0] + " has malformed allocations." }; }
    if (!Array.isArray(allocations) || !allocations.length) return { error: "Backup payment " + paymentRow[0] + " has no allocations." };
    var paymentTotal = 0;
    var paymentWalletId = shopMap[String(paymentRow[1])].walletId;
    for (var a = 0; a < allocations.length; a++) {
      var allocation = allocations[a];
      var allocationCents = toCents_(allocation && allocation.Amount);
      if (!allocation || !accountKnownInWallet_(paymentWalletId, allocation.AccountID, backupAccountsByWallet) ||
          !isFinite(allocationCents) || allocationCents <= 0) {
        return { error: "Backup payment " + paymentRow[0] + " has an invalid account allocation." };
      }
      paymentTotal += allocationCents;
    }
    if (paymentTotal !== toCents_(paymentRow[4])) return { error: "Backup payment " + paymentRow[0] + " total does not match its allocations." };
    paymentWallets[String(paymentRow[0])] = paymentWalletId;
    paymentBalances[String(paymentRow[0])] = {};
    if (paymentRow[5] === SHOP_LEDGER_ACTIVE) {
      allocations.forEach(function (allocation) {
        paymentBalances[String(paymentRow[0])][String(allocation.AccountID)] =
          (paymentBalances[String(paymentRow[0])][String(allocation.AccountID)] || 0) - toCents_(allocation.Amount);
      });
    }
  }

  var effectBalances = {};
  var backupTransactions = Array.isArray(backup.transactions) ? backup.transactions : [];
  for (var t = 0; t < backupTransactions.length; t++) {
    var transaction = backupTransactions[t];
    if (!transaction || (transaction.Type !== SHOP_LEDGER_PAYMENT_TYPE && transaction.Type !== SHOP_LEDGER_PAYMENT_REVERSAL_TYPE)) continue;
    var effectMatch = String(transaction.Note || "").match(/ShopPaymentID=([A-Za-z0-9_-]+)/);
    if (!effectMatch || !paymentWallets[effectMatch[1]]) {
      return { error: "Backup transaction " + (transaction.ID || (t + 1)) + " has no matching shop payment." };
    }
    if (String(paymentWallets[effectMatch[1]]) !== String(transaction.WalletID)) {
      return { error: "Backup shop payment effect belongs to a different wallet." };
    }
    var effectAmount = toCents_(transaction.Amount);
    var effectAccount = String(transaction.Account || "");
    if (!isFinite(effectAmount) || effectAmount <= 0 ||
        !accountKnownInWallet_(transaction.WalletID, effectAccount, backupAccountsByWallet)) {
      return { error: "Backup shop payment effect has an invalid account or amount." };
    }
    if (!effectBalances[effectMatch[1]]) effectBalances[effectMatch[1]] = {};
    effectBalances[effectMatch[1]][effectAccount] =
      (effectBalances[effectMatch[1]][effectAccount] || 0) +
      (transaction.Type === SHOP_LEDGER_PAYMENT_TYPE ? -effectAmount : effectAmount);
  }
  var paymentIds = Object.keys(paymentWallets);
  for (var e = 0; e < paymentIds.length; e++) {
    var paymentId = paymentIds[e];
    var accountIds = {};
    Object.keys(paymentBalances[paymentId]).forEach(function (accountId) { accountIds[accountId] = true; });
    Object.keys(effectBalances[paymentId] || {}).forEach(function (accountId) { accountIds[accountId] = true; });
    var effectAccountIds = Object.keys(accountIds);
    for (var ea = 0; ea < effectAccountIds.length; ea++) {
      var accountId = effectAccountIds[ea];
      if ((effectBalances[paymentId] && effectBalances[paymentId][accountId] || 0) !==
          (paymentBalances[paymentId][accountId] || 0)) {
        return { error: "Backup shop payment effects do not match payment " + paymentId + "." };
      }
    }
  }

  var historyRows = [];
  for (var h = 0; h < backup.shopLedgerHistory.length; h++) {
    var history = backup.shopLedgerHistory[h];
    if (!history || !history.row || history.row.length !== SHOP_LEDGER_HISTORY_HEADERS.length ||
        !history.row[0] || !shopMap[String(history.row[1])] ||
        (history.shopId && String(history.shopId) !== String(history.row[1]))) {
      return { error: "Backup shop history #" + (h + 1) + " is malformed or has no matching shop." };
    }
    historyRows.push(history.row);
  }

  var operationRows = [];
  var operationIds = {};
  for (var o = 0; o < backup.shopLedgerOperations.length; o++) {
    var operation = backup.shopLedgerOperations[o];
    var operationRow = operation && operation.row;
    if (!operationRow || operationRow.length !== SHOP_LEDGER_OPERATION_HEADERS.length ||
        !operationRow[0] || !operationRow[3] || !walletSet[String(operationRow[3])] ||
        (operation.walletId && String(operation.walletId) !== String(operationRow[3]))) {
      return { error: "Backup shop operation #" + (o + 1) + " is malformed or outside your wallet access." };
    }
    if (operationIds[String(operationRow[0])]) return { error: "Backup contains duplicate shop request ID " + operationRow[0] + "." };
    if (["PROCESSING", "COMPLETE", "RECONCILIATION_REQUIRED"].indexOf(String(operationRow[4])) === -1) {
      return { error: "Backup shop operation " + operationRow[0] + " has an invalid status." };
    }
    try { JSON.parse(String(operationRow[2])); } catch (error3) { return { error: "Backup shop operation " + operationRow[0] + " has malformed payload data." }; }
    operationIds[String(operationRow[0])] = true;
    operationRows.push(operationRow);
  }
  return {
    skip: false,
    walletIds: walletIds,
    shops: shopRows,
    markets: marketData.rows,
    payments: paymentData.rows,
    history: historyRows,
    operations: operationRows,
    shopMap: shopMap,
    paymentWallets: paymentWallets,
    paymentBalances: paymentBalances,
  };
}

function restoreShopLedgerBackup_(validation) {
  if (!validation || validation.skip) return { restored: 0 };
  var sheets = shopLedgerSheets_();
  var definitions = [
    { sheet: sheets.shops, headers: SHOP_LEDGER_HEADERS, key: "shops" },
    { sheet: sheets.markets, headers: SHOP_MARKET_HEADERS, key: "markets" },
    { sheet: sheets.payments, headers: SHOP_PAYMENT_HEADERS, key: "payments" },
    { sheet: sheets.history, headers: SHOP_LEDGER_HISTORY_HEADERS, key: "history" },
    { sheet: sheets.operations, headers: SHOP_LEDGER_OPERATION_HEADERS, key: "operations" },
  ];
  var snapshots = {};
  definitions.forEach(function (definition) {
    snapshots[definition.key] = definition.sheet.getLastRow() >= 2
      ? definition.sheet.getRange(2, 1, definition.sheet.getLastRow() - 1, definition.headers.length).getValues()
      : [];
  });
  var walletSet = {};
  validation.walletIds.forEach(function (id) { walletSet[String(id)] = true; });
  var replaceShopIds = {};
  snapshots.shops.forEach(function (row) {
    if (row[0] && walletSet[String(row[4])]) replaceShopIds[String(row[0])] = true;
  });
  validation.shops.forEach(function (row) { replaceShopIds[String(row[0])] = true; });

  var finalRows = {
    shops: snapshots.shops.filter(function (row) { return !walletSet[String(row[4])]; }).concat(validation.shops),
    markets: snapshots.markets.filter(function (row) { return !replaceShopIds[String(row[1])]; }).concat(validation.markets),
    payments: snapshots.payments.filter(function (row) { return !replaceShopIds[String(row[1])]; }).concat(validation.payments),
    history: snapshots.history.filter(function (row) { return !replaceShopIds[String(row[1])]; }).concat(validation.history),
    operations: snapshots.operations.filter(function (row) { return !walletSet[String(row[3])]; }).concat(validation.operations),
  };

  function writeRows_(rowsByKey) {
    definitions.forEach(function (definition) {
      wipeRows_(definition.sheet, 2);
      var rows = rowsByKey[definition.key];
      if (rows.length) definition.sheet.getRange(2, 1, rows.length, definition.headers.length).setValues(rows);
      if (populatedRowCount_(definition.sheet, 2, definition.headers.length) !== rows.length) {
        throw new Error("Shop ledger row count mismatch for " + definition.key);
      }
    });
  }
  try {
    writeRows_(finalRows);
  } catch (error) {
    try {
      writeRows_(snapshots);
    } catch (restoreError) {
      throw new Error("shop ledger restore failed and recovery also failed: " + String(error) + " / " + String(restoreError));
    }
    throw error;
  }
  return { restored: validation.shops.length };
}

// ----------------- ACCOUNT BACKUP SHAPING -----------------

// An account named in a backup may not exist in the live registry yet (the
// backup carries its own account rows), so validation accepts an id that appears
// either in the wallet's live accounts or in the payload's own account rows.
function accountKnownInWallet_(walletId, accountId, backupAccountsByWallet) {
  if (isValidAccountForWallet_(walletId, accountId)) return true;
  var m = backupAccountsByWallet && backupAccountsByWallet[String(walletId || "")];
  return !!(m && m[String(accountId || "")]);
}

// Validates the optional account portion of a backup without mutating anything.
//   { skip: true }   the backup carries no account data -> leave the registry alone
//   { error: "..." } payload is unusable
//   { skip: false, typeRows, acctRows, restoreTypes } valid
//
// Account types are global config, so only a full Admin may overwrite them; a
// non-Admin restore may still keep accounts that reference types that already
// exist. Financial accounts are scoped to the caller's wallets.
function validateAccountsBackup_(backup, scopeIds, isFullAdmin) {
  var typeRows = backup && Array.isArray(backup.accountTypes) ? backup.accountTypes : null;
  var acctRows = backup && Array.isArray(backup.financialAccounts) ? backup.financialAccounts : null;
  if (typeRows === null && acctRows === null) return { skip: true };

  var liveTypes = {};
  accountTypeRows_().forEach(function (t) { liveTypes[String(t.AccountTypeID)] = true; });
  var payloadTypes = {};
  var seenType = {};
  var newTypes = false;
  for (var i = 0; i < (typeRows || []).length; i++) {
    var t = typeRows[i];
    if (!t || !t[0]) return { error: "Backup account type #" + (i + 1) + " has no id." };
    if (seenType[String(t[0])]) return { error: "Duplicate account type id in backup (" + t[0] + ")." };
    seenType[String(t[0])] = true;
    var tStatus = String(t[6] || "");
    if (tStatus && tStatus !== ACCOUNT_STATUS_ACTIVE && tStatus !== ACCOUNT_STATUS_INACTIVE) {
      return { error: "Backup account type " + t[0] + " has an invalid status (" + tStatus + ")." };
    }
    payloadTypes[String(t[0])] = true;
    if (!liveTypes[String(t[0])]) newTypes = true;
  }
  if (newTypes && !isFullAdmin) {
    return { error: "Backup adds account types, which only an Admin can restore." };
  }

  var backupAccountsByWallet = {};
  var seenAcct = {};
  for (var j = 0; j < (acctRows || []).length; j++) {
    var a = acctRows[j];
    if (!a || !a[0]) return { error: "Backup account #" + (j + 1) + " has no id." };
    if (seenAcct[String(a[0])]) return { error: "Duplicate account id in backup (" + a[0] + ")." };
    seenAcct[String(a[0])] = true;
    var wid = String(a[1] || "");
    if (!wid) return { error: "Backup account " + a[0] + " has no wallet." };
    if (scopeIds.indexOf(wid) === -1) {
      return { error: "Backup account " + a[0] + " is in a wallet outside your access." };
    }
    var typeId = String(a[2] || "");
    if (typeId && !liveTypes[typeId] && !payloadTypes[typeId]) {
      return { error: "Backup account " + a[0] + " references an account type not present in this backup (" + typeId + ")." };
    }
    var aStatus = String(a[6] || "");
    if (aStatus && aStatus !== ACCOUNT_STATUS_ACTIVE && aStatus !== ACCOUNT_STATUS_INACTIVE) {
      return { error: "Backup account " + a[0] + " has an invalid status (" + aStatus + ")." };
    }
    if (!backupAccountsByWallet[wid]) backupAccountsByWallet[wid] = {};
    backupAccountsByWallet[wid][String(a[0])] = true;
  }

  return {
    skip: false, acctRows: acctRows || [],
    typeRows: typeRows || [], restoreTypes: isFullAdmin && !!(typeRows && typeRows.length),
    backupAccountsByWallet: backupAccountsByWallet,
  };
}

// Replaces the account rows for every wallet the payload names (keeps the rest),
// and - for a full Admin - the account types it names. Takes its own snapshot
// and rolls itself back on failure, like restoreSavings_.
function restoreAccountsBackup_(accountsVal) {
  var typeSheet = getAccountTypesSheet_();
  var acctSheet = getFinancialAccountsSheet_();
  var typeSnapshot = typeSheet.getLastRow() >= 2
    ? typeSheet.getRange(2, 1, typeSheet.getLastRow() - 1, ACCOUNT_TYPE_HEADERS.length).getValues() : [];
  var acctSnapshot = acctSheet.getLastRow() >= 2
    ? acctSheet.getRange(2, 1, acctSheet.getLastRow() - 1, FINANCIAL_ACCOUNT_HEADERS.length).getValues() : [];

  function writeTypes_(rows) {
    wipeRows_(typeSheet, 2);
    if (rows.length) typeSheet.getRange(2, 1, rows.length, ACCOUNT_TYPE_HEADERS.length).setValues(rows);
  }
  function writeAccts_(rows) {
    wipeRows_(acctSheet, 2);
    if (rows.length) acctSheet.getRange(2, 1, rows.length, FINANCIAL_ACCOUNT_HEADERS.length).setValues(rows);
  }

  var payloadWallets = {};
  accountsVal.acctRows.forEach(function (r) { payloadWallets[String(r[1])] = true; });
  var newAcctRows = acctSnapshot.filter(function (r) {
    return r[0] && !payloadWallets[String(r[1])];
  }).concat(accountsVal.acctRows);

  var newTypeRows = null;
  if (accountsVal.restoreTypes) {
    var payloadTypeIds = {};
    accountsVal.typeRows.forEach(function (r) { payloadTypeIds[String(r[0])] = true; });
    newTypeRows = typeSnapshot.filter(function (r) {
      return r[0] && !payloadTypeIds[String(r[0])];
    }).concat(accountsVal.typeRows);
  }

  try {
    writeAccts_(newAcctRows);
    if (newTypeRows) writeTypes_(newTypeRows);
    if (populatedRowCount_(acctSheet, 2, FINANCIAL_ACCOUNT_HEADERS.length) !== newAcctRows.length) {
      throw new Error("Financial account row count mismatch after restore");
    }
  } catch (e) {
    try { writeAccts_(acctSnapshot); writeTypes_(typeSnapshot); }
    catch (e2) { throw new Error("account restore failed and recovery also failed: " + String(e) + " / " + String(e2)); }
    throw e;
  }
}

// ----------------- SAVINGS RESTORE -----------------
//
// Savings sheets are PlanID-keyed raw tables. A restore only replaces the plans
// the backup actually names; every other plan (and its children) is carried over
// untouched, mirroring the loan restore's out-of-scope preservation.

function savingsBackupPlanRows_(backup) {
  return Array.isArray(backup && backup.savingsPlans)
    ? backup.savingsPlans.map(function (p) { return p && p.row; })
    : null;
}

function validateSavingsBackup_(backup, accessIds) {
  var planRows = savingsBackupPlanRows_(backup);
  if (planRows === null) return { skip: true };

  var backupPlanIds = {};
  for (var i = 0; i < planRows.length; i++) {
    var row = planRows[i];
    if (!row || !row[0]) return { error: "Backup contains a savings plan without a PlanID." };
    var walletId = String(row[3] || "");
    if (!walletId) return { error: "Backup savings plan " + row[0] + " has no wallet." };
    if (accessIds.indexOf(walletId) === -1) {
      return { error: "Backup savings plan " + row[0] + " is in a wallet outside your access." };
    }
    if (!savingsValidType_(String(row[1] || "").toUpperCase())) {
      return { error: "Backup savings plan " + row[0] + " has an invalid type." };
    }
    if (!isValidTransactionDate_(normDateStr_(row[6]))) {
      return { error: "Backup savings plan " + row[0] + " has an invalid start date." };
    }
    backupPlanIds[String(row[0])] = true;
  }

  // Every child ledger row must reference a plan that travels with the backup.
  var children = [
    ["savingsGroupMembers", "group member"],
    ["savingsGroupObligations", "group obligation"],
    ["savingsGroupRounds", "group round"],
    ["savingsFixedInstallments", "fixed installment"],
    ["savingsFlexDeposits", "flex deposit"],
    ["savingsFlexWithdrawals", "flex withdrawal"],
  ];
  for (var c = 0; c < children.length; c++) {
    var list = Array.isArray(backup[children[c][0]]) ? backup[children[c][0]] : [];
    for (var j = 0; j < list.length; j++) {
      var crow = list[j] && list[j].row;
      if (!crow || !crow[0]) return { error: "Backup " + children[c][1] + " #" + (j + 1) + " has no id." };
      if (!backupPlanIds[String(crow[1])]) {
        return { error: "Backup " + children[c][1] + " row " + crow[0] + " refers to a plan not in this backup." };
      }
    }
  }
  return { skip: false, planRows: planRows };
}

function restoreSavings_(backup) {
  var defs = [
    { sheet: getSavingsPlansSheet_(), headers: SAVINGS_PLAN_HEADERS, key: "savingsPlans", parent: false },
    { sheet: getSavingsGroupMembersSheet_(), headers: SAVINGS_GROUP_MEMBER_HEADERS, key: "savingsGroupMembers", parent: true },
    { sheet: getSavingsGroupObligationsSheet_(), headers: SAVINGS_GROUP_OBLIGATION_HEADERS, key: "savingsGroupObligations", parent: true },
    { sheet: getSavingsGroupRoundsSheet_(), headers: SAVINGS_GROUP_ROUND_HEADERS, key: "savingsGroupRounds", parent: true },
    { sheet: getSavingsFixedInstallmentsSheet_(), headers: SAVINGS_FIXED_INSTALLMENT_HEADERS, key: "savingsFixedInstallments", parent: true },
    { sheet: getSavingsFlexDepositsSheet_(), headers: SAVINGS_FLEX_DEPOSIT_HEADERS, key: "savingsFlexDeposits", parent: true },
    { sheet: getSavingsFlexWithdrawalsSheet_(), headers: SAVINGS_FLEX_WITHDRAWAL_HEADERS, key: "savingsFlexWithdrawals", parent: true },
  ];

  var snapshot = {};
  defs.forEach(function (d) {
    snapshot[d.key] = d.sheet.getLastRow() >= 2
      ? d.sheet.getRange(2, 1, d.sheet.getLastRow() - 1, d.headers.length).getValues() : [];
  });

  var backupPlanRows = (backup.savingsPlans || []).map(function (p) { return p.row; });
  var backupPlanIds = {};
  backupPlanRows.forEach(function (r) { if (r[0]) backupPlanIds[String(r[0])] = true; });

  var finalRows = {};
  defs.forEach(function (d) {
    var keep = snapshot[d.key].filter(function (r) {
      return r[0] && !backupPlanIds[String(r[d.parent ? 1 : 0])];
    });
    var add = d.parent
      ? (Array.isArray(backup[d.key]) ? backup[d.key] : []).map(function (x) { return x.row; })
      : backupPlanRows;
    finalRows[d.key] = keep.concat(add);
  });

  function writeAll_() {
    defs.forEach(function (d) {
      wipeRows_(d.sheet, 2);
      var rows = finalRows[d.key];
      if (rows.length) d.sheet.getRange(2, 1, rows.length, d.headers.length).setValues(rows);
    });
  }
  function restoreSnapshot_() {
    defs.forEach(function (d) {
      wipeRows_(d.sheet, 2);
      var rows = snapshot[d.key];
      if (rows.length) d.sheet.getRange(2, 1, rows.length, d.headers.length).setValues(rows);
    });
  }

  try {
    writeAll_();
    defs.forEach(function (d) {
      if (populatedRowCount_(d.sheet, 2, d.headers.length) !== finalRows[d.key].length) {
        throw new Error("Savings row count mismatch for " + d.key);
      }
    });
  } catch (e) {
    try { restoreSnapshot_(); } catch (e2) { throw new Error("savings restore failed and recovery also failed: " + String(e) + " / " + String(e2)); }
    throw e;
  }
  return { restored: backupPlanRows.length, kept: snapshot.savingsPlans.length - backupPlanRows.length };
}

function importBackup(backup, adminUsername) {
  setupDatabase();
  var permErr = requirePermission_(adminUsername, "BACKUP_RESTORE");
  if (permErr) return permErr;
  var transactions = backup && backup.transactions ? backup.transactions : [];
  var hasLoans = Array.isArray(backup && backup.loans);
  var hasSavings = Array.isArray(backup && backup.savingsPlans) && backup.savingsPlans.length > 0;
  var hasShopLedger = Array.isArray(backup && backup.shopLedgers) && backup.shopLedgers.length > 0;
  if ((!Array.isArray(transactions) || transactions.length === 0) && (!hasLoans || !backup.loans.length) && !hasSavings && !hasShopLedger) {
    return err_("ব্যাকআপে কোনো লেনদেন পাওয়া যায়নি!");
  }

  // A backup may carry its own account rows, so validation below accepts an
  // account id that the payload itself introduces even before it is restored.
  var backupAccountsByWallet = {};
  (Array.isArray(backup && backup.financialAccounts) ? backup.financialAccounts : []).forEach(function (r) {
    if (!r || !r[0] || !r[1]) return;
    var bwid = String(r[1]);
    if (!backupAccountsByWallet[bwid]) backupAccountsByWallet[bwid] = {};
    backupAccountsByWallet[bwid][String(r[0])] = true;
  });

  var shopLedgerVal = validateShopLedgerBackup_(backup, adminUsername, backupAccountsByWallet);
  if (shopLedgerVal.error) return validationError_(shopLedgerVal.error);

  var seenIds = {};
  var walletCache = {};
  // Reference maps for the ledger-effect check below, built from the raw arrays
  // before full validation so this transaction pass can already ask "does this
  // row have a ledger behind it?". validateLoanBackup_ and the payment/addition
  // checks still do the real validation afterwards.
  //
  // There are THREE kinds of ledger-generated wallet row, each named after the
  // record it belongs to (deleteLoan reverses exactly these three):
  //   "L_<loanId>"      the loan's opening effect, in loan.walletId
  //   "P_<paymentId>"   a repayment's effect,  in payment.walletId
  //   "A_<additionId>"  an addition's effect,   in addition.walletId
  var effectOwners = {};
  (hasLoans ? backup.loans : []).forEach(function (l) {
    if (l && l.id) effectOwners["L_" + String(l.id)] = String(l.walletId);
  });
  (Array.isArray(backup && backup.loanPayments) ? backup.loanPayments : []).forEach(function (p) {
    if (p && p.id) effectOwners["P_" + String(p.id)] = String(p.walletId);
  });
  (Array.isArray(backup && backup.loanAdditions) ? backup.loanAdditions : []).forEach(function (a) {
    if (a && a.id) effectOwners["A_" + String(a.id)] = String(a.walletId);
  });
  for (var i = 0; i < transactions.length; i++) {
    var t = transactions[i];
    var where = "Record #" + (i + 1) + (t && t.ID ? " (ID " + t.ID + ")" : "");

    if (!t || !t.WalletID) return validationError_(where + ": Wallet ID is missing.");
    if (!hasWalletAccess_(adminUsername, t.WalletID)) return walletAccessDenied_(where + ": You do not have access to this wallet.");

    var wallet = walletCache[t.WalletID] !== undefined ? walletCache[t.WalletID] : getWalletById_(t.WalletID);
    walletCache[t.WalletID] = wallet;
    if (!wallet) return validationError_(where + ": Wallet does not exist.");
    if (String(wallet.Status) !== "Active") return validationError_(where + ": Wallet is inactive.");

    if (VALID_STORED_TXN_TYPES.indexOf(t.Type) === -1) return validationError_(where + ": Invalid transaction type.");
    if (!accountKnownInWallet_(t.WalletID, t.Account, backupAccountsByWallet)) return validationError_(where + ": Invalid account for its wallet.");
    if (!isValidAmount_(t.Amount)) return validationError_(where + ": Invalid amount.");
    if (!isValidTransactionDate_(t.Date)) return validationError_(where + ": Invalid date.");
    if (t.Currency && t.Currency !== wallet.Currency) {
      return validationError_(where + ": Transaction currency (" + t.Currency + ") does not match Wallet currency (" + wallet.Currency + ").");
    }

    // A ledger-generated wallet row only means something next to the record it
    // belongs to, and the live paths already refuse to touch one (see
    // deleteTransaction and the deleteLoan reversal), so a restore must not be
    // able to inject an orphan: it would debit or credit a wallet with no
    // ledger behind it, and every later balance would count it forever. The
    // effect also has to sit in the wallet its own record belongs to.
    if (t.ID) {
      var effectId = String(t.ID);
      var isEffectId = effectId.indexOf("L_") === 0 || effectId.indexOf("P_") === 0 || effectId.indexOf("A_") === 0;
      if (isEffectId) {
        if (!Object.prototype.hasOwnProperty.call(effectOwners, effectId)) {
          return validationError_(where + ": Ledger effect row " + effectId + " has no matching loan/payment/addition in this backup. Restore the ledger together with the wallet rows.");
        }
        if (effectOwners[effectId] !== String(t.WalletID)) {
          return validationError_(where + ": Ledger effect row " + effectId + " belongs to wallet " + effectOwners[effectId] + ", not " + t.WalletID + ".");
        }
      }
      if (t.Type === SHOP_LEDGER_PAYMENT_TYPE || t.Type === SHOP_LEDGER_PAYMENT_REVERSAL_TYPE) {
        var shopPaymentMatch = String(t.Note || "").match(/ShopPaymentID=([A-Za-z0-9_-]+)/);
        if (!shopPaymentMatch || !shopLedgerVal.paymentWallets[shopPaymentMatch[1]]) {
          return validationError_(where + ": Shop payment effect has no matching payment in this backup.");
        }
        if (String(shopLedgerVal.paymentWallets[shopPaymentMatch[1]]) !== String(t.WalletID)) {
          return validationError_(where + ": Shop payment effect belongs to a different wallet.");
        }
      }
    }

    var id = t.ID || (t.WalletID + "_row" + i);
    if (seenIds[id]) return validationError_(where + ": Duplicate transaction ID in backup (" + id + ").");
    seenIds[id] = true;
  }

  var idsInBackup = {};
  transactions.forEach(function (t) { if (t.ID) idsInBackup[t.ID] = true; });
  for (var j = 0; j < transactions.length; j++) {
    var tj = transactions[j];
    if (tj.Type !== "Transfer Out" && tj.Type !== "Transfer In") continue;
    var counterpartId = tj.ID ? counterpartTxnId_(tj.ID) : null;
    if (!counterpartId || !idsInBackup[counterpartId]) {
      return validationError_("Record #" + (j + 1) + " (ID " + tj.ID + "): Transfer pair is incomplete or corrupted. Please repair it before modifying this transfer.");
    }
  }

  var loanVal = validateLoanBackup_(hasLoans ? backup.loans : null, backup.loanPayments, backup.loanAdditions, adminUsername, walletCache, backupAccountsByWallet);
  if (loanVal.error) return validationError_(loanVal.error);
  // Legacy backups (created before additions existed) carry no loanAdditions
  // array — in that case the additions table must NOT be wiped or rewritten.
  var touchAdditions = !loanVal.skip && Array.isArray(backup && backup.loanAdditions);

  // ---- SCOPE -------------------------------------------------------------
  // A restore must never let the loan ledger and the wallet ledgers disagree
  // about the same wallet: if the loan rows of a wallet are replaced while its
  // transaction sheet is left alone, the sheet keeps L_/P_/A_ effect rows whose
  // records no longer exist - money movements with nothing behind them, counted
  // by every later balance.
  //
  // So the loan ledger is replaced for exactly the wallets whose transaction
  // sheet this restore is also replacing, and every other wallet's loans are
  // carried over untouched. That holds for everyone, Admin included: an Admin
  // reaching all wallets must still not prune the loans of a wallet the payload
  // says nothing about.
  var caller = getUserRecord_(adminUsername);
  var isFullAdmin = isAdminRecord_(caller);
  var scopeIds = isFullAdmin ? getAllWalletIds_() : getUserWalletAccess_(caller);

  // Wallet ids that actually carry transaction rows in this backup. Built
  // separately from walletCache on purpose: walletCache is also filled in by
  // the loan validator, and wiping a wallet's TRANSACTION sheet merely because a
  // loan mentioned it would destroy that wallet's transactions.
  var txnWalletIds = {};
  transactions.forEach(function (t) { if (t && t.WalletID) txnWalletIds[String(t.WalletID)] = true; });
  var walletIds = Object.keys(txnWalletIds);

  // Validate the savings portion BEFORE anything is written, so a bad savings
  // payload cannot leave the wallet/loan side half-restored.
  var savingsVal = validateSavingsBackup_(backup, scopeIds);
  if (savingsVal.error) return validationError_(savingsVal.error);

  // Account registry: validated before any write alongside every other payload.
  var accountsVal = validateAccountsBackup_(backup, scopeIds, isFullAdmin);
  if (accountsVal.error) return validationError_(accountsVal.error);

  var snapshots = {};
  walletIds.forEach(function (id) {
    var resolved = resolveWalletSheet_(id);
    if (resolved && resolved.sheet.getLastRow() >= WALLET_DATA_START_ROW) {
      snapshots[id] = resolved.sheet.getRange(WALLET_DATA_START_ROW, 1, resolved.sheet.getLastRow() - WALLET_DATA_START_ROW + 1, TRANSACTION_HEADERS.length).getValues();
    } else {
      snapshots[id] = [];
    }
  });

  // ---- PRESERVE OUT-OF-SCOPE LOAN ROWS -----------------------------------
  // Any existing loan row whose wallet is not being replaced is carried over
  // untouched, together with the payments/additions that hang off it. Restored
  // rows are written on top.
  var preserved = { loans: [], payments: [], additions: [] };
  var preservedLoanIds = {};
  // Wallets whose loan records this restore replaces: the ones whose transaction
  // sheet it is rewriting, plus any wallet a backup record names whose sheet is
  // already empty (nothing to disagree with - a loan that was cancelled leaves
  // no effect row behind, so its wallet can legitimately carry no rows at all).
  var replaceLedgerIds = {};
  walletIds.forEach(function (id) { replaceLedgerIds[String(id)] = true; });
  if (!loanVal.skip) {
    var payloadLedgerWallets = [].concat(
      (backup.loans || []).map(function (l) { return l && l.walletId; }),
      (Array.isArray(backup.loanPayments) ? backup.loanPayments : []).map(function (p) { return p && p.walletId; }),
      touchAdditions ? (backup.loanAdditions || []).map(function (a) { return a && a.walletId; }) : []
    );
    for (var pi = 0; pi < payloadLedgerWallets.length; pi++) {
      if (!payloadLedgerWallets[pi]) continue;
      var pid = String(payloadLedgerWallets[pi]);
      if (replaceLedgerIds[pid]) continue;
      if (scopeIds.indexOf(pid) === -1) {
        return validationError_("Backup " + pid + " loan record is in a wallet outside your access. Restore only wallets you can reach.");
      }
      var presolved = resolveWalletSheet_(pid);
      if (presolved && presolved.sheet.getLastRow() < WALLET_DATA_START_ROW) {
        // Nothing in the wallet to contradict, so the record can stand alone.
        replaceLedgerIds[pid] = true;
        continue;
      }
      // The wallet already holds rows and this backup does not carry them.
      // Replacing its loan ledger would orphan those rows; leaving it alone
      // would add a loan with no wallet effect behind it. Refuse instead.
      return validationError_("Backup has loan records for wallet " + pid +
        " but none of that wallet's rows. Include " + pid + "'s transactions in the backup, or drop its loan records.");
    }
  }
  if (!loanVal.skip) {
    var loansSheet = getLoansSheet_();
    var paymentsSheet = getLoanPaymentsSheet_();
    snapshots["__loans__"] = loansSheet.getLastRow() >= 2
      ? loansSheet.getRange(2, 1, loansSheet.getLastRow() - 1, LOAN_HEADERS.length).getValues() : [];
    snapshots["__payments__"] = paymentsSheet.getLastRow() >= 2
      ? paymentsSheet.getRange(2, 1, paymentsSheet.getLastRow() - 1, LOAN_PAYMENT_HEADERS.length).getValues() : [];
    if (touchAdditions) {
      var additionsSheet = getLoanAdditionsSheet_();
      snapshots["__additions__"] = additionsSheet.getLastRow() >= 2
        ? additionsSheet.getRange(2, 1, additionsSheet.getLastRow() - 1, LOAN_ADDITION_HEADERS.length).getValues() : [];
    }

    preserved.loans = snapshots["__loans__"].filter(function (row) {
      if (!row[0]) return false;
      return !replaceLedgerIds[String(row[LOAN_COL_WALLET_ID])];
    });
    preserved.loans.forEach(function (row) { preservedLoanIds[String(row[0])] = true; });
    preserved.payments = snapshots["__payments__"].filter(function (row) {
      return row[0] && preservedLoanIds[String(row[LOAN_PAYMENT_COL_LOAN_ID])] === true;
    });
    if (touchAdditions) {
      preserved.additions = snapshots["__additions__"].filter(function (row) {
        return row[0] && preservedLoanIds[String(row[LOAN_ADDITION_COL_LOAN_ID])] === true;
      });
    }
  }

  // New ids must stay unique across the WHOLE sheet, not just across the part
  // being replaced - otherwise a restore could introduce a loan/payment id that
  // already belongs to a preserved record in a wallet this restore leaves alone.
  if (!loanVal.skip) {
    var preservedIds = { loans: {}, payments: {}, additions: {} };
    preserved.loans.forEach(function (r) { preservedIds.loans[String(r[0])] = true; });
    preserved.payments.forEach(function (r) { preservedIds.payments[String(r[0])] = true; });
    preserved.additions.forEach(function (r) { preservedIds.additions[String(r[0])] = true; });
    var clashes = [].concat(
      (backup.loans || []).map(function (l) { return { id: l.id, kind: "loan" }; }),
      (Array.isArray(backup.loanPayments) ? backup.loanPayments : []).map(function (p) { return { id: p.id, kind: "payment" }; }),
      touchAdditions ? (backup.loanAdditions || []).map(function (a) { return { id: a.id, kind: "addition" }; }) : []
    );
    for (var ci = 0; ci < clashes.length; ci++) {
      var kindKey = clashes[ci].kind === "loan" ? "loans" : (clashes[ci].kind === "payment" ? "payments" : "additions");
      if (preservedIds[kindKey][String(clashes[ci].id)]) {
        return validationError_("Backup " + clashes[ci].kind + " ID (" + clashes[ci].id +
          ") already exists in a wallet outside your access. Rename it in the backup file and try again.");
      }
    }
  }

  function restoreSnapshots_() {
    walletIds.forEach(function (id) {
      var resolved = resolveWalletSheet_(id);
      if (!resolved) return;
      wipeRows_(resolved.sheet, WALLET_DATA_START_ROW);
      if (snapshots[id] && snapshots[id].length) {
        resolved.sheet.getRange(WALLET_DATA_START_ROW, 1, snapshots[id].length, TRANSACTION_HEADERS.length).setValues(snapshots[id]);
      }
    });
    if (!loanVal.skip) {
      // The snapshots hold the full pre-restore sheet, so rollback restores
      // out-of-scope rows too - no separate "preserved" bookkeeping needed
      // on the failure path.
      wipeRows_(getLoansSheet_(), 2);
      if (snapshots["__loans__"] && snapshots["__loans__"].length) {
        getLoansSheet_().getRange(2, 1, snapshots["__loans__"].length, LOAN_HEADERS.length).setValues(snapshots["__loans__"]);
      }
      wipeRows_(getLoanPaymentsSheet_(), 2);
      if (snapshots["__payments__"] && snapshots["__payments__"].length) {
        getLoanPaymentsSheet_().getRange(2, 1, snapshots["__payments__"].length, LOAN_PAYMENT_HEADERS.length).setValues(snapshots["__payments__"]);
      }
      if (touchAdditions) {
        wipeRows_(getLoanAdditionsSheet_(), 2);
        if (snapshots["__additions__"] && snapshots["__additions__"].length) {
          getLoanAdditionsSheet_().getRange(2, 1, snapshots["__additions__"].length, LOAN_ADDITION_HEADERS.length).setValues(snapshots["__additions__"]);
        }
      }
    }
    cacheRemove_("loans", loansCacheKey_());
    cacheRemove_("loanadditions", "all");
  }

  try {
    walletIds.forEach(function (id) {
      var resolved = resolveWalletSheet_(id);
      if (!resolved) return;
      wipeRows_(resolved.sheet, WALLET_DATA_START_ROW);
    });

    var rowsByWallet = {};
    transactions.forEach(function (t) {
      var resolved = resolveWalletSheet_(t.WalletID);
      if (!resolved) return;
      if (!rowsByWallet[t.WalletID]) rowsByWallet[t.WalletID] = [];
      rowsByWallet[t.WalletID].push([
        t.ID || Utilities.getUuid(), t.Date, t.Type, resolved.wallet.Currency,
        t.Account, t.SourceCategory || "Other", t.WhereVendor || "", t.Description || "",
        amountOf_(centsOf_(t.Amount)), t.Note || "", t.User || adminUsername, t.Timestamp ? new Date(t.Timestamp) : new Date(),
      ]);
    });
    Object.keys(rowsByWallet).forEach(function (id) {
      var resolved = resolveWalletSheet_(id);
      var rows = rowsByWallet[id];
      var startRow = WALLET_DATA_START_ROW;
      resolved.sheet.getRange(startRow, 1, rows.length, TRANSACTION_HEADERS.length).setValues(rows);
      try {
        resolved.sheet.getRange(startRow, 2, rows.length, 1).setNumberFormat("yyyy-mm-dd");
        resolved.sheet.getRange(startRow, 9, rows.length, 1).setNumberFormat("#,##0.00");
      } catch (e) { /* formatting best-effort */ }
    });

    var expectedCountByWallet = {};
    transactions.forEach(function (t) { expectedCountByWallet[t.WalletID] = (expectedCountByWallet[t.WalletID] || 0) + 1; });
    for (var wid in expectedCountByWallet) {
      var resolvedCheck = resolveWalletSheet_(wid);
      var actualCount = resolvedCheck ? populatedRowCount_(resolvedCheck.sheet, WALLET_DATA_START_ROW, TRANSACTION_HEADERS.length) : 0;
      if (actualCount !== expectedCountByWallet[wid]) {
        throw new Error("Row count mismatch after restore for wallet " + wid);
      }
    }

    if (!loanVal.skip) {
      // Final loan rows = rows this restore is not replacing + the backup's rows.
      // A wallet the payload never mentions keeps its whole loan history, whoever
      // is doing the restoring.
      var newLoanRows = backup.loans.map(loanBackupRow_).concat(preserved.loans);
      var newPaymentRows = (Array.isArray(backup.loanPayments) ? backup.loanPayments : [])
        .map(paymentBackupRow_).concat(preserved.payments);

      wipeRows_(getLoansSheet_(), 2);
      if (newLoanRows.length) getLoansSheet_().getRange(2, 1, newLoanRows.length, LOAN_HEADERS.length).setValues(newLoanRows);
      wipeRows_(getLoanPaymentsSheet_(), 2);
      if (newPaymentRows.length) getLoanPaymentsSheet_().getRange(2, 1, newPaymentRows.length, LOAN_PAYMENT_HEADERS.length).setValues(newPaymentRows);

      if (populatedRowCount_(getLoansSheet_(), 2, LOAN_HEADERS.length) !== newLoanRows.length) {
        throw new Error("Loan row count mismatch after restore");
      }
      if (populatedRowCount_(getLoanPaymentsSheet_(), 2, LOAN_PAYMENT_HEADERS.length) !== newPaymentRows.length) {
        throw new Error("Loan payment row count mismatch after restore");
      }

      if (touchAdditions) {
        var newAdditionRows = backup.loanAdditions.map(additionBackupRow_).concat(preserved.additions);
        wipeRows_(getLoanAdditionsSheet_(), 2);
        if (newAdditionRows.length) getLoanAdditionsSheet_().getRange(2, 1, newAdditionRows.length, LOAN_ADDITION_HEADERS.length).setValues(newAdditionRows);
        if (populatedRowCount_(getLoanAdditionsSheet_(), 2, LOAN_ADDITION_HEADERS.length) !== newAdditionRows.length) {
          throw new Error("Loan addition row count mismatch after restore");
        }
      }

      // Re-derive TotalRepaid / RemainingAmount / Status for every restored
      // loan from the rows that were just written, instead of trusting the
      // values shipped in the backup file. This keeps the loan ledger
      // self-consistent no matter what the backup claimed.
      backup.loans.forEach(function (l) {       recalcLoan_(l.id); });
    }

    // Accounts next: restoreAccountsBackup_ takes its own snapshot and rolls
    // itself back on failure.
    if (!accountsVal.skip) {
      restoreAccountsBackup_(accountsVal);
    }

    // Savings last: restoreSavings_ takes its own snapshot and rolls itself
    // back on failure, while the outer catch still restores wallets/loans.
    if (!savingsVal.skip) {
      restoreSavings_(backup);
    }
    if (!shopLedgerVal.skip) {
      restoreShopLedgerBackup_(shopLedgerVal);
    }
  } catch (writeErr) {
    try {
      restoreSnapshots_();
    } catch (restoreErr) {
      logAudit(adminUsername, "Backup restore FAILED — automatic recovery also failed", "", String(writeErr) + " / " + String(restoreErr));
      return err_("ব্যাকআপ restore ব্যর্থ হয়েছে এবং automatic পুনরুদ্ধারও ব্যর্থ হয়েছে। অনুগ্রহ করে ম্যানুয়ালি Sheet পরীক্ষা করুন এবং সাহায্যের জন্য যোগাযোগ করুন।");
    }
    logAudit(adminUsername, "Backup restore failed — restored previous data", "", String(writeErr));
    return err_("ব্যাকআপ restore ব্যর্থ হয়েছে। পুরনো ডেটা পুনরুদ্ধার করা হয়েছে, কোনো তথ্য হারায়নি।");
  }

  logAudit(adminUsername, "Backup restored", "", transactions.length + " transactions across " + walletIds.length + " wallet(s)"
    + (!loanVal.skip ? " and " + backup.loans.length + " loan(s)"
      + (touchAdditions ? " and " + backup.loanAdditions.length + " addition(s)" : "")
      + (preserved.loans.length ? " (" + preserved.loans.length + " out-of-scope loan(s) preserved)" : "")
      : "")
    + (savingsVal.skip ? "" : " and " + (backup.savingsPlans || []).length + " savings plan(s)"));

  walletIds.forEach(function (id) {
    cacheRemove_("txns", "txns_" + id);
  });
  cacheRemove_("wallets", "all");
  cacheClear_("wallets");
  if (!accountsVal.skip) invalidateAccounts_();
  if (!loanVal.skip) {
    cacheRemove_("loans", loansCacheKey_());
    cacheRemove_("loanadditions", "all");
  }

  // Schema flag invalidation: importBackup rewrote the Users/Wallets/Audit
  // base sheets, so the setupDatabase_ schema/v2 fast-path must NOT skip the
  // full header-compare on the next instance. Remove the flag now (after ALL
  // writes) so the next getInitialData re-runs full setup over the restored
  // headers and self-repairs any shape the backup had.
  cacheRemove_("schema", "v2");
  var skippedOpening = restoreWalletOpeningBalances_(backup, adminUsername);
  if (skippedOpening.length) {
    logAudit(adminUsername, "Backup restored — opening balances skipped (invalid in file)",
      skippedOpening.join(","), "left unchanged; not treated as 0");
  }
  return {
    status: "SUCCESS",
    message: "ব্যাকআপ সফলভাবে restore হয়েছে!",
    skippedOpeningBalances: skippedOpening,
  };
}