import test from "node:test";
import assert from "node:assert/strict";
import { escapeCsvCell } from "../src/utils/csvExport.js";

test("CSV formula prefixes are neutralized after control and whitespace characters", () => {
  assert.equal(escapeCsvCell("\t=1+1"), "\"'\t=1+1\"");
  assert.equal(escapeCsvCell("\r\n@SUM(1,2)"), "\"'\r\n@SUM(1,2)\"");
  assert.equal(escapeCsvCell("  +SUM(1,2)"), "\"'  +SUM(1,2)\"");
  assert.equal(escapeCsvCell("-1.25"), `"-1.25"`);
});

test("CSV cells remain quoted and embedded quotes are doubled", () => {
  assert.equal(escapeCsvCell('say "hello"'), `"say ""hello"""`);
});
