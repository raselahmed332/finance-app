// ============================================================
// AUDIT LOG RETENTION
// ============================================================
// The audit log is auto-pruned to a rolling window of two CALENDAR months
// (the current month plus the two months before it, cut on the same day-of-month
// — e.g. on 16-Oct the cutoff is 16-Aug). Anything strictly older is deleted.
//
// Deletion is:
//   - scoped to the Audit_Log sheet ONLY (no other sheet is ever touched);
//   - idempotent and safe to retry (it recomputes from the sheet each run);
//   - guarded by a script lock so two runs cannot overlap;
//   - conservative about bad data (a row whose Date cannot be parsed is KEPT,
//     never deleted, because its age is unknown).
//
// The read path (getAuditLog) applies the same cutoff, so the UI never shows a
// record outside the window even before a cleanup has run.

var AUDIT_RETENTION_MONTHS = 2;
var AUDIT_CLEANUP_LOCK_MS = 20000;
var AUDIT_CLEANUP_PROP = "AUDIT_CLEANUP_LAST";

// Epoch ms cutoff: `months` whole calendar months before `now`, with the day
// clamped to the last valid day of the target month so short months never widen
// or narrow the window unexpectedly.
function auditRetentionCutoffMs_(now, months) {
  // Coerce rather than `instanceof Date`: a Date built in another JS realm
  // (the test VM, or a value crossing a boundary) is still a date but would
  // fail an instanceof check against this realm's Date constructor.
  var base = now ? new Date(now) : new Date();
  var n = months === undefined || months === null ? AUDIT_RETENTION_MONTHS : months;
  var target = new Date(
    base.getFullYear(),
    base.getMonth() - n,
    1,
    base.getHours(),
    base.getMinutes(),
    base.getSeconds(),
    base.getMilliseconds()
  );
  var lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(base.getDate(), lastDay));
  return target.getTime();
}

function auditFormatCutoff_(ms) {
  try {
    return Utilities.formatDate(new Date(ms), Session.getScriptTimeZone(), "dd-MMM-yyyy HH:mm");
  } catch (e) {
    return new Date(ms).toISOString();
  }
}

function auditCleanupStatus_() {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty(AUDIT_CLEANUP_PROP);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function auditRecordCleanupStatus_(status) {
  try {
    PropertiesService.getScriptProperties().setProperty(AUDIT_CLEANUP_PROP, JSON.stringify(status));
  } catch (e) {
    /* status is best-effort bookkeeping; never fail the cleanup over it */
  }
}

// Delete every Audit_Log row whose Date is strictly before the cutoff. Rows are
// removed as contiguous runs (bottom-up), which keeps row indexes valid and
// avoids one deleteRows call per row on a large log.
function runAuditCleanup_(opts) {
  opts = opts || {};
  var now = opts.now ? new Date(opts.now) : new Date();
  var cutoffMs = auditRetentionCutoffMs_(now);
  var cutoffStr = auditFormatCutoff_(cutoffMs);

  var lock = LockService.getScriptLock();
  var locked = false;
  if (!lock.tryLock(opts.lockMs || AUDIT_CLEANUP_LOCK_MS)) {
    return {
      status: "SUCCESS", skipped: true, deleted: 0, scanned: 0,
      cutoff: cutoffStr, months: AUDIT_RETENTION_MONTHS,
      message: "আরেকটি ক্লিনআপ চলছে।",
    };
  }
  locked = true;
  try {
    var sheet = getAuditSheet_();
    var lastRow = sheet.getLastRow();
    var scanned = lastRow < 2 ? 0 : lastRow - 1;

    var deleteRuns = [];
    if (scanned > 0) {
      var values = sheet.getRange(2, 1, scanned, 1).getValues();
      var runStart = -1;
      for (var i = 0; i < scanned; i++) {
        var ts = parseServerTimestamp_(values[i][0]);
        var expired = !isNaN(ts) && ts < cutoffMs;
        if (expired) {
          if (runStart === -1) runStart = i;
        } else if (runStart !== -1) {
          // rows 2..: a run of expired rows is [runStart, i-1] in 0-based order.
          deleteRuns.push([runStart + 2, i - runStart]);
          runStart = -1;
        }
      }
      if (runStart !== -1) deleteRuns.push([runStart + 2, scanned - runStart]);
    }

    var deleted = 0;
    // Delete from the bottom up so earlier row positions stay valid.
    for (var r = deleteRuns.length - 1; r >= 0; r--) {
      sheet.deleteRows(deleteRuns[r][0], deleteRuns[r][1]);
      deleted += deleteRuns[r][1];
    }

    var status = {
      runAt: nowStr(),
      cutoff: cutoffStr,
      months: AUDIT_RETENTION_MONTHS,
      scanned: scanned,
      deleted: deleted,
    };
    auditRecordCleanupStatus_(status);

    return {
      status: "SUCCESS", skipped: false, deleted: deleted, scanned: scanned,
      cutoff: cutoffStr, months: AUDIT_RETENTION_MONTHS, lastRun: status,
    };
  } finally {
    if (locked && lock.hasLock && lock.hasLock()) lock.releaseLock();
  }
}

// Trigger entry point (see installAuditCleanupTrigger_). Uses the real clock and
// does not take arguments, because Apps Script time-driven triggers invoke the
// target with none.
function scheduledAuditCleanup() {
  return runAuditCleanup_();
}

// Install a daily time-driven trigger for scheduledAuditCleanup. Idempotent:
// calling it again when the trigger already exists creates nothing. `scriptApp`
// is injectable so the installer can be unit tested without the real host.
function installAuditCleanupTrigger_(scriptApp) {
  var app = scriptApp || ScriptApp;
  var existing = [];
  try {
    existing = app.getProjectTriggers() || [];
  } catch (e) {
    return err_("ট্রিগার তালিকা পড়া যায়নি: " + (e && e.message ? e.message : "unknown"), "TRIGGER_READ_FAILED");
  }
  for (var i = 0; i < existing.length; i++) {
    var fn = typeof existing[i].getHandlerFunction === "function" ? existing[i].getHandlerFunction() : "";
    if (String(fn) === "scheduledAuditCleanup") {
      return { status: "SUCCESS", installed: false, alreadyInstalled: true, months: AUDIT_RETENTION_MONTHS };
    }
  }
  app.newTrigger("scheduledAuditCleanup").timeBased().everyDays(1).atHour(2).create();
  return { status: "SUCCESS", installed: true, months: AUDIT_RETENTION_MONTHS };
}

// Permission-checked manual cleanup, callable through the router as
// "runAuditCleanup" (Admin only).
function runAuditCleanupAction(username) {
  setupDatabase();
  if (!isAdmin(username)) return err_("You do not have permission to perform this action.");
  return runAuditCleanup_({});
}
