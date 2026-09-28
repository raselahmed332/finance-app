// ============================================================
// PASTE YOUR GOOGLE APPS SCRIPT WEB APP URL HERE
// https://script.google.com/macros/s/AKfycb..................../exec
// ============================================================
const DEFAULT_API_URL = "https://script.google.com/macros/s/AKfycbzRueKFcJCUDVrjXSvulYh5wjzJEi0JsbRIADhC_cqZdO4MTxUCmfrtrrfiRAEzDCuh/exec";

const API_URL = (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_API_URL)
  || localStorage.getItem("hisab_api_url")
  || DEFAULT_API_URL;
const TOKEN_KEY = "hisab_token";

// Backend error codes that mean "this browser is no longer authenticated".
// Mirrors AUTH_FAILURE_CODES in backend/Security.gs - keep the two in sync.
export const AUTH_FAILURE_CODES = ["SESSION_EXPIRED", "INVALID_SESSION", "AUTH_REQUIRED"];

// Notified whenever the backend reports the stored token is dead, so the app can
// drop the session and return to the login screen from one place.
const authFailureListeners = new Set();

export function onAuthFailure(listener) {
  authFailureListeners.add(listener);
  return () => authFailureListeners.delete(listener);
}

function notifyAuthFailure(code) {
  localStorage.removeItem(TOKEN_KEY);
  authFailureListeners.forEach((fn) => {
    try { fn(code); } catch (e) { /* a bad listener must not break the request */ }
  });
}

class ApiError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "ApiError";
    this.code = code || null;
  }
}

// The PIN is typed into #pin on the login screen and sent once per login
// attempt. It is never written to localStorage/sessionStorage, never appended
// to a URL and never included in an error message.

// PIN POLICY - mirror of backend/Users.gs normalizePin_(). The server stays
// authoritative (every path re-checks with the same helper); this only stops
// the three screens from accepting something the server will refuse. Keep the
// bounds in step with MIN_PIN_LENGTH / MAX_PIN_LENGTH in Database.gs.
export const MIN_PIN_LENGTH = 4;
export const MAX_PIN_LENGTH = 20;

// Returns the PIN the server would actually store, or null when it would be
// refused. The trim is the important part: the server trims too, so "  1234"
// typed on the Admin reset screen and on the self-service form have to produce
// the same credential.
export function normalizePinInput(pin) {
  if (typeof pin !== "string") return null;
  if (/[\u0000-\u001f\u007f]/.test(pin)) return null;
  const trimmed = pin.trim();
  if (trimmed.length < MIN_PIN_LENGTH || trimmed.length > MAX_PIN_LENGTH) return null;
  return trimmed;
}

async function callApi(action, params = []) {
  if (!API_URL) {
    throw new ApiError("Apps Script API URL সেট করা নেই! অনুগ্রহ করে src/api.js ফাইলে আপনার Google Apps Script Web App URL পেস্ট করুন।");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" }, // avoids CORS preflight
      // The server derives the signed-in user from this short-lived session token.
      // Never send a username as proof of identity.
      signal: controller.signal,
      body: JSON.stringify({ action, params, token: localStorage.getItem(TOKEN_KEY) || "" }),
    });
    if (!res.ok) throw new ApiError("Network error: " + res.status);
    let data;
    try {
      data = await res.json();
    } catch (parseError) {
      // Apps Script occasionally returns HTTP 200 with an HTML body
      // (login redirect / error page); surface a friendly error, not a raw
      // SyntaxError, so login screens don't print "Unexpected token...".
      throw new ApiError("সার্ভার থেকে অজানা প্রতিক্রিয়া পেয়েছি। কিছুক্ষণ পর আবার চেষ্টা করুন।");
    }
    // A dead session must not be left in localStorage, and every caller gets a
    // typed error carrying the code so it can react without string matching.
    if (data && data.status === "ERROR" && AUTH_FAILURE_CODES.includes(data.code)) {
      if (action !== "login") notifyAuthFailure(data.code);
      throw new ApiError(data.message || "সেশন শেষ হয়েছে। আবার লগইন করুন।", data.code);
    }
    return data;
  } catch (err) {
    if (err && err.name === "AbortError") {
      throw new ApiError("সার্ভারে উত্তর দিতে অনেক সময় লাগছে। ইন্টারনেট সংযোগ ঠিক আছে কিনা দেখে আবার চেষ্টা করুন।");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  // Auth
  login: (username, pin) => callApi("login", [username, pin]),
  // Startup handshake: re-checks the stored token against the backend and
  // returns the authoritative user/permission payload.
  validateSession: () => callApi("validateSession", []),
  getInitialData: (username) => callApi("getInitialData", [username]),

  // Transactions
  addTransaction: (data) => callApi("addTransaction", [data]),
  updateTransaction: (data, adminUsername) => callApi("updateTransaction", [data, adminUsername]),
  // walletId is optional but recommended (faster + matches new backend signature)
  deleteTransaction: (id, walletId, adminUsername) => callApi("deleteTransaction", [id, walletId, adminUsername]),
  getTransactions: (username, opts) => callApi("getTransactions", [username, opts]),
  getTransferPair: (id, walletId, username) => callApi("getTransferPair", [id, walletId, username]),

  // Wallets
  getWallets: (username) => callApi("getWallets", [username]),
  getAllWallets: (username) => callApi("getAllWallets", [username]),
  addWallet: (walletName, currency, openingCash, openingBank) => callApi("addWallet", [walletName, currency, openingCash, openingBank]),
  updateWallet: (walletId, newName, newStatus, adminUsername) =>
    callApi("updateWallet", [walletId, newName, newStatus, adminUsername]),
  deleteWallet: (walletId, adminUsername) => callApi("deleteWallet", [walletId, adminUsername]),
  checkWalletHasTransactions: (walletId, username) => callApi("checkWalletHasTransactions", [walletId, username]),

  // Reports
  getReport: (username, walletId, period, periodValue) => callApi("getReport", [username, walletId, period, periodValue]),

  // Loans / Hawlat
  getLoans: (username, type, opts) => callApi("getLoans", [username, type, opts]),
  getLoanDetails: (username, loanId) => callApi("getLoanDetails", [username, loanId]),
  getPersonActiveLoans: (username, identity) => callApi("getPersonActiveLoans", [username, identity]),
  addLoan: (data) => callApi("addLoan", [data]),
  updateLoan: (data, adminUsername) => callApi("updateLoan", [data, adminUsername]),
  deleteLoan: (loanId, adminUsername) => callApi("deleteLoan", [loanId, adminUsername]),
  addLoanRepayment: (data) => callApi("addLoanRepayment", [data]),
  // Both require MANAGE_LOAN_TRANSACTIONS on the server. The repayment wallet is
  // locked to the wallet it was recorded in, so only amount/date/account may change.
  updateLoanRepayment: (data, adminUsername) => callApi("updateLoanPayment", [data, adminUsername]),
  deleteLoanRepayment: (paymentId, adminUsername) => callApi("deleteLoanPayment", [paymentId, adminUsername]),
  addLoanAddition: (data) => callApi("addLoanAddition", [data]),
  editLoanAddition: (data, adminUsername) => callApi("editLoanAddition", [data, adminUsername]),
  deleteLoanAddition: (additionId, adminUsername) => callApi("deleteLoanAddition", [additionId, adminUsername]),

  // Currencies
  getCurrencies: (username) => callApi("getCurrencies", [username]),
  addCurrency: (data, adminUsername) => callApi("addCurrency", [data, adminUsername]),
  updateCurrency: (code, data, adminUsername) => callApi("updateCurrency", [code, data, adminUsername]),
  deleteCurrency: (code, adminUsername) => callApi("deleteCurrency", [code, adminUsername]),

  // Users
  addUser: (fullName, username, pin, role, permissions, walletAccess, adminUsername) =>
    callApi("addUser", [fullName, username, pin, role, permissions, walletAccess, adminUsername]),
  updateUser: (username, fullName, role, adminUsername) => callApi("updateUser", [username, fullName, role, adminUsername]),
  deleteUser: (username, adminUsername) => callApi("deleteUser", [username, adminUsername]),
  setUserStatus: (username, status, adminUsername) => callApi("setUserStatus", [username, status, adminUsername]),
  changeUserRole: (username, newRole, adminUsername) => callApi("changeUserRole", [username, newRole, adminUsername]),
  updateUserPermissions: (username, permissions, adminUsername) => callApi("updateUserPermissions", [username, permissions, adminUsername]),
  updateUserWalletAccess: (username, walletAccess, adminUsername) => callApi("updateUserWalletAccess", [username, walletAccess, adminUsername]),
  resetPin: (username, newPin, adminUsername) => callApi("resetPin", [username, newPin, adminUsername]),
  updateUserProfile: (data) => callApi("updateUserProfile", [data]),

  // Backup
  importBackup: (backup, adminUsername) => callApi("importBackup", [backup, adminUsername]),
  getBackupData: (username) => callApi("getBackupData", [username]),
  logout: () => callApi("logout", []),

  // Categories
  getCategories: (username) => callApi("getCategories", [username]),
  addCategory: (name, type, adminUsername) => callApi("addCategory", [name, type, adminUsername]),
  deleteCategory: (categoryId, adminUsername) => callApi("deleteCategory", [categoryId, adminUsername]),

  // Audit log
  getAuditLog: (username, opts) => callApi("getAuditLog", [username, opts]),
  findBrokenTransferPairs: (username) => callApi("findBrokenTransferPairs", [username]),
};

export const session = {
  save: (token) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
  exists: () => !!localStorage.getItem(TOKEN_KEY),
  get: () => localStorage.getItem(TOKEN_KEY),
};

// Actions automatically granted to any user who has access to at least one
// wallet. Never shown as grantable checkboxes.
export const DEFAULT_WALLET_ACTIONS = [
  "VIEW_DASHBOARD", "ADD_EXPENSE", "BANK_OPERATIONS",
  "VIEW_TRANSACTIONS", "VIEW_REPORTS", "VIEW_LOANS",
  "LOAN_GIVE", "LOAN_TAKE", "LOAN_PAYMENT",
];

// Actions an Admin may additionally grant to a Sub-Admin/User.
export const ADDITIONAL_PERMISSIONS = [
  "ADD_INCOME", "TRANSFER_MONEY", "MANAGE_TRANSACTIONS",
  "ADD_WALLET", "EDIT_WALLET", "MANAGE_WALLET_STATUS",
  "MANAGE_LOANS", "MANAGE_LOAN_TRANSACTIONS",
  "ADD_USER", "EDIT_USER", "DELETE_USER", "MANAGE_USER_PERMISSIONS",
  "BACKUP_RESTORE", "VIEW_AUDIT_LOG", "MANAGE_CATEGORIES",
];

// Reserved for the Admin role — never grantable to non-Admins.
// MANAGE_CURRENCIES is here, not in ADDITIONAL_PERMISSIONS: a currency row
// decides what an entire wallet can hold, so it stays Admin-only. Mirrors
// ADMIN_ONLY_ACTIONS in backend/Database.gs.
export const ADMIN_ONLY_ACTIONS = [
  "CHANGE_USER_ROLE", "CHANGE_USER_PASSWORD", "CREATE_ADMIN", "MANAGE_CURRENCIES",
];

export const GRANTABLE_PERMISSIONS = ADDITIONAL_PERMISSIONS;

export const ALL_PERMISSIONS = [
  ...DEFAULT_WALLET_ACTIONS,
  ...ADDITIONAL_PERMISSIONS,
  ...ADMIN_ONLY_ACTIONS,
];

export const PERMISSION_LABELS = {
  // Defaults (auto via wallet access)
  VIEW_DASHBOARD: "ড্যাশবোর্ড দেখা",
  ADD_EXPENSE: "খরচ যোগ করা",
  BANK_OPERATIONS: "ব্যাংক অপারেশন (Cash ↔ Bank)",
  VIEW_TRANSACTIONS: "লেনদেন দেখা",
  VIEW_REPORTS: "রিপোর্ট দেখা",
  VIEW_LOANS: "হাওলাত দেখা",
  LOAN_GIVE: "হাওলাত দেয়া",
  LOAN_TAKE: "হাওলাত নেয়া",
  LOAN_PAYMENT: "হাওলাতের ফেরত",
  // Grantable (additional)
  ADD_INCOME: "আয় যোগ করা",
  TRANSFER_MONEY: "ট্রান্সফার করা",
  MANAGE_TRANSACTIONS: "লেনদেন এডিট/ডিলিট করা",
  ADD_WALLET: "Wallet যোগ করা",
  EDIT_WALLET: "Wallet এডিট করা",
  MANAGE_WALLET_STATUS: "Wallet ডিলিট/ডিঅ্যাকটিভেট করা",
  MANAGE_LOANS: "হাওলাত এডিট/ডিলিট করা",
  MANAGE_LOAN_TRANSACTIONS: "হাওলাতের ফেরত এডিট/ডিলিট করা",
  ADD_USER: "ইউজার যোগ করা",
  EDIT_USER: "ইউজার এডিট করা",
  DELETE_USER: "ইউজার ডিলিট করা",
  MANAGE_USER_PERMISSIONS: "Permission ও Wallet Access ম্যানেজ করা",
  BACKUP_RESTORE: "ব্যাকআপ / রিস্টোর করা",
  VIEW_AUDIT_LOG: "Audit Log দেখা",
  MANAGE_CATEGORIES: "ক্যাটাগরি ম্যানেজ করা",
  MANAGE_CURRENCIES: "কারেন্সি ম্যানেজ করা",
  // Admin-only
  CHANGE_USER_ROLE: "ইউজার Role পরিবর্তন",
  CHANGE_USER_PASSWORD: "ইউজার PIN রিসেট",
  CREATE_ADMIN: "Admin তৈরি করা",
};
