import test from "node:test";
import assert from "node:assert/strict";

import {
  parseServerTimestamp,
  subtractCalendarMonths,
  auditRetentionCutoff,
  isWithinAuditRetention,
} from "../src/utils/timestamps.js";

test("parseServerTimestamp reads dd-MMM-yyyy HH:mm", () => {
  assert.equal(parseServerTimestamp("16-Oct-2026 14:30"), new Date(2026, 9, 16, 14, 30).getTime());
  assert.equal(parseServerTimestamp("01-Jan-2025 00:00"), new Date(2026 - 1, 0, 1, 0, 0).getTime());
});

test("parseServerTimestamp reads yyyy-MM-dd and Date instances", () => {
  assert.equal(parseServerTimestamp("2026-03-31"), new Date(2026, 2, 31).getTime());
  assert.equal(parseServerTimestamp(new Date(2026, 0, 1)), new Date(2026, 0, 1).getTime());
});

test("parseServerTimestamp rejects junk and empty input", () => {
  assert.ok(Number.isNaN(parseServerTimestamp("")));
  assert.ok(Number.isNaN(parseServerTimestamp(null)));
  assert.equal(parseServerTimestamp("16-Xxx-2026 09:00"), Number.NaN);
});

test("lexicographic ordering is not used (cross-year check)", () => {
  const a = parseServerTimestamp("02-Jan-2027 09:00");
  const b = parseServerTimestamp("31-Dec-2026 23:59");
  assert.ok(a > b);
});

test("subtractCalendarMonths clamps to end of month", () => {
  const jan31 = new Date(2026, 0, 31, 12, 0);
  const nov30 = subtractCalendarMonths(jan31, 2);
  assert.equal(nov30.getFullYear(), 2025);
  assert.equal(nov30.getMonth(), 10);
  assert.equal(nov30.getDate(), 30);
});

test("auditRetentionCutoff is two calendar months back", () => {
  const cutoff = auditRetentionCutoff(new Date(2026, 9, 16, 10, 0));
  assert.equal(cutoff.getFullYear(), 2026);
  assert.equal(cutoff.getMonth(), 7);
  assert.equal(cutoff.getDate(), 16);
});

test("isWithinAuditRetention keeps recent and unparseable records", () => {
  const now = new Date(2026, 9, 16, 10, 0);
  assert.equal(isWithinAuditRetention("16-Oct-2026 09:00", now), true);
  assert.equal(isWithinAuditRetention("", now), true);
  assert.equal(isWithinAuditRetention("not-a-date", now), true);
});

test("isWithinAuditRetention drops records older than the cutoff", () => {
  const now = new Date(2026, 9, 16, 10, 0);
  assert.equal(isWithinAuditRetention("15-Aug-2026 23:59", now), false);
  assert.equal(isWithinAuditRetention("16-Aug-2026 10:00", now), true);
});
