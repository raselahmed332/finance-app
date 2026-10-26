// ---------------- AUDIT LOG ----------------

function getAuditLogAction(username, opts) {
  return getAuditLog(username, opts || {});
}

function getAuditLog(username, opts) {
  setupDatabase();
  var permErr = requirePermission_(username, "VIEW_AUDIT_LOG");
  if (permErr) return permErr;

  var sheet = getAuditSheet_();
  var all = [];
  if (sheet.getLastRow() >= 2) {
    var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, AUDIT_HEADERS.length).getValues();
    all = rows.map(function (r) {
      return { Date: r[0], User: r[1], Action: r[2], Target: r[3], Details: r[4] };
    });
  }
  all.reverse();

  // Never expose a record outside the retention window, even before the
  // scheduled cleanup has physically deleted it. A row whose Date cannot be
  // parsed is kept (its age is unknown) — same rule the deleter uses.
  var cutoffMs = auditRetentionCutoffMs_(new Date());
  all = all.filter(function (a) {
    var ts = parseServerTimestamp_(a.Date);
    return isNaN(ts) || ts >= cutoffMs;
  });

  var f = (opts && opts.filters) || {};
  if (f.user) all = all.filter(function (a) { return String(a.User).toLowerCase() === String(f.user).toLowerCase(); });
  if (f.action) all = all.filter(function (a) { return String(a.Action).toLowerCase().indexOf(String(f.action).toLowerCase()) !== -1; });

  var page = (opts && opts.page) || 1, pageSize = (opts && opts.pageSize) || 20;
  var total = all.length, totalPages = Math.max(1, Math.ceil(total / pageSize));
  var pageItems = all.slice((page - 1) * pageSize, page * pageSize);

  return {
    status: "SUCCESS", entries: pageItems, page: page, pageSize: pageSize, total: total, totalPages: totalPages,
    retention: { months: AUDIT_RETENTION_MONTHS, cutoff: auditFormatCutoff_(cutoffMs), lastCleanup: auditCleanupStatus_() },
  };
}

function findBrokenTransferPairs(username) {
  setupDatabase();
  if (!isAdmin(username)) return err_("You do not have permission to perform this action.");

  var broken = [];
  getAllWalletsSafe_().forEach(function (wallet) {
    var sheet = ss_().getSheetByName(wallet.SheetName);
    if (!sheet || sheet.getLastRow() < WALLET_DATA_START_ROW) return;
    var txns = readWalletTransactions_(sheet, wallet);
    txns.forEach(function (t) {
      if (t.Type !== "Transfer Out" && t.Type !== "Transfer In") return;
      var counterpartId = counterpartTxnId_(t.ID);
      if (!counterpartId) {
        broken.push({ WalletID: wallet.WalletID, WalletName: wallet.WalletName, ID: t.ID, Type: t.Type, Issue: "ID has no recognizable pair suffix" });
        return;
      }
      var pair = locateTransferPair_(t.ID, wallet.WalletID, username);
      if (!pair.isTransfer || pair.broken) {
        broken.push({ WalletID: wallet.WalletID, WalletName: wallet.WalletName, ID: t.ID, Type: t.Type, Date: t.Date, Amount: t.Amount, Issue: "Counterpart (" + counterpartId + ") not found" });
      }
    });
  });

  return { status: "SUCCESS", brokenPairs: broken, count: broken.length };
}
