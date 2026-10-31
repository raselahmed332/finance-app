import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateBalancesAfterTransactions,
  transactionBalanceDelta,
} from "../src/utils/transactionBalance.js";

test("calculates each transaction balance from opening balances in ledger order", () => {
  const oldestExpense = {
    ID: "1",
    WalletID: "wallet-1",
    Account: "Cash",
    Type: "Expense",
    Amount: "20",
    Date: "2026-01-01",
  };
  const laterIncome = {
    ID: "2",
    WalletID: "wallet-1",
    Account: "Cash",
    Type: "Income",
    Amount: "50",
    Date: "2026-01-02",
  };
  const otherAccountIncome = {
    ID: "3",
    WalletID: "wallet-1",
    Account: "Bank",
    Type: "Transfer In",
    Amount: "15",
    Date: "2026-01-03",
  };

  const balances = calculateBalancesAfterTransactions(
    [otherAccountIncome, laterIncome, oldestExpense],
    [{ WalletID: "wallet-1", OpeningCash: 100, OpeningBank: 40 }],
    [
      { WalletID: "wallet-1", AccountID: "Cash", OpeningBalance: 100 },
      { WalletID: "wallet-1", AccountID: "Bank", OpeningBalance: 40 },
    ],
  );

  assert.equal(balances.get(oldestExpense), 80);
  assert.equal(balances.get(laterIncome), 130);
  assert.equal(balances.get(otherAccountIncome), 55);
});

test("uses timestamp order for transactions on the same date", () => {
  const first = {
    ID: "1",
    WalletID: "wallet-1",
    Account: "Cash",
    Type: "Income",
    Amount: 25,
    Date: "2026-01-01",
    Timestamp: "2026-01-01T08:00:00.000Z",
  };
  const second = {
    ID: "2",
    WalletID: "wallet-1",
    Account: "Cash",
    Type: "Expense",
    Amount: 5,
    Date: "2026-01-01",
    Timestamp: "2026-01-01T09:00:00.000Z",
  };

  const balances = calculateBalancesAfterTransactions(
    [second, first],
    [{ WalletID: "wallet-1", OpeningCash: 100 }],
    [],
  );

  assert.equal(balances.get(first), 125);
  assert.equal(balances.get(second), 120);
});

test("leaves unknown transaction types unchanged and skips rows without an account", () => {
  const unknown = {
    ID: "1",
    WalletID: "wallet-1",
    Account: "Cash",
    Type: "Unknown",
    Amount: 99,
    Date: "2026-01-01",
  };
  const noAccount = {
    ID: "2",
    WalletID: "wallet-1",
    Type: "Expense",
    Amount: 12,
    Date: "2026-01-02",
  };
  const balances = calculateBalancesAfterTransactions(
    [unknown, noAccount],
    [{ WalletID: "wallet-1", OpeningCash: 100 }],
    [],
  );

  assert.equal(balances.get(unknown), 100);
  assert.equal(balances.has(noAccount), false);
});

test("shop credit payments move accounts out and their reversals move them back", () => {
  assert.equal(
    transactionBalanceDelta({ Type: "Shop Credit Payment", Amount: "15.00" }),
    -15,
  );
  assert.equal(
    transactionBalanceDelta({ Type: "Shop Credit Payment Reversal", Amount: "15.00" }),
    15,
  );
  assert.equal(Math.abs(transactionBalanceDelta({ Type: "Shop Credit Payment", Amount: 0 })), 0);
});
