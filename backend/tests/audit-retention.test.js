"use strict";

// Coverage for the two-calendar-month audit-log retention:
//   - only rows strictly older than the cutoff are deleted;
//   - rows with an unparseable date are always kept (unknown age);
//   - deletion is idempotent and scoped to Audit_Log;
//   - the read path never exposes a record outside the window;
//   - the trigger installer does not create duplicate triggers.

const test = require("node:test");
const assert = require("node:assert");
const { loadBackend } = require("./load-backend.js");

// 16-Oct-2026 12:00 → cutoff 16-Aug-2026 12:00.
const NOW = new Date(2026, 9, 16, 12, 0, 0);

function setup(rows, lock) {
  const ctx = loadBackend(lock ? { globals: { LockService: { getScriptLock: () => lock } } } : undefined);
  ctx.setupDatabase();
  ctx.ss_().getSheetByName("Users").appendRow([
    "admin", "Admin", "x", "Admin", "Active", "[]", "[]", "", "", "", "", "", 0,
  ]);
  (rows || []).forEach((r) => ctx.getAuditSheet_().appendRow(r));
  return ctx;
}

function actions(ctx) {
  const sheet = ctx.getAuditSheet_();
  const last = sheet.getLastRow();
  if (last < 2) return [];
  return sheet.getRange(2, 1, last - 1, 5).getValues().map((r) => r[2]);
}

test("cleanup deletes only rows older than two calendar months", () => {
  const ctx = setup([
    ["01-Jul-2026 09:00", "admin", "OLD1", "", ""],
    ["15-Aug-2026 23:59", "admin", "OLD2", "", ""],
    ["16-Aug-2026 11:59", "admin", "OLD3", "", ""],
    ["16-Aug-2026 12:00", "admin", "KEEP1", "", ""],
    ["16-Sep-2026 10:00", "admin", "KEEP2", "", ""],
    ["16-Oct-2026 09:00", "admin", "KEEP3", "", ""],
  ]);
  const res = ctx.runAuditCleanup_({ now: NOW });
  assert.equal(res.status, "SUCCESS");
  assert.equal(res.deleted, 3);
  assert.deepEqual(actions(ctx), ["KEEP1", "KEEP2", "KEEP3"]);
});

test("cleanup keeps rows whose date cannot be parsed", () => {
  const ctx = setup([
    ["01-Jul-2026 09:00", "admin", "OLD", "", ""],
    ["not-a-date", "admin", "BAD", "", ""],
    ["", "admin", "EMPTY", "", ""],
  ]);
  const res = ctx.runAuditCleanup_({ now: NOW });
  assert.equal(res.deleted, 1);
  assert.deepEqual(actions(ctx), ["BAD", "EMPTY"]);
});

test("cleanup is idempotent and reports zero on a second run", () => {
  const ctx = setup([
    ["01-Jul-2026 09:00", "admin", "OLD", "", ""],
    ["16-Oct-2026 09:00", "admin", "NEW", "", ""],
  ]);
  assert.equal(ctx.runAuditCleanup_({ now: NOW }).deleted, 1);
  const second = ctx.runAuditCleanup_({ now: NOW });
  assert.equal(second.deleted, 0);
  assert.deepEqual(actions(ctx), ["NEW"]);
});

test("cleanup returns an error when the script lock times out", () => {
  let releases = 0;
  const ctx = setup(
    [["01-Jul-2026 09:00", "admin", "OLD", "", ""]],
    { tryLock: () => false, releaseLock: () => { releases++; } },
  );
  const result = ctx.runAuditCleanup_({ now: NOW });
  assert.equal(result.status, "ERROR");
  assert.equal(result.code, "AUDIT_CLEANUP_LOCKED");
  assert.deepEqual(actions(ctx), ["OLD"]);
  assert.equal(releases, 0);
});

test("cleanup reports sheet failures and always releases an acquired lock", () => {
  let releases = 0;
  const lock = {
    tryLock: () => true,
    releaseLock: () => { releases++; },
  };
  const ctx = setup([["01-Jul-2026 09:00", "admin", "OLD", "", ""]], lock);
  ctx.getAuditSheet_().deleteRows = () => { throw new Error("sheet write failed"); };

  const result = ctx.runAuditCleanup_({ now: NOW });
  assert.equal(result.status, "ERROR");
  assert.equal(result.code, "AUDIT_CLEANUP_FAILED");
  assert.match(result.message, /sheet write failed/);
  assert.equal(releases, 1);
});

test("manual cleanup acquires only its own lock after Admin authorization", () => {
  let acquisitions = 0;
  let releases = 0;
  const lock = {
    tryLock: () => { acquisitions++; return true; },
    releaseLock: () => { releases++; },
  };
  const ctx = setup([["01-Jul-2026 09:00", "admin", "OLD", "", ""]], lock);
  const result = ctx.runAuditCleanupAction("admin");
  assert.equal(result.status, "SUCCESS");
  assert.equal(result.deleted, 1);
  assert.equal(acquisitions, 1);
  assert.equal(releases, 1);
});

test("cleanup never touches a sheet other than Audit_Log", () => {
  const ctx = setup([
    ["01-Jul-2026 09:00", "admin", "OLD", "", ""],
  ]);
  ctx.ss_().getSheetByName("Wallets").appendRow([
    "W1", "Main", "BDT", "BDT_Main", "Active", "now", "now", 0, 0,
  ]);
  const before = ctx.ss_().getSheetByName("Wallets").getLastRow();
  ctx.runAuditCleanup_({ now: NOW });
  assert.equal(ctx.ss_().getSheetByName("Wallets").getLastRow(), before);
});

test("cleanup handles an empty log without error", () => {
  const ctx = setup([]);
  const res = ctx.runAuditCleanup_({ now: NOW });
  assert.equal(res.status, "SUCCESS");
  assert.equal(res.deleted, 0);
});

test("the retention cutoff is two calendar months and clamps end-of-month", () => {
  const ctx = loadBackend();
  const cutoff = new Date(ctx.auditRetentionCutoffMs_(new Date(2026, 9, 16, 12, 0)));
  assert.equal(cutoff.getFullYear(), 2026);
  assert.equal(cutoff.getMonth(), 7);
  assert.equal(cutoff.getDate(), 16);

  // 31-Mar minus two months clamps to 31-Jan (not 2/3-Mar).
  const clamped = new Date(ctx.auditRetentionCutoffMs_(new Date(2026, 2, 31, 12, 0)));
  assert.equal(clamped.getFullYear(), 2026);
  assert.equal(clamped.getMonth(), 0);
  assert.equal(clamped.getDate(), 31);
});

test("getAuditLog hides records outside the window and reports retention", () => {
  const ctx = setup([
    ["01-Jan-2000 00:00", "admin", "ANCIENT", "", ""],
    ["01-Jan-2100 00:00", "admin", "FUTURE", "", ""],
  ]);
  const res = ctx.getAuditLog("admin", {});
  assert.equal(res.status, "SUCCESS");
  assert.deepEqual(res.entries.map((e) => e.Action), ["FUTURE"]);
  assert.equal(res.retention.months, 2);
  assert.ok(res.retention.cutoff);
});

test("installAuditCleanupTrigger_ does not create duplicate triggers", () => {
  const ctx = loadBackend();
  const triggers = [];
  const fake = {
    getProjectTriggers: () => triggers,
    newTrigger: (fn) => ({
      timeBased: () => ({
        everyDays: () => ({
          atHour: () => ({
            create: () => { triggers.push({ getHandlerFunction: () => fn }); },
          }),
        }),
      }),
    }),
  };

  const first = ctx.installAuditCleanupTrigger_(fake);
  assert.equal(first.installed, true);
  assert.equal(triggers.length, 1);

  const second = ctx.installAuditCleanupTrigger_(fake);
  assert.equal(second.installed, false);
  assert.equal(triggers.length, 1);
});

test("runAuditCleanupAction requires an Admin", () => {
  const ctx = setup([["01-Jul-2026 09:00", "admin", "OLD", "", ""]]);
  const denied = ctx.runAuditCleanupAction("ghost");
  assert.equal(denied.status, "ERROR");
  assert.deepEqual(actions(ctx), ["OLD"], "a denied caller must not delete anything");
});
