import { sortTransactionsNewestFirst } from "./sortTransactions.js";

const INFLOW_TYPES = new Set([
  "Income",
  "Transfer In",
  "Loan In",
  "Loan Repaid",
  "Savings Withdrawal",
  "Savings Payout",
  "Shop Credit Payment Reversal",
]);

const OUTFLOW_TYPES = new Set([
  "Expense",
  "Transfer Out",
  "Loan Out",
  "Loan Payment",
  "Savings Deposit",
  "Savings Contribution",
  "Savings Payment",
  "Shop Credit Payment",
]);

export function transactionBalanceDelta(transaction) {
  const amount = parseFloat(transaction?.Amount) || 0;
  if (INFLOW_TYPES.has(transaction?.Type)) return amount;
  if (OUTFLOW_TYPES.has(transaction?.Type)) return -amount;
  return null;
}

function accountKey(walletId, accountId) {
  return `${walletId}::${accountId}`;
}

export function calculateBalancesAfterTransactions(transactions, wallets, accounts) {
  const balances = new Map();
  const balancesAfter = new Map();
  const authorizedWallets = new Set((wallets || []).map((wallet) => String(wallet.WalletID)));

  (accounts || []).forEach((account) => {
    const walletId = String(account.WalletID);
    if (!authorizedWallets.has(walletId)) return;
    balances.set(
      accountKey(walletId, String(account.AccountID)),
      Number(account.OpeningBalance) || 0,
    );
  });

  (wallets || []).forEach((wallet) => {
    const walletId = String(wallet.WalletID);
    const walletAccounts = (accounts || []).filter(
      (account) => String(account.WalletID) === walletId,
    );
    if (walletAccounts.length) return;
    balances.set(accountKey(walletId, "Cash"), parseFloat(wallet.OpeningCash) || 0);
    balances.set(accountKey(walletId, "Bank"), parseFloat(wallet.OpeningBank) || 0);
  });

  // Accumulate oldest-to-newest so each row stores the account balance just
  // after its transaction, independent of the active list filters.
  sortTransactionsNewestFirst(transactions).reverse().forEach((transaction) => {
    const walletId = String(transaction?.WalletID ?? "");
    const accountId = String(transaction?.Account ?? "");
    if (!walletId || !accountId || !authorizedWallets.has(walletId)) return;

    const key = accountKey(walletId, accountId);
    const balance = balances.get(key) || 0;
    const delta = transactionBalanceDelta(transaction);
    const balanceAfter = delta === null ? balance : balance + delta;
    balances.set(key, balanceAfter);
    balancesAfter.set(transaction, balanceAfter);
  });

  return balancesAfter;
}
