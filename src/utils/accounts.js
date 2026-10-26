// ---------------- ACCOUNT REGISTRY ----------------
//
// Client-side mirror of the backend FinancialAccounts sheet, keyed by
// (WalletID, AccountID). The backend owns the list (backend/Accounts.gs); this
// module caches it in memory after the bootstrap fetch (getInitialData) so the
// account dropdowns and the per-account balance cards render without a request
// per wallet.
//
// AccountID is only unique WITHIN a wallet (the legacy "Cash"/"Bank" seeds
// repeat across wallets), so the cache key is the composite "walletId::accountId"
// rather than the bare id.
//
// Until the first fetch resolves the registry is empty; the forms fall back to
// the seeded "Cash"/"Bank" ids, which every wallet is guaranteed to have, so the
// UI behaves exactly as before on first paint.

import { api } from "../api.js";

let registry = new Map();
let loaded = false;

const listeners = new Set();

function key(walletId, accountId) {
  return String(walletId) + "::" + String(accountId);
}

function emit() {
  listeners.forEach((fn) => {
    try { fn(); } catch (e) { /* a bad listener must not break a render */ }
  });
}

export function onAccountsChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function normalizeAccount(a) {
  if (!a) return null;
  const accountId = a.AccountID ?? a.accountId;
  const walletId = a.WalletID ?? a.walletId;
  if (accountId === undefined || walletId === undefined) return null;
  return {
    AccountID: String(accountId),
    WalletID: String(walletId),
    AccountTypeID: a.AccountTypeID || a.accountTypeId || "",
    Name: a.Name || a.name || String(accountId),
    Currency: String(a.Currency || a.currency || "").toUpperCase(),
    OpeningBalance: Number(a.OpeningBalance ?? a.openingBalance ?? 0) || 0,
    Status: a.Status || a.status || "Active",
    AccountTypeName: a.AccountTypeName || "",
    AccountTypeCode: a.AccountTypeCode || "",
    Icon: a.Icon || "",
  };
}

// Replaces the whole registry from a full list (the getInitialData payload).
export function setAccounts(list) {
  registry = new Map();
  (list || []).forEach((raw) => {
    const a = normalizeAccount(raw);
    if (a) registry.set(key(a.WalletID, a.AccountID), a);
  });
  loaded = true;
  emit();
}

// Replaces only one wallet's accounts, leaving every other wallet intact. Used
// after an account CRUD so the forms pick the change up without a full reload.
export function setWalletAccounts(walletId, list) {
  const w = String(walletId);
  Array.from(registry.keys()).forEach((k) => {
    const a = registry.get(k);
    if (a && a.WalletID === w) registry.delete(k);
  });
  (list || []).forEach((raw) => {
    const a = normalizeAccount(raw);
    if (a) registry.set(key(a.WalletID, a.AccountID), a);
  });
  emit();
}

// Drops every cached account (used on logout / user switch) and returns the
// registry to its unloaded state so the seeded Cash/Bank fallback applies again.
export function resetAccounts() {
  registry = new Map();
  loaded = false;
  emit();
}

const SEED_ACCOUNTS = (walletId) => ([
  { AccountID: "Cash", WalletID: walletId, Name: "Cash", Status: "Active", OpeningBalance: 0 },
  { AccountID: "Bank", WalletID: walletId, Name: "Bank", Status: "Active", OpeningBalance: 0 },
]);

// Accounts of one wallet, in stable (creation) order. Falls back to the two
// guaranteed seeds while the registry is still empty so a form is usable before
// the bootstrap fetch resolves.
export function getWalletAccounts(walletId, { activeOnly = true } = {}) {
  const w = String(walletId || "");
  let list = Array.from(registry.values()).filter((a) => a.WalletID === w);
  if (list.length === 0 && !loaded) list = SEED_ACCOUNTS(w);
  if (activeOnly) list = list.filter((a) => a.Status === "Active");
  return list;
}

export function getAccount(walletId, accountId) {
  return registry.get(key(walletId, accountId)) || null;
}

// Display name for an account id, falling back to the raw id so a historical
// row whose account was retired still renders something readable.
export function accountName(walletId, accountId) {
  const a = getAccount(walletId, accountId);
  return a ? a.Name : String(accountId || "");
}

// Fetches the accounts for the given wallets and merges them in. Never throws:
// a failed load leaves whatever is cached in place so the app stays usable.
export async function loadAccounts(username, walletIds) {
  const ids = Array.from(new Set((walletIds || []).map((w) => String(w))));
  if (!ids.length) return;
  try {
    const results = await Promise.all(ids.map((id) => api.getFinancialAccounts(username, id)));
    results.forEach((res, i) => {
      if (res && res.status === "SUCCESS" && Array.isArray(res.accounts)) {
        setWalletAccounts(ids[i], res.accounts);
      }
    });
    loaded = true;
  } catch (e) {
    // Keep the cached registry; an account list is not worth blocking on.
  }
}
