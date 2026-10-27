// ============================================================
// মাই হিসাব — BACKEND ROUTER
// ============================================================
// All business logic is split across:
//   Auth.gs, Database.gs, Cache.gs, Wallets.gs, Users.gs,
//   Transactions.gs, Reports.gs, Audit.gs, Backup.gs
// This file contains ONLY the doPost/doGet router, the ALLOWED_ACTIONS
// mapping, and bindCallerToParams_ (the parameter-injection layer that
// enforces server-side identity — the browser-supplied username is
// never trusted).
// ============================================================

var ALLOWED_ACTIONS = {
  login: loginUserAction,
  logout: revokeSession_,
  // Startup handshake: re-checks the stored token and returns the
  // authoritative user/permission payload from the backend.
  validateSession: validateSession,
  getInitialData: getInitialData,

  addTransaction: addTransaction,
  updateTransaction: updateTransaction,
  deleteTransaction: deleteTransaction,
  getTransactions: getTransactionsAction,
  getTransferPair: getTransferPair,

  getWallets: getWalletsAction,
  getAllWallets: getAllWalletsAction,
  addWallet: addWallet,
  updateWallet: updateWallet,
  deleteWallet: deleteWallet,
  checkWalletHasTransactions: checkWalletHasTransactions,

  getReport: getReport,

  getCategories: getCategories,
  addCategory: addCategory,
  updateCategory: updateCategory,
  deleteCategory: deleteCategory,

  getCurrencies: getCurrencies,
  addCurrency: addCurrency,
  updateCurrency: updateCurrency,
  deleteCurrency: deleteCurrency,

  getAccountTypes: getAccountTypes,
  addAccountType: addAccountType,
  updateAccountType: updateAccountType,
  deleteAccountType: deleteAccountType,
  getFinancialAccounts: getFinancialAccounts,
  addFinancialAccount: addFinancialAccount,
  updateFinancialAccount: updateFinancialAccount,
  deleteFinancialAccount: deleteFinancialAccount,

  getAuditLog: getAuditLogAction,
  // runAuditCleanupAction manages its own shared script lock.
  runAuditCleanup: runAuditCleanupAction,
  findBrokenTransferPairs: findBrokenTransferPairs,

  addUser: addUser,
  updateUser: updateUser,
  deleteUser: deleteUser,
  setUserStatus: setUserStatus,
  changeUserRole: changeUserRole,
  updateUserPermissions: updateUserPermissions,
  updateUserWalletAccess: updateUserWalletAccess,
  updateUserProfile: updateUserProfile,
  resetPin: resetPin,

  importBackup: importBackup,
  getBackupData: getBackupData,

  getLoans: getLoans,
  getLoanDetails: getLoanDetails,
  getPersonActiveLoans: getPersonActiveLoans,
  createLoan: createLoan,
  addLoan: addLoan,
  updateLoan: updateLoan,
  deleteLoan: deleteLoan,
  addLoanPayment: addLoanPayment,
  addLoanRepayment: addLoanRepayment,
  updateLoanPayment: updateLoanPayment,
  deleteLoanPayment: deleteLoanPayment,
  addLoanAddition: addLoanAddition,
  editLoanAddition: editLoanAddition,
  deleteLoanAddition: deleteLoanAddition,

  // Savings
  getSavingsPlans: getSavingsPlans,
  getSavingsPlanDetails: getSavingsPlanDetails,
  createSavingsPlan: createSavingsPlan,
  updateSavingsPlan: updateSavingsPlan,
  deleteSavingsPlan: deleteSavingsPlan,
  addSavingsGroupMember: addSavingsGroupMember,
  updateSavingsGroupMember: updateSavingsGroupMember,
  removeSavingsGroupMember: removeSavingsGroupMember,
  setSavingsGroupRecipientOrder: setSavingsGroupRecipientOrder,
  recordSavingsGroupContribution: recordSavingsGroupContribution,
  recordSavingsGroupPayout: recordSavingsGroupPayout,
  generateSavingsFixedInstallments: generateSavingsFixedInstallments,
  addSavingsFixedPayment: addSavingsFixedPayment,
  closeSavingsFixedPlan: closeSavingsFixedPlan,
  addSavingsFlexDeposit: addSavingsFlexDeposit,
  addSavingsFlexWithdrawal: addSavingsFlexWithdrawal,
  closeSavingsFlexPlan: closeSavingsFlexPlan,
  deleteSavingsFlexTransaction: deleteSavingsFlexTransaction,

  getShopLedgers: getShopLedgers,
  getShopLedgerDetails: getShopLedgerDetails,
  getShopLedgerReport: getShopLedgerReport,
  createShopLedger: createShopLedger,
  updateShopLedger: updateShopLedger,
  setShopLedgerStatus: setShopLedgerStatus,
  addShopMarket: addShopMarket,
  updateShopMarket: updateShopMarket,
  deleteShopMarket: deleteShopMarket,
  addShopPayment: addShopPayment,
  updateShopPayment: updateShopPayment,
  deleteShopPayment: deleteShopPayment,
};

function loginUserAction(username, pin) {
  return loginUser(username, pin);
}
function getTransactionsAction(username, opts) {
  return getTransactions(username, opts || {});
}
function getWalletsAction(username) {
  return { status: "SUCCESS", wallets: getWallets(username) };
}
function getAllWalletsAction(username) {
  return getAllWallets(username);
}

var MUTATING_ACTIONS = {
  addTransaction: true, updateTransaction: true, deleteTransaction: true,
  addWallet: true, updateWallet: true, deleteWallet: true,
  addUser: true, updateUser: true, deleteUser: true, setUserStatus: true,
  changeUserRole: true, updateUserPermissions: true, updateUserWalletAccess: true,
  updateUserProfile: true, resetPin: true,
  importBackup: true,
  createLoan: true, addLoan: true, updateLoan: true, deleteLoan: true,
  addLoanPayment: true, addLoanRepayment: true, updateLoanPayment: true, deleteLoanPayment: true,
  addLoanAddition: true, editLoanAddition: true, deleteLoanAddition: true,
  addCategory: true, updateCategory: true, deleteCategory: true,
  addCurrency: true, updateCurrency: true, deleteCurrency: true,
  addAccountType: true, updateAccountType: true, deleteAccountType: true,
  addFinancialAccount: true, updateFinancialAccount: true, deleteFinancialAccount: true,
  createSavingsPlan: true, updateSavingsPlan: true, deleteSavingsPlan: true,
  addSavingsGroupMember: true, updateSavingsGroupMember: true, removeSavingsGroupMember: true,
  setSavingsGroupRecipientOrder: true, recordSavingsGroupContribution: true, recordSavingsGroupPayout: true,
  generateSavingsFixedInstallments: true, addSavingsFixedPayment: true, closeSavingsFixedPlan: true,
  addSavingsFlexDeposit: true, addSavingsFlexWithdrawal: true, closeSavingsFlexPlan: true, deleteSavingsFlexTransaction: true,
  createShopLedger: true, updateShopLedger: true, setShopLedgerStatus: true,
  addShopMarket: true, updateShopMarket: true, deleteShopMarket: true,
  addShopPayment: true, updateShopPayment: true, deleteShopPayment: true,
};

function doPost(e) {
  var result;
  var lock = null;

  // 1) Shape/type/size validation of the raw request. Nothing below runs for a
  //    body that is absent, is not JSON, is not an object, names no/ an
  //    unknown/ a prototype-polluting action, or whose params are malformed.
  var parsed = parseAndValidateRequest_(e);
  if (parsed.error) {
    return jsonOutput_(parsed.error);
  }
  var action = parsed.action;
  var params = parsed.params;
  var fn = ALLOWED_ACTIONS[action];

  try {
    if (action === "login") {
      result = fn.apply(null, params);
    } else if (action === "logout" || action === "validateSession") {
      // These two are driven by the token itself, not by params. The token
      // format was already validated in parseAndValidateRequest_.
      //
      // logout is intentionally idempotent: signing out with an already-dead
      // session must still succeed rather than strand the client. validateSession
      // must NOT be — that is the startup handshake whose whole job is to report
      // a dead session, so it validates the session itself and returns the
      // matching SESSION_EXPIRED / INVALID_SESSION / AUTH_REQUIRED code.
      result = fn.call(null, parsed.body.token);
    } else {
      // 2) Server-side identity. The browser-supplied username is NEVER
      //    trusted; the only credential read from the request is the token,
      //    and it is checked against the live user record + session version.
      var session = resolveSession_(parsed.body.token);
      if (!session.ok) {
        return jsonOutput_(errCode_(session.code, session.message));
      }
      var caller = session.username;

      params = bindCallerToParams_(action, params, caller);
      if (MUTATING_ACTIONS[action]) {
        lock = LockService.getScriptLock();
        if (!lock.tryLock(30000)) {
          return jsonOutput_(errCode_(ERR.INVALID_REQUEST, "Please try again."));
        }
      }
      result = fn.apply(null, params);
    }
  } catch (err) {
    // Never log the request body or any argument: login params carry the PIN.
    // err.message is the only thing written, and Apps Script service errors
    // never echo request arguments.
    console.error("doPost error [" + action + "]: " + (err && err.message ? err.message : "unknown"));
    result = errCode_(ERR.INVALID_REQUEST, "একটি ত্রুটি ঘটেছে। আবার চেষ্টা করুন।");
  } finally {
    if (lock && lock.hasLock()) lock.releaseLock();
  }
  return jsonOutput_(result);
}

function jsonOutput_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

function bindCallerToParams_(action, params, caller) {
  var p = params.slice();
  if (action === "getInitialData" || action === "getWallets" || action === "getAllWallets" ||
      action === "getTransactions" || action === "getBackupData") p[0] = caller;
  else if (action === "getReport") p[0] = caller;
  else if (action === "getCategories") p[0] = caller;
  else if (action === "addCategory") p[2] = caller;
  else if (action === "updateCategory") p[2] = caller;
  else if (action === "deleteCategory") p[1] = caller;
  else if (action === "getAuditLog") p[0] = caller;
  else if (action === "runAuditCleanup") p[0] = caller;
  else if (action === "findBrokenTransferPairs") p[0] = caller;
  else if (action === "getTransferPair") p[2] = caller;
  else if (action === "addTransaction") { p[0] = p[0] || {}; p[0].user = caller; }
  else if (action === "updateTransaction") p[1] = caller;
  else if (action === "deleteTransaction") p[2] = caller;
  else if (action === "addWallet") p[4] = caller;
  else if (action === "updateWallet") p[3] = caller;
  else if (action === "deleteWallet") p[1] = caller;
  else if (action === "checkWalletHasTransactions") p[1] = caller;
  else if (action === "addUser") p[6] = caller;
  else if (action === "updateUser") p[3] = caller;
  else if (action === "changeUserRole") p[2] = caller;
  else if (action === "deleteUser") p[1] = caller;
  else if (action === "setUserStatus" || action === "updateUserPermissions" || action === "updateUserWalletAccess") p[2] = caller;
  else if (action === "updateUserProfile") { p[0] = p[0] || {}; p[0].username = caller; }
  else if (action === "importBackup") p[1] = caller;
  else if (action === "resetPin") p[2] = caller;
  else if (action === "getLoans" || action === "getLoanDetails" || action === "getPersonActiveLoans") p[0] = caller;
  else if (action === "createLoan" || action === "addLoan" || action === "addLoanPayment" || action === "addLoanRepayment") { p[0] = p[0] || {}; p[0].user = caller; }
  else if (action === "updateLoan" || action === "updateLoanPayment" || action === "deleteLoan" || action === "deleteLoanPayment") p[1] = caller;
  else if (action === "addLoanAddition") { p[0] = p[0] || {}; p[0].user = caller; }
  else if (action === "editLoanAddition" || action === "deleteLoanAddition") p[1] = caller;
  else if (action === "getCurrencies") p[0] = caller;
  else if (action === "addCurrency") p[1] = caller;
  else if (action === "updateCurrency") p[2] = caller;
  else if (action === "deleteCurrency") p[1] = caller;
  else if (action === "getAccountTypes" || action === "getFinancialAccounts") p[0] = caller;
  else if (action === "addAccountType" || action === "addFinancialAccount") p[1] = caller;
  else if (action === "updateAccountType" || action === "updateFinancialAccount" ||
      action === "deleteFinancialAccount") p[2] = caller;
  else if (action === "deleteAccountType") p[1] = caller;
  else if (action === "getSavingsPlans") p[0] = caller;
  else if (action === "getSavingsPlanDetails" || action === "deleteSavingsPlan" ||
      action === "removeSavingsGroupMember") p[1] = caller;
  else if (action === "updateSavingsPlan" || action === "updateSavingsGroupMember") { p[0] = p[0] || {}; p[0].user = caller; p[1] = caller; }
  else if (action === "deleteSavingsFlexTransaction") p[2] = caller;
  else if (action === "createSavingsPlan" || action === "addSavingsGroupMember" ||
      action === "setSavingsGroupRecipientOrder" || action === "recordSavingsGroupContribution" ||
      action === "recordSavingsGroupPayout" || action === "generateSavingsFixedInstallments" ||
      action === "addSavingsFixedPayment" || action === "closeSavingsFixedPlan" ||
      action === "addSavingsFlexDeposit" || action === "addSavingsFlexWithdrawal" ||
      action === "closeSavingsFlexPlan") {
    p[0] = p[0] || {}; p[0].user = caller;
  }
  else if (action === "getShopLedgers") p[0] = caller;
  else if (action === "getShopLedgerDetails") p[1] = caller;
  else if (action === "getShopLedgerReport") p[2] = caller;
  else if (action === "createShopLedger") p[1] = caller;
  else if (action === "updateShopLedger" || action === "setShopLedgerStatus" ||
      action === "addShopMarket" || action === "updateShopMarket" ||
      action === "deleteShopMarket" || action === "addShopPayment" ||
      action === "updateShopPayment" || action === "deleteShopPayment") p[2] = caller;
  return p;
}

function doGet() {
  return ContentService.createTextOutput(
    JSON.stringify({ status: "OK", message: "মাই হিসাব API is running." }),
  ).setMimeType(ContentService.MimeType.JSON);
}
