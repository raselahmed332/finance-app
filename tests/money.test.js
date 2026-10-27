import test from "node:test";
import assert from "node:assert/strict";
import { parseOpeningBalanceCents } from "../src/utils/money.js";

test("parses zero and valid opening amounts into exact cents", () => {
  assert.equal(parseOpeningBalanceCents(""), 0);
  assert.equal(parseOpeningBalanceCents("0"), 0);
  assert.equal(parseOpeningBalanceCents("125"), 12500);
  assert.equal(parseOpeningBalanceCents("125.5"), 12550);
  assert.equal(parseOpeningBalanceCents("125.50"), 12550);
});

test("rejects negative, non-numeric, excessive-precision and oversized openings", () => {
  for (const value of ["-1", "abc", "1e3", "0x10", "1,000", "1.001", "1000000000"]) {
    assert.equal(parseOpeningBalanceCents(value), null, `expected ${value} to be invalid`);
  }
});
