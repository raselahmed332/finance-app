// ---------------- TRANSACTIONS ----------------

function spreadsheetSafeText_(value) {
  if (typeof value !== "string") return value;
  var formulaLikePrefix = /^[\s\u0000-\u001f\u007f]*[=+@-]/.test(value);
  var plainNegativeNumber = /^-\d+(?:\.\d+)?$/.test(value);
  return formulaLikePrefix && !plainNegativeNumber ? "'" + value : value;
}

function addTransaction(data) {
  setupDatabase();
  if (!data || !data.user || !data.date) return err_("লেনদেনের প্রয়োজনীয় তথ্য অসম্পূর্ণ!");
  if (VALID_INCOMING_OPERATION_TYPES.indexOf(data.type) === -1) return err_("Invalid transaction type.");

  if (data.type === "Transfer") return addTransfer_(data);
  if (data.type === "Bank Withdraw" || data.type === "Bank Deposit" || data.type === "Bank Operation") return addBankOp_(data);
  return addSimpleTxn_(data);
}

function txnResultObj_(id, date, type, currency, account, sourceCategory, whereVendor, description, amount, note, user, walletId, walletName) {
  return {
    ID: id, Date: date, Type: type, Currency: currency, Account: account,
    SourceCategory: sourceCategory, WhereVendor: whereVendor, Description: description,
    Amount: amount, Note: note, User: user, WalletID: walletId, WalletName: walletName,
  };
}

function addSimpleTxn_(data) {
  var permKey = data.type === "Income" ? "ADD_INCOME" : "ADD_EXPENSE";
  var permErr = authorize_(data.user, permKey, [data.walletId]);
  if (permErr) return permErr;
  var activeErr = requireActiveWallet_(data.walletId);
  if (activeErr) return activeErr;
  var accountErr = requireActiveAccount_(data.walletId, data.account);
  if (accountErr) return accountErr;
  if (!isValidAmount_(data.amount)) return err_(amountError_(data.amount), "INVALID_AMOUNT");
  if (!isValidTransactionDate_(data.date)) return err_("Invalid date.");

  var resolved = resolveWalletSheet_(data.walletId);
  if (!resolved) return err_("Wallet পাওয়া যায়নি!");
  if (data.currency && data.currency !== resolved.wallet.Currency) {
    return err_("Transaction currency does not match Wallet currency.");
  }

  var sourceCategory = spreadsheetSafeText_(data.sourceCategory || "Other");
  var whereVendor = spreadsheetSafeText_(data.whereVendor || "");
  var description = spreadsheetSafeText_(data.description || "");
  var note = spreadsheetSafeText_(data.note || "");
  var amount = amountOf_(toCents_(data.amount));

  if (data.clientId) {
    var existingRowNum = findTxnRow_(resolved.sheet, data.clientId);
    if (existingRowNum !== -1) {
      var existing = rowValsToObj_(resolved.sheet.getRange(existingRowNum, 1, 1, TRANSACTION_HEADERS.length).getValues()[0]);
      // A retry is only the same request when EVERY submitted field matches,
      // compared in exact cents. Matching on a subset (or a 0.005 float
      // tolerance) would hand back a different transaction than the one being
      // retried and silently drop the user's correction.
      var matches = existing.Type === data.type && existing.Account === data.account &&
        sameAmount_(existing.Amount, amount) && String(existing.User) === String(data.user) &&
        normDateStr_(existing.Date) === normDateStr_(data.date) &&
        String(existing.SourceCategory || "") === String(sourceCategory) &&
        String(existing.WhereVendor || "") === String(whereVendor) &&
        String(existing.Description || "") === String(description) &&
        String(existing.Note || "") === String(note);
      if (!matches) return err_("এই request ID আগে ভিন্ন তথ্য দিয়ে ব্যবহার করা হয়েছে।", "DUPLICATE_REQUEST");
      return {
        status: "SUCCESS", message: "লেনদেন সফলভাবে যোগ হয়েছে!",
        transaction: txnResultObj_(existing.ID, existing.Date, existing.Type, existing.Currency, existing.Account, existing.SourceCategory, existing.WhereVendor, existing.Description, existing.Amount, existing.Note, existing.User, data.walletId, resolved.wallet.WalletName),
      };
    }
  }

  if (data.type === "Expense") {
    var balErr = requireSufficientBalance_(data.walletId, data.account, amount, null);
    if (balErr) return balErr;
  }

  var id = data.clientId || Utilities.getUuid();
  resolved.sheet.appendRow([id, data.date, data.type, resolved.wallet.Currency, data.account, sourceCategory, whereVendor, description, amount, note, data.user, new Date()]);
  cacheRemove_("txns", "txns_" + data.walletId);
  logAudit(data.user, "Transaction added", data.walletId, data.type + " " + amount);
  return {
    status: "SUCCESS", message: "লেনদেন সফলভাবে যোগ হয়েছে!",
    transaction: txnResultObj_(id, data.date, data.type, resolved.wallet.Currency, data.account, sourceCategory, whereVendor, description, amount, note, data.user, data.walletId, resolved.wallet.WalletName),
  };
}

// A "Bank Operation" is now a generic transfer between two DIFFERENT accounts of
// the SAME wallet (Cash <-> Bank historically, but any two accounts today). It
// still writes a two-row Transfer Out / Transfer In pair:
//
//   _1  Transfer Out from the source account   (balance is checked here)
//   _2  Transfer In  to   the destination account
//
// The legacy shorthand types are preserved: "Bank Withdraw" means Bank -> Cash
// and "Bank Deposit" means Cash -> Bank, so an older client needs no change. New
// clients send explicit fromAccount / toAccount (type "Bank Operation").
function addBankOp_(data) {
  var permErr = authorize_(data.user, "BANK_OPERATIONS", [data.walletId]);
  if (permErr) return permErr;
  var activeErr = requireActiveWallet_(data.walletId);
  if (activeErr) return activeErr;
  if (!isValidAmount_(data.amount)) return err_(amountError_(data.amount), "INVALID_AMOUNT");
  if (!isValidTransactionDate_(data.date)) return err_("Invalid date.");
  var resolved = resolveWalletSheet_(data.walletId);
  if (!resolved) return err_("Wallet পাওয়া যায়নি!");
  if (data.currency && data.currency !== resolved.wallet.Currency) {
    return err_("Transaction currency does not match Wallet currency.");
  }

  // Resolve the source and destination accounts. The legacy shorthand wins only
  // when no explicit accounts are supplied.
  var isWithdraw = data.type === "Bank Withdraw";
  var isDeposit = data.type === "Bank Deposit";
  var fromAccount = data.fromAccount || (isWithdraw ? "Bank" : (isDeposit ? "Cash" : ""));
  var toAccount = data.toAccount || (isWithdraw ? "Cash" : (isDeposit ? "Bank" : ""));
  if (!fromAccount || !toAccount) return err_("Invalid account.");
  if (String(fromAccount) === String(toAccount)) {
    return err_("একই অ্যাকাউন্টে অপারেশন করা যাবে না — আলাদা দুইটি অ্যাকাউন্ট নির্বাচন করুন।", "SAME_ACCOUNT");
  }
  var fromAccErr = requireActiveAccount_(data.walletId, fromAccount);
  if (fromAccErr) return fromAccErr;
  var toAccErr = requireActiveAccount_(data.walletId, toAccount);
  if (toAccErr) return toAccErr;

  var opId = data.clientId || Utilities.getUuid();
  var currency = resolved.wallet.Currency;
  var amount = amountOf_(toCents_(data.amount));
  var fromName = accountNameFor_(data.walletId, fromAccount);
  var toName = accountNameFor_(data.walletId, toAccount);
  var desc = spreadsheetSafeText_(data.description || data.type || (fromName + " → " + toName));
  var note = spreadsheetSafeText_(data.note || "");
  var firstVendor = spreadsheetSafeText_("To " + toName);
  var secondVendor = spreadsheetSafeText_("From " + fromName);

  if (data.clientId) {
    var pair = findPairByIds_(resolved.sheet, opId + "_1", resolved.sheet, opId + "_2");
    if (pair.objA || pair.objB) {
      if (pair.complete) {
        var matches = pair.objA.User === data.user && pair.objB.User === data.user &&
          normDateStr_(pair.objA.Date) === normDateStr_(data.date) && normDateStr_(pair.objB.Date) === normDateStr_(data.date) &&
          pair.objA.Type === "Transfer Out" && pair.objB.Type === "Transfer In" &&
          pair.objA.Account === fromAccount && pair.objB.Account === toAccount &&
          pair.objA.Currency === currency && pair.objB.Currency === currency &&
          sameAmount_(pair.objA.Amount, amount) && sameAmount_(pair.objB.Amount, amount);
        if (!matches) return err_("এই request ID আগে ভিন্ন তথ্য দিয়ে ব্যবহার করা হয়েছে।", "DUPLICATE_REQUEST");
        return {
          status: "SUCCESS", message: "ব্যাংক অপারেশন সফল হয়েছে!",
          transactions: [
            txnResultObj_(pair.objA.ID, pair.objA.Date, pair.objA.Type, pair.objA.Currency, pair.objA.Account, pair.objA.SourceCategory, pair.objA.WhereVendor, pair.objA.Description, pair.objA.Amount, pair.objA.Note, pair.objA.User, data.walletId, resolved.wallet.WalletName),
            txnResultObj_(pair.objB.ID, pair.objB.Date, pair.objB.Type, pair.objB.Currency, pair.objB.Account, pair.objB.SourceCategory, pair.objB.WhereVendor, pair.objB.Description, pair.objB.Amount, pair.objB.Note, pair.objB.User, data.walletId, resolved.wallet.WalletName),
          ],
        };
      }

      logAudit(data.user, "Broken bank operation pair detected on retry", opId, JSON.stringify({ side1Exists: !!pair.objA, side2Exists: !!pair.objB }));

      if (pair.objA && !pair.objB) {
        var firstMatchesRequest = pair.objA.User === data.user && normDateStr_(pair.objA.Date) === normDateStr_(data.date) &&
          pair.objA.Type === "Transfer Out" && pair.objA.Account === fromAccount &&
          pair.objA.Currency === currency && sameAmount_(pair.objA.Amount, amount);
        if (firstMatchesRequest) {
          try {
            resolved.sheet.appendRow([opId + "_2", data.date, "Transfer In", currency, toAccount, "Bank Operation", secondVendor, pair.objA.Description, amount, pair.objA.Note, data.user, new Date()]);
            logAudit(data.user, "Broken bank operation pair recovered (missing side completed)", opId, "");
            cacheRemove_("txns", "txns_" + data.walletId);
            return {
              status: "SUCCESS", message: "ব্যাংক অপারেশন সফল হয়েছে!",
              transactions: [
                txnResultObj_(pair.objA.ID, pair.objA.Date, pair.objA.Type, pair.objA.Currency, pair.objA.Account, pair.objA.SourceCategory, pair.objA.WhereVendor, pair.objA.Description, pair.objA.Amount, pair.objA.Note, pair.objA.User, data.walletId, resolved.wallet.WalletName),
                txnResultObj_(opId + "_2", data.date, "Transfer In", currency, toAccount, "Bank Operation", secondVendor, pair.objA.Description, amount, pair.objA.Note, data.user, data.walletId, resolved.wallet.WalletName),
              ],
            };
          } catch (recoverErr) {
            logAudit(data.user, "Broken bank operation pair recovery FAILED", opId, String(recoverErr));
            return err_("Transfer pair is incomplete and could not be safely repaired. Please contact support before retrying.");
          }
        }
      }
      return err_("Transfer pair is incomplete or corrupted. Please repair it before modifying this transfer.");
    }
  }

  var balErr = requireSufficientBalance_(data.walletId, fromAccount, amount, null);
  if (balErr) return balErr;

  try {
    resolved.sheet.appendRow([opId + "_1", data.date, "Transfer Out", currency, fromAccount, "Bank Operation", firstVendor, desc, amount, note, data.user, new Date()]);
  } catch (e1) {
    return err_("ব্যাংক অপারেশন ব্যর্থ হয়েছে। কোনো পরিবর্তন হয়নি।");
  }
  try {
    resolved.sheet.appendRow([opId + "_2", data.date, "Transfer In", currency, toAccount, "Bank Operation", secondVendor, desc, amount, note, data.user, new Date()]);
  } catch (e2) {
    var rollbackOk = true;
    try {
      var rn = findTxnRow_(resolved.sheet, opId + "_1");
      if (rn !== -1) resolved.sheet.deleteRow(rn);
    } catch (e3) {
      rollbackOk = false;
    }
    if (rollbackOk) {
      logAudit(data.user, "Bank operation failed — rolled back", opId, String(e2));
      return err_("ব্যাংক অপারেশন ব্যর্থ হয়েছে এবং পূর্বাবস্থায় ফেরত নেওয়া হয়েছে। আবার চেষ্টা করুন।");
    }
    logAudit(data.user, "Bank operation failed — ROLLBACK ALSO FAILED — broken pair left in place", opId, String(e2) + " :: " + String(e3));
    invalidateLedgersAfterPartialWrite_([data.walletId]);
    return err_("ব্যাংক অপারেশন ব্যর্থ হয়েছে এবং এক পাশের রেকর্ড পূর্বাবস্থায় ফেরত নেওয়াও যায়নি — দুই পাশের হিসাব এখন অসম মিলতে পারে। আবার চেষ্টা করবেন না; অনুগ্রহ করে Admin দিয়ে যাচাই করান।", "INCONSISTENT_STATE");
  }

  logAudit(data.user, "Bank operation", data.walletId, fromAccount + " -> " + toAccount + " " + amount);
  cacheRemove_("txns", "txns_" + data.walletId);
  return {
    status: "SUCCESS", message: "ব্যাংক অপারেশন সফল হয়েছে!",
    transactions: [
      txnResultObj_(opId + "_1", data.date, "Transfer Out", currency, fromAccount, "Bank Operation", firstVendor, desc, amount, note, data.user, data.walletId, resolved.wallet.WalletName),
      txnResultObj_(opId + "_2", data.date, "Transfer In", currency, toAccount, "Bank Operation", secondVendor, desc, amount, note, data.user, data.walletId, resolved.wallet.WalletName),
    ],
  };
}

function addTransfer_(data) {
  var permErr = authorize_(data.user, "TRANSFER_MONEY", [data.fromWalletId, data.toWalletId]);
  if (permErr) return permErr;
  var fromActiveErr = requireActiveWallet_(data.fromWalletId);
  if (fromActiveErr) return fromActiveErr;
  var toActiveErr = requireActiveWallet_(data.toWalletId);
  if (toActiveErr) return toActiveErr;
  var fromAccErr = requireActiveAccount_(data.fromWalletId, data.fromAccount);
  if (fromAccErr) return fromAccErr;
  var toAccErr = requireActiveAccount_(data.toWalletId, data.toAccount);
  if (toAccErr) return toAccErr;
  if (String(data.fromWalletId) === String(data.toWalletId) && data.fromAccount === data.toAccount) {
    return err_("একই Wallet ও Account এ ট্রান্সফার করার কোনো অর্থ নেই।");
  }
  if (!isValidAmount_(data.fromAmount)) return err_(amountError_(data.fromAmount), "INVALID_AMOUNT");
  if (data.toAmount !== undefined && data.toAmount !== "" && !isValidAmount_(data.toAmount)) return err_(amountError_(data.toAmount), "INVALID_AMOUNT");
  if (!isValidTransactionDate_(data.date)) return err_("Invalid date.");

  var fromResolved = resolveWalletSheet_(data.fromWalletId);
  var toResolved = resolveWalletSheet_(data.toWalletId);
  if (!fromResolved || !toResolved) return err_("Wallet পাওয়া যায়নি!");
  if (data.fromCurrency && data.fromCurrency !== fromResolved.wallet.Currency) return err_("Transaction currency does not match Wallet currency.");
  if (data.toCurrency && data.toCurrency !== toResolved.wallet.Currency) return err_("Transaction currency does not match Wallet currency.");

  var refId = data.clientId || Utilities.getUuid();
  // Both amounts already passed strict validation above, so going through cents
  // here stores the canonical value instead of whatever double the raw input
  // happened to land on.
  var fromAmount = amountOf_(toCents_(data.fromAmount));
  var toAmount = amountOf_(toCents_(data.toAmount !== undefined && data.toAmount !== "" && data.toAmount !== null ? data.toAmount : data.fromAmount));

  if (data.clientId) {
    var pair = findPairByIds_(fromResolved.sheet, refId + "_OUT", toResolved.sheet, refId + "_IN");
    if (pair.objA || pair.objB) {
      if (pair.complete) {
        var matches = validateTransferPairIntegrity_(pair, {
          user: data.user, date: data.date, amountA: fromAmount, amountB: toAmount,
          accountA: data.fromAccount, accountB: data.toAccount,
          currencyA: fromResolved.wallet.Currency, currencyB: toResolved.wallet.Currency,
        });
        if (!matches) return err_("এই request ID আগে ভিন্ন তথ্য দিয়ে ব্যবহার করা হয়েছে।", "DUPLICATE_REQUEST");
        return {
          status: "SUCCESS", message: "ট্রান্সফার সফল হয়েছে!",
          transactions: [
            txnResultObj_(pair.objA.ID, pair.objA.Date, pair.objA.Type, pair.objA.Currency, pair.objA.Account, pair.objA.SourceCategory, pair.objA.WhereVendor, pair.objA.Description, pair.objA.Amount, pair.objA.Note, pair.objA.User, data.fromWalletId, fromResolved.wallet.WalletName),
            txnResultObj_(pair.objB.ID, pair.objB.Date, pair.objB.Type, pair.objB.Currency, pair.objB.Account, pair.objB.SourceCategory, pair.objB.WhereVendor, pair.objB.Description, pair.objB.Amount, pair.objB.Note, pair.objB.User, data.toWalletId, toResolved.wallet.WalletName),
          ],
        };
      }

      logAudit(data.user, "Broken transfer pair detected on retry", refId, JSON.stringify({ outExists: !!pair.objA, inExists: !!pair.objB }));

      if (pair.objA && !pair.objB) {
        var outMatchesRequest = pair.objA.User === data.user && pair.objA.Date === data.date &&
          pair.objA.Account === data.fromAccount && pair.objA.Currency === fromResolved.wallet.Currency &&
          sameAmount_(pair.objA.Amount, fromAmount);
        if (outMatchesRequest) {
          try {
            toResolved.sheet.appendRow([refId + "_IN", data.date, "Transfer In", toResolved.wallet.Currency,
              data.toAccount, "Transfer", spreadsheetSafeText_(fromResolved.wallet.WalletName),
              spreadsheetSafeText_(pair.objA.Description), toAmount, spreadsheetSafeText_(pair.objA.Note), data.user, new Date()]);
            logAudit(data.user, "Broken transfer pair recovered (missing IN completed)", refId, "");
            cacheRemove_("txns", "txns_" + data.fromWalletId);
            if (data.fromWalletId !== data.toWalletId) cacheRemove_("txns", "txns_" + data.toWalletId);
            return {
              status: "SUCCESS", message: "ট্রান্সফার সফল হয়েছে!",
              transactions: [
                txnResultObj_(pair.objA.ID, pair.objA.Date, pair.objA.Type, pair.objA.Currency, pair.objA.Account, pair.objA.SourceCategory, pair.objA.WhereVendor, pair.objA.Description, pair.objA.Amount, pair.objA.Note, pair.objA.User, data.fromWalletId, fromResolved.wallet.WalletName),
                txnResultObj_(refId + "_IN", data.date, "Transfer In", toResolved.wallet.Currency, data.toAccount, "Transfer", fromResolved.wallet.WalletName, pair.objA.Description, toAmount, pair.objA.Note, data.user, data.toWalletId, toResolved.wallet.WalletName),
              ],
            };
          } catch (recoverErr) {
            logAudit(data.user, "Broken transfer pair recovery FAILED", refId, String(recoverErr));
            return err_("Transfer pair is incomplete and could not be safely repaired. Please contact support before retrying.");
          }
        }
      }
      return err_("Transfer pair is incomplete or corrupted. Please repair it before modifying this transfer.");
    }
  }

  var balErr = requireSufficientBalance_(data.fromWalletId, data.fromAccount, fromAmount, null);
  if (balErr) return balErr;

  var outDesc = spreadsheetSafeText_(data.description || "Transfer to " + toResolved.wallet.WalletName);
  var inDesc = spreadsheetSafeText_(data.description || "Transfer from " + fromResolved.wallet.WalletName);
  var note = spreadsheetSafeText_(data.note || "");
  var fromVendor = spreadsheetSafeText_(fromResolved.wallet.WalletName);
  var toVendor = spreadsheetSafeText_(toResolved.wallet.WalletName);

  try {
    fromResolved.sheet.appendRow([refId + "_OUT", data.date, "Transfer Out", fromResolved.wallet.Currency,
      data.fromAccount, "Transfer", toVendor, outDesc, fromAmount, note, data.user, new Date()]);
  } catch (e1) {
    return err_("ট্রান্সফার ব্যর্থ হয়েছে। কোনো পরিবর্তন হয়নি।");
  }
  try {
    toResolved.sheet.appendRow([refId + "_IN", data.date, "Transfer In", toResolved.wallet.Currency,
      data.toAccount, "Transfer", fromVendor, inDesc, toAmount, note, data.user, new Date()]);
  } catch (e2) {
    var rollbackOk = true;
    try {
      var rn = findTxnRow_(fromResolved.sheet, refId + "_OUT");
      if (rn !== -1) fromResolved.sheet.deleteRow(rn);
    } catch (e3) {
      rollbackOk = false;
    }
    if (rollbackOk) {
      logAudit(data.user, "Transfer failed — rolled back", refId, String(e2));
      return err_("ট্রান্সফার ব্যর্থ হয়েছে এবং পূর্বাবস্থায় ফেরত নেওয়া হয়েছে। আবার চেষ্টা করুন।");
    }
    logAudit(data.user, "Transfer failed — ROLLBACK ALSO FAILED — broken pair left in place", refId, String(e2) + " :: " + String(e3));
    invalidateLedgersAfterPartialWrite_([data.fromWalletId, data.toWalletId]);
    return err_("ট্রান্সফার ব্যর্থ হয়েছে এবং এক পাশের রেকর্ড পূর্বাবস্থায় ফেরত নেওয়াও যায়নি — দুই পাশের হিসাব এখন অসম মিলতে পারে। আবার চেষ্টা করবেন না; অনুগ্রহ করে Admin দিয়ে যাচাই করান।", "INCONSISTENT_STATE");
  }

  logAudit(data.user, "Transfer", data.fromWalletId + " -> " + data.toWalletId, fromAmount + " " + fromResolved.wallet.Currency);
  cacheRemove_("txns", "txns_" + data.fromWalletId);
  if (data.fromWalletId !== data.toWalletId) cacheRemove_("txns", "txns_" + data.toWalletId);
  return {
    status: "SUCCESS", message: "ট্রান্সফার সফল হয়েছে!",
    transactions: [
      txnResultObj_(refId + "_OUT", data.date, "Transfer Out", fromResolved.wallet.Currency, data.fromAccount, "Transfer", toResolved.wallet.WalletName, outDesc, fromAmount, note, data.user, data.fromWalletId, fromResolved.wallet.WalletName),
      txnResultObj_(refId + "_IN", data.date, "Transfer In", toResolved.wallet.Currency, data.toAccount, "Transfer", fromResolved.wallet.WalletName, inDesc, toAmount, note, data.user, data.toWalletId, toResolved.wallet.WalletName),
    ],
  };
}

function findTxnRow_(sheet, id) {
  var lastRow = sheet.getLastRow();
  if (lastRow < WALLET_DATA_START_ROW) return -1;
  var ids = sheet.getRange(WALLET_DATA_START_ROW, 1, lastRow - WALLET_DATA_START_ROW + 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) return WALLET_DATA_START_ROW + i;
  }
  return -1;
}

function counterpartTxnId_(id) {
  if (typeof id !== "string") return null;
  if (id.slice(-4) === "_OUT") return id.slice(0, -4) + "_IN";
  if (id.slice(-3) === "_IN") return id.slice(0, -3) + "_OUT";
  if (id.slice(-2) === "_1") return id.slice(0, -2) + "_2";
  if (id.slice(-2) === "_2") return id.slice(0, -2) + "_1";
  return null;
}

function rowValsToObj_(vals) {
  var obj = {};
  for (var i = 0; i < TRANSACTION_HEADERS.length; i++) {
    obj[TRANSACTION_HEADERS[i]] = vals[i];
  }
  return obj;
}

function readTxnAt_(walletId, wallet, sheet, rowNum) {
  var vals = sheet.getRange(rowNum, 1, 1, TRANSACTION_HEADERS.length).getValues()[0];
  return { walletId: walletId, wallet: wallet, sheet: sheet, rowNum: rowNum, row: rowValsToObj_(vals) };
}

function findPairByIds_(sheetA, idA, sheetB, idB) {
  var objA = null, objB = null, rowA = -1, rowB = -1;
  var la = sheetA.getLastRow();
  if (la >= WALLET_DATA_START_ROW) {
    var ids = sheetA.getRange(WALLET_DATA_START_ROW, 1, la - WALLET_DATA_START_ROW + 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      if (String(ids[i][0]) === String(idA)) { rowA = WALLET_DATA_START_ROW + i; break; }
    }
  }
  var lb = sheetB.getLastRow();
  if (lb >= WALLET_DATA_START_ROW) {
    var ids2 = sheetB.getRange(WALLET_DATA_START_ROW, 1, lb - WALLET_DATA_START_ROW + 1, 1).getValues();
    for (var j = 0; j < ids2.length; j++) {
      if (String(ids2[j][0]) === String(idB)) { rowB = WALLET_DATA_START_ROW + j; break; }
    }
  }
  if (rowA !== -1) {
    var rA = sheetA.getRange(rowA, 1, 1, TRANSACTION_HEADERS.length).getValues()[0];
    objA = rowValsToObj_(rA);
  }
  if (rowB !== -1) {
    var rB = sheetB.getRange(rowB, 1, 1, TRANSACTION_HEADERS.length).getValues()[0];
    objB = rowValsToObj_(rB);
  }
  return { rowA: rowA, rowB: rowB, objA: objA, objB: objB, complete: !!objA && !!objB };
}

function validateTransferPairIntegrity_(pair, expected) {
  if (!pair.complete) return false;
  var a = pair.objA, b = pair.objB;
  return a.User === expected.user && b.User === expected.user &&
    a.Date === expected.date && b.Date === expected.date &&
    a.Account === expected.accountA && b.Account === expected.accountB &&
    a.Currency === expected.currencyA && b.Currency === expected.currencyB &&
    sameAmount_(a.Amount, expected.amountA) &&
    sameAmount_(b.Amount, expected.amountB);
}

function locateTransferPair_(id, walletId, username) {
  var resolved = resolveWalletSheet_(walletId);
  if (!resolved) return { isTransfer: false, notFound: true };
  var rowNum = findTxnRow_(resolved.sheet, id);
  if (rowNum === -1) return { isTransfer: false, notFound: true };

  var sideA = readTxnAt_(walletId, resolved.wallet, resolved.sheet, rowNum);
  if (sideA.row.Type !== "Transfer Out" && sideA.row.Type !== "Transfer In") {
    return { isTransfer: false, single: sideA };
  }

  var counterpartId = counterpartTxnId_(id);
  if (!counterpartId) return { isTransfer: true, broken: true };

  var sameSheetRow = findTxnRow_(resolved.sheet, counterpartId);
  if (sameSheetRow !== -1) {
    return { isTransfer: true, sideA: sideA, sideB: readTxnAt_(walletId, resolved.wallet, resolved.sheet, sameSheetRow) };
  }

  var user = getUserRecord_(username);
  var accessibleIds = user ? getUserWalletAccess_(user) : [];
  for (var i = 0; i < accessibleIds.length; i++) {
    var otherId = accessibleIds[i];
    if (String(otherId) === String(walletId)) continue;
    var other = resolveWalletSheet_(otherId);
    if (!other) continue;
    var otherRowNum = findTxnRow_(other.sheet, counterpartId);
    if (otherRowNum !== -1) {
      return { isTransfer: true, sideA: sideA, sideB: readTxnAt_(otherId, other.wallet, other.sheet, otherRowNum) };
    }
  }
  return { isTransfer: true, broken: true };
}

function updateTransaction(data, adminUsername) {
  setupDatabase();
  var walletId = data.walletId;
  if (!walletId) return err_("walletId is required to update a transaction.");
  var permErr = authorize_(adminUsername, "MANAGE_TRANSACTIONS", [walletId]);
  if (permErr) return permErr;

  var resolved = resolveWalletSheet_(walletId);
  if (!resolved) return err_("Wallet পাওয়া যায়নি!");
  var rowNum = findTxnRow_(resolved.sheet, data.id);
  if (rowNum === -1) return err_("লেনদেন পাওয়া যায়নি!");

  var currentType = resolved.sheet.getRange(rowNum, 3, 1, 1).getValue();
  if (isLoanEffectType_(currentType)) {
    return err_("এই লেনদেনটি হাওলাত (Loan) ব্যবস্থাপনার অংশ — এখানে এডিট করা যাবে না।");
  }
  if (currentType === "Shop Credit Payment" || currentType === "Shop Credit Payment Reversal") {
    return err_("এই লেনদেনটি দোকানের বাকির পেমেন্টের অংশ — দোকানের খাতা থেকেই পরিবর্তন করুন।");
  }
  if (currentType === "Transfer Out" || currentType === "Transfer In") {
    return updateTransferPair_(data, adminUsername);
  }

  // A simple transaction can only stay Income/Expense. Allowing it to morph
  // into a Transfer or loan-effect type here would create an orphan transfer
  // pair or a loan balance change with no backing loan record.
  if (data.type !== "Income" && data.type !== "Expense") return err_("Invalid transaction type.");
  var accountErr = requireActiveAccount_(walletId, data.account);
  if (accountErr) return accountErr;
  if (!isValidAmount_(data.amount)) return err_(amountError_(data.amount), "INVALID_AMOUNT");
  if (!isValidTransactionDate_(data.date)) return err_("Invalid date.");
  if (data.currency && data.currency !== resolved.wallet.Currency) {
    return err_("Transaction currency does not match Wallet currency.");
  }

  var amount = amountOf_(toCents_(data.amount));
  if (data.type === "Expense") {
    var balErr = requireSufficientBalance_(walletId, data.account, amount, data.id);
    if (balErr) return balErr;
  }

  var sourceCategory = spreadsheetSafeText_(data.sourceCategory || "Other");
  var whereVendor = spreadsheetSafeText_(data.whereVendor || "");
  var description = spreadsheetSafeText_(data.description || "");
  var note = spreadsheetSafeText_(data.note || "");
  var originalUser = resolved.sheet.getRange(rowNum, 11, 1, 1).getValue();
  resolved.sheet.getRange(rowNum, 2, 1, 9).setValues([[
    data.date, data.type, resolved.wallet.Currency, data.account, sourceCategory,
    whereVendor, description, amount, note,
  ]]);
  logAudit(adminUsername, "Transaction updated", walletId, data.id);
  cacheRemove_("txns", "txns_" + walletId);
  return {
    status: "SUCCESS", message: "লেনদেন সফলভাবে আপডেট হয়েছে!",
    transaction: txnResultObj_(data.id, data.date, data.type, resolved.wallet.Currency, data.account, sourceCategory, whereVendor, description, amount, note, originalUser, walletId, resolved.wallet.WalletName),
  };
}

function updateTransferPair_(data, adminUsername) {
  var pair = locateTransferPair_(data.id, data.walletId, adminUsername);
  if (!pair.isTransfer || pair.notFound) return err_("লেনদেন পাওয়া যায়নি!");
  if (pair.broken) return err_("এই ট্রান্সফারের একটি পাশ (side) খুঁজে পাওয়া যায়নি। নিরাপত্তার জন্য কোনো পরিবর্তন করা হয়নি।");

  if (!hasWalletAccess_(adminUsername, pair.sideA.walletId) || !hasWalletAccess_(adminUsername, pair.sideB.walletId)) {
    return err_("You do not have access to this wallet.");
  }

  var outSide = pair.sideA.row.Type === "Transfer Out" ? pair.sideA : (pair.sideB.row.Type === "Transfer Out" ? pair.sideB : null);
  var inSide = pair.sideA.row.Type === "Transfer In" ? pair.sideA : (pair.sideB.row.Type === "Transfer In" ? pair.sideB : null);
  if (!outSide || !inSide) return err_("এই ট্রান্সফারের একটি পাশ (side) খুঁজে পাওয়া যায়নি। নিরাপত্তার জন্য কোনো পরিবর্তন করা হয়নি।");

  // Both amounts are validated as the RAW client-supplied value, never after a
  // Number() pass. Number() silently accepted "1e3" / "0x10" / true / [5] and
  // turned them into legitimate-looking amounts, so a transfer side could be
  // rewritten with a value the client never actually typed. isValidAmount_ ->
  // toCents_ rejects those shapes outright.
  if (!isValidAmount_(data.fromAmount)) return err_(amountError_(data.fromAmount), "INVALID_AMOUNT");
  var newFromAmount = amountOf_(toCents_(data.fromAmount));
  var hasToAmount = data.toAmount !== undefined && data.toAmount !== "" && data.toAmount !== null;
  var rawToAmount = hasToAmount ? data.toAmount : data.fromAmount;
  if (!isValidAmount_(rawToAmount)) return err_(amountError_(rawToAmount), "INVALID_AMOUNT");
  var newToAmount = amountOf_(toCents_(rawToAmount));
  if (data.date && !isValidTransactionDate_(data.date)) return err_("Invalid date.");

  var balErr = requireSufficientBalance_(outSide.walletId, outSide.row.Account, newFromAmount, outSide.row.ID);
  if (balErr) return balErr;

  var newDate = data.date || outSide.row.Date;
  var newNote = spreadsheetSafeText_(data.note !== undefined ? data.note : outSide.row.Note);
  var descriptionExplicitlyChanged = data.description !== undefined && data.description !== outSide.row.Description;
  var newOutDescription = spreadsheetSafeText_(data.description !== undefined ? data.description : outSide.row.Description);
  var newInDescription = spreadsheetSafeText_(descriptionExplicitlyChanged ? data.description : inSide.row.Description);

  var oldOutRow = [outSide.row.Date, outSide.row.Type, outSide.row.Currency, outSide.row.Account, outSide.row.SourceCategory, outSide.row.WhereVendor, outSide.row.Description, outSide.row.Amount, outSide.row.Note];

  try {
    outSide.sheet.getRange(outSide.rowNum, 2, 1, 9).setValues([[
      newDate, "Transfer Out", outSide.row.Currency, outSide.row.Account, outSide.row.SourceCategory,
      outSide.row.WhereVendor, newOutDescription, newFromAmount, newNote,
    ]]);
  } catch (e1) {
    return err_("ট্রান্সফার আপডেট ব্যর্থ হয়েছে। কোনো পরিবর্তন হয়নি।");
  }
  try {
    inSide.sheet.getRange(inSide.rowNum, 2, 1, 9).setValues([[
      newDate, "Transfer In", inSide.row.Currency, inSide.row.Account, inSide.row.SourceCategory,
      inSide.row.WhereVendor, newInDescription, newToAmount, newNote,
    ]]);
  } catch (e2) {
    var pairRollbackErr = null;
    try { outSide.sheet.getRange(outSide.rowNum, 2, 1, 9).setValues([oldOutRow]); } catch (e3) { pairRollbackErr = String(e3); }
    logAudit(adminUsername, "Transfer pair update FAILED", outSide.walletId + " & " + inSide.walletId,
      String(e2) + (pairRollbackErr ? " (rollback failed: " + pairRollbackErr + ")" : " (rolled back)"));
    if (pairRollbackErr) {
      invalidateLedgersAfterPartialWrite_([data.walletId, outSide.walletId, inSide.walletId]);
      return err_("ট্রান্সফার আপডেট ব্যর্থ হয়েছে এবং From পাশের হিসাব পূর্বাবস্থায় ফেরত নেওয়াও যায়নি — ট্রান্সফারের দুই পাশ এখন অসম মিলতে পারে। আবার চেষ্টা করবেন না; অনুগ্রহ করে Admin দিয়ে যাচাই করান। (কারণ: " + pairRollbackErr + ")", "INCONSISTENT_STATE");
    }
    return err_("ট্রান্সফার আপডেট ব্যর্থ হয়েছে এবং পূর্বাবস্থায় ফেরত নেওয়া হয়েছে। আবার চেষ্টা করুন।");
  }

  logAudit(adminUsername, "Transfer pair updated", outSide.walletId + " & " + inSide.walletId, data.id);
  cacheRemove_("txns", "txns_" + outSide.walletId);
  if (outSide.walletId !== inSide.walletId) cacheRemove_("txns", "txns_" + inSide.walletId);
  return {
    status: "SUCCESS", message: "ট্রান্সফার সফলভাবে আপডেট হয়েছে (উভয় পাশ)!",
    transactions: [
      txnResultObj_(outSide.row.ID, newDate, "Transfer Out", outSide.row.Currency, outSide.row.Account, outSide.row.SourceCategory, outSide.row.WhereVendor, newOutDescription, newFromAmount, newNote, outSide.row.User, outSide.walletId, outSide.wallet.WalletName),
      txnResultObj_(inSide.row.ID, newDate, "Transfer In", inSide.row.Currency, inSide.row.Account, inSide.row.SourceCategory, inSide.row.WhereVendor, newInDescription, newToAmount, newNote, inSide.row.User, inSide.walletId, inSide.wallet.WalletName),
    ],
  };
}

function getTransferPair(id, walletId, username) {
  setupDatabase();
  var permErr = requirePermission_(username, "VIEW_TRANSACTIONS");
  if (permErr) return permErr;
  var accessErr = requireWalletAccess_(username, walletId);
  if (accessErr) return accessErr;

  var pair = locateTransferPair_(id, walletId, username);
  if (!pair.isTransfer || pair.notFound) return err_("লেনদেন পাওয়া যায়নি!");
  if (pair.broken) return err_("এই ট্রান্সফারের একটি পাশ (side) খুঁজে পাওয়া যায়নি।");
  if (!hasWalletAccess_(username, pair.sideA.walletId) || !hasWalletAccess_(username, pair.sideB.walletId)) {
    return err_("You do not have access to this wallet.");
  }

  var outSide = pair.sideA.row.Type === "Transfer Out" ? pair.sideA : pair.sideB;
  var inSide = pair.sideA.row.Type === "Transfer In" ? pair.sideA : pair.sideB;

  return {
    status: "SUCCESS",
    out: { walletId: outSide.walletId, walletName: outSide.wallet.WalletName, currency: outSide.row.Currency, account: outSide.row.Account, amount: outSide.row.Amount, id: outSide.row.ID },
    in: { walletId: inSide.walletId, walletName: inSide.wallet.WalletName, currency: inSide.row.Currency, account: inSide.row.Account, amount: inSide.row.Amount, id: inSide.row.ID },
    date: outSide.row.Date, note: outSide.row.Note, description: outSide.row.Description,
  };
}

function deleteTransaction(id, adminUsernameOrWalletId, maybeAdminUsername) {
  setupDatabase();
  var walletId = maybeAdminUsername ? adminUsernameOrWalletId : null;
  var adminUsername = maybeAdminUsername || adminUsernameOrWalletId;

  var permErr = requirePermission_(adminUsername, "MANAGE_TRANSACTIONS");
  if (permErr) return permErr;

  var walletIdFound = walletId;
  if (!walletIdFound) {
    var candidates = getUserWalletAccess_(getUserRecord_(adminUsername));
    for (var i = 0; i < candidates.length; i++) {
      if (!hasWalletAccess_(adminUsername, candidates[i])) continue;
      var r = resolveWalletSheet_(candidates[i]);
      if (r && findTxnRow_(r.sheet, id) !== -1) { walletIdFound = candidates[i]; break; }
    }
  }
  if (!walletIdFound) return err_("লেনদেন পাওয়া যায়নি!");
  if (!hasWalletAccess_(adminUsername, walletIdFound)) return err_("You do not have access to this wallet.");

  var pair = locateTransferPair_(id, walletIdFound, adminUsername);

  if (!pair.isTransfer) {
    if (pair.notFound) return err_("লেনদেন পাওয়া যায়নি!");
    if (isLoanEffectType_(pair.single.row.Type)) {
      return err_("এই লেনদেনটি হাওলাত (Loan) ব্যবস্থাপনার অংশ — এখানে মুছে ফেলা যাবে না।");
    }
    if (pair.single.row.Type === "Shop Credit Payment" || pair.single.row.Type === "Shop Credit Payment Reversal") {
      return err_("এই লেনদেনটি দোকানের বাকির পেমেন্টের অংশ — দোকানের খাতা থেকেই পরিবর্তন করুন।");
    }
    pair.single.sheet.deleteRow(pair.single.rowNum);
    cacheRemove_("txns", "txns_" + walletIdFound);
    logAudit(adminUsername, "Transaction deleted", walletIdFound, id);
    return { status: "SUCCESS", message: "লেনদেন মুছে ফেলা হয়েছে!", deletedIds: [id] };
  }

  if (pair.broken) {
    return err_("এই ট্রান্সফারের একটি পাশ (side) খুঁজে পাওয়া যায়নি। ডেটা সুরক্ষার জন্য কোনো পরিবর্তন করা হয়নি।");
  }

  if (!hasWalletAccess_(adminUsername, pair.sideA.walletId) || !hasWalletAccess_(adminUsername, pair.sideB.walletId)) {
    return err_("You do not have access to this wallet.");
  }

  var first, second;
  if (String(pair.sideA.walletId) === String(pair.sideB.walletId)) {
    first = pair.sideA.rowNum > pair.sideB.rowNum ? pair.sideA : pair.sideB;
    second = pair.sideA.rowNum > pair.sideB.rowNum ? pair.sideB : pair.sideA;
  } else {
    first = pair.sideA;
    second = pair.sideB;
  }

  var firstRowValues = first.sheet.getRange(first.rowNum, 1, 1, TRANSACTION_HEADERS.length).getValues()[0];

  try {
    first.sheet.deleteRow(first.rowNum);
  } catch (e1) {
    return err_("ট্রান্সফার মুছতে ব্যর্থ হয়েছে। কোনো পরিবর্তন হয়নি।");
  }
  try {
    second.sheet.deleteRow(second.rowNum);
  } catch (e2) {
    var delRestoreErr = null;
    try { first.sheet.appendRow(firstRowValues); } catch (e3) { delRestoreErr = String(e3); }
    logAudit(adminUsername, "Transfer pair delete FAILED", pair.sideA.walletId + " & " + pair.sideB.walletId,
      String(e2) + (delRestoreErr ? " (restore failed: " + delRestoreErr + ")" : " (restored)"));
    if (delRestoreErr) {
      invalidateLedgersAfterPartialWrite_([pair.sideA.walletId, pair.sideB.walletId]);
      return err_("ট্রান্সফার মুছতে ব্যর্থ হয়েছে এবং এক পাশের রেকর্ড পূর্বাবস্থায় ফেরত আনাও যায়নি — ট্রান্সফারের দুই পাশ এখন অসম মিলতে পারে। আবার চেষ্টা করবেন না; অনুগ্রহ করে Admin দিয়ে যাচাই করান। (কারণ: " + delRestoreErr + ")", "INCONSISTENT_STATE");
    }
    return err_("ট্রান্সফার মুছতে ব্যর্থ হয়েছে এবং পূর্বাবস্থায় ফেরত আনা হয়েছে। আবার চেষ্টা করুন।");
  }

  logAudit(adminUsername, "Transfer pair deleted", pair.sideA.walletId + " & " + pair.sideB.walletId, id);
  cacheRemove_("txns", "txns_" + pair.sideA.walletId);
  if (pair.sideA.walletId !== pair.sideB.walletId) cacheRemove_("txns", "txns_" + pair.sideB.walletId);
  return { status: "SUCCESS", message: "ট্রান্সফার (উভয় পাশ) মুছে ফেলা হয়েছে!", deletedIds: [pair.sideA.row.ID, pair.sideB.row.ID] };
}

function getTransactions(username, opts) {
  setupDatabase();
  var permErr = requirePermission_(username, "VIEW_TRANSACTIONS");
  if (permErr) return permErr;

  var user = getUserRecord_(username);
  var accessible = getUserWalletAccess_(user);
  var walletIds = opts.walletId ? [opts.walletId] : accessible;
  walletIds = walletIds.filter(function (id) { return accessible.indexOf(String(id)) !== -1; });

  var all = [];
  walletIds.forEach(function (id) {
    var resolved = resolveWalletSheet_(id);
    if (resolved) all = all.concat(readWalletTransactions_(resolved.sheet, resolved.wallet));
  });

  var f = opts.filters || {};
  if (f.type) all = all.filter(function (t) { return t.Type.toLowerCase().indexOf(String(f.type).toLowerCase()) !== -1; });
  if (f.currency) all = all.filter(function (t) { return t.Currency === f.currency; });
  if (f.date) all = all.filter(function (t) { return t.Date === f.date; });
  if (f.description) all = all.filter(function (t) { return (t.Description || "").toLowerCase().indexOf(String(f.description).toLowerCase()) !== -1; });
  if (f.user) all = all.filter(function (t) { return t.User === f.user; });

  all.sort(function (a, b) { return new Date(b.Date) - new Date(a.Date); });

  var page = opts.page || 1, pageSize = opts.pageSize || 15;
  var total = all.length, totalPages = Math.max(1, Math.ceil(total / pageSize));
  var pageItems = all.slice((page - 1) * pageSize, page * pageSize);

  return { status: "SUCCESS", transactions: pageItems, page: page, pageSize: pageSize, total: total, totalPages: totalPages };
}
