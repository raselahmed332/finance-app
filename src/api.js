// ============================================================
// PASTE YOUR GOOGLE APPS SCRIPT WEB APP URL HERE
// https://script.google.com/macros/s/AKfycb..................../exec
// ============================================================
const DEFAULT_API_URL = "https://script.google.com/macros/s/AKfycbyGDQ8IKWPCOrgALBEy1HqQEsAKdotz2E0c7RLwaOj5fpggKB8wVjvqT1eKXMP6yUwqsg/exec";

const API_URL = (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_API_URL)
  || localStorage.getItem("hisab_api_url")
  || DEFAULT_API_URL;
const TOKEN_KEY = "hisab_token";

async function callApi(action, params = []) {
  if (!API_URL) {
    throw new Error("Apps Script API URL সেট করা নেই! অনুগ্রহ করে src/api.js ফাইলে আপনার Google Apps Script Web App URL পেস্ট করুন।");
  }
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" }, // avoids CORS preflight
    // The server derives the signed-in user from this short-lived session token.
    // Never send a username as proof of identity.
    body: JSON.stringify({ action, params, token: localStorage.getItem(TOKEN_KEY) || "" }),
  });
  if (!res.ok) throw new Error("Network error: " + res.status);
  return res.json();
}

export const api = {
  // Auth
  login: (username, pin) => callApi("login", [username, pin]),
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

  // Users
  addUser: (fullName, username, pin, role, permissions, walletAccess, adminUsername) =>
    callApi("addUser", [fullName, username, pin, role, permissions, walletAccess, adminUsername]),
  updateUser: (username, fullName, role, adminUsername) => callApi("updateUser", [username, fullName, role, adminUsername]),
  deleteUser: (username, adminUsername) => callApi("deleteUser", [username, adminUsername]),
  setUserStatus: (username, status, adminUsername) => callApi("setUserStatus", [username, status, adminUsername]),
  changeUserRole: (username, newRole, adminUsername) => callApi("changeUserRole", [username, newRole, adminUsername]),
  updateUserPermissions: (username, permissions, adminUsername) => callApi("updateUserPermissions", [username, permissions, adminUsername]),
  updateUserWalletAccess: (username, walletAccess, adminUsername) => callApi("updateUserWalletAccess", [username, walletAccess, adminUsername]),
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
};

export const ALL_PERMISSIONS = [
  "view_dashboard", "view_transactions", "add_income", "add_expense", "add_transfer",
  "edit_transaction", "delete_transaction", "manage_bank",
  "view_wallets", "add_wallet", "edit_wallet", "delete_wallet",
  "view_reports",
  "view_users", "add_user", "edit_user", "delete_user", "change_user_role",
  "manage_user_permissions", "manage_user_wallet_access",
  "create_backup", "restore_backup",
  "manage_settings", "manage_categories", "view_audit_log",
];

export const PERMISSION_LABELS = {
  view_dashboard: "ড্যাশবোর্ড দেখা", view_transactions: "লেনদেন দেখা",
  add_income: "আয় যোগ করা", add_expense: "খরচ যোগ করা", add_transfer: "ট্রান্সফার করা",
  edit_transaction: "লেনদেন এডিট করা", delete_transaction: "লেনদেন ডিলিট করা", manage_bank: "ব্যাংক অপারেশন (Cash ↔ Bank)",
  view_wallets: "Wallet দেখা", add_wallet: "Wallet যোগ করা", edit_wallet: "Wallet এডিট করা",
  delete_wallet: "Wallet ডিলিট করা",
  view_reports: "রিপোর্ট দেখা",
  view_users: "ইউজার দেখা", add_user: "ইউজার যোগ করা", edit_user: "ইউজার এডিট করা",
  delete_user: "ইউজার ডিলিট করা", change_user_role: "ইউজার Role পরিবর্তন",
  manage_user_permissions: "Permission ম্যানেজ করা", manage_user_wallet_access: "Wallet Access ম্যানেজ করা",
  create_backup: "ব্যাকআপ নেওয়া", restore_backup: "ব্যাকআপ রিস্টোর করা",
  manage_settings: "সেটিংস ম্যানেজ করা", manage_categories: "ক্যাটাগরি ম্যানেজ করা", view_audit_log: "Audit Log দেখা",
};
