// ---------------- CURRENCY REGISTRY ----------------
//
// Client-side mirror of the backend Currencies sheet. The backend owns the
// list (see backend/Currencies.gs) and this module caches it in memory after a
// single fetch, so adding a currency is a row an Admin creates rather than a
// redeploy.
//
// formatMoney() here is what replaced the old hardcoded CURRENCY_SYMBOLS map in
// utils/loan.js. Decimals come from the sheet per currency, so KWD renders with
// the precision the row declares instead of silently falling back to 2.
//
// Fallback: until the first fetch resolves (or if it fails), the bundled
// FALLBACK_CURRENCIES below keeps every screen rendering correctly. A wallet
// whose code is unknown to both still formats - it just shows the bare code
// rather than throwing, which is the behaviour the old map had.

import { api } from "../api.js";

const FALLBACK_CURRENCIES = [
  { code: "BDT", symbol: "৳", decimals: 2, loanEnabled: true, status: "Active" },
  { code: "SAR", symbol: "SAR", decimals: 2, loanEnabled: true, status: "Active" },
  { code: "USD", symbol: "$", decimals: 2, loanEnabled: false, status: "Active" },
  { code: "EUR", symbol: "€", decimals: 2, loanEnabled: false, status: "Active" },
  { code: "GBP", symbol: "£", decimals: 2, loanEnabled: false, status: "Active" },
  { code: "AED", symbol: "AED", decimals: 2, loanEnabled: false, status: "Active" },
  { code: "KWD", symbol: "KD", decimals: 2, loanEnabled: false, status: "Active" },
];

let registry = new Map(FALLBACK_CURRENCIES.map((c) => [c.code, c]));
let loaded = false;

const listeners = new Set();

function emit() {
  listeners.forEach((fn) => {
    try { fn(getAllCurrencies()); } catch (e) { /* a bad listener must not break a render */ }
  });
}

export function onCurrenciesChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getCurrency(code) {
  if (!code) return null;
  return registry.get(String(code).toUpperCase()) || null;
}

// Active only - drives every dropdown.
export function getActiveCurrencies() {
  return Array.from(registry.values())
    .filter((c) => c.status === "Active")
    .sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
}

export function getLoanCurrencies() {
  return getActiveCurrencies().filter((c) => c.loanEnabled);
}

export function isLoanCurrency(code) {
  const c = getCurrency(code);
  return !!c && c.status === "Active" && c.loanEnabled;
}

export function getAllCurrencies() {
  return Array.from(registry.values());
}

export function isCurrenciesLoaded() {
  return loaded;
}

// Fetches the authoritative list once per session. Never throws: a failed load
// leaves the bundled fallback in place so the app stays usable.
export async function loadCurrencies(username) {
  try {
    const res = await api.getCurrencies(username);
    if (res && res.status === "SUCCESS" && Array.isArray(res.currencies) && res.currencies.length > 0) {
      const next = new Map();
      res.currencies.forEach((c) => {
        if (!c || !c.code) return;
        next.set(String(c.code).toUpperCase(), {
          code: String(c.code).toUpperCase(),
          symbol: c.symbol || c.code,
          decimals: Number.isInteger(c.decimals) ? c.decimals : 2,
          loanEnabled: !!c.loanEnabled,
          status: c.status || "Active",
        });
      });
      if (next.size > 0) {
        registry = next;
        loaded = true;
        emit();
      }
    }
  } catch (e) {
    // Keep the fallback registry. A currency list is not worth blocking login for.
  }
}

// Called after an Admin adds/edits/deletes a currency so every open screen picks
// the change up without a reload.
export async function refreshCurrencies(username) {
  await loadCurrencies(username);
}

// The single money formatter for the app. Signature is unchanged from the old
// utils/loan.js formatMoney(amount, currency) so all ~40 existing call sites keep
// working; only the symbol/decimals source moved.
export function formatMoney(amount, currency) {
  const n = Number(amount) || 0;
  const meta = getCurrency(currency);
  const decimals = meta && Number.isInteger(meta.decimals) ? meta.decimals : 2;
  const num = n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  // Unknown currency: show the bare code so the amount is still readable.
  const sym = meta ? meta.symbol : currency || "";
  if (!sym) return num;
  // ৳ is conventionally written tight against the digits; lettered codes get a
  // space. This matches the formatting the app used before the registry existed.
  return meta && meta.code === "BDT" ? `${sym}${num}` : `${sym} ${num}`;
}
