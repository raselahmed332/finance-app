// ---------------- USER / PERMISSION HELPERS ----------------

// ---------------- PIN POLICY (one rule, every path) ----------------
//
// Three entry points can set a credential: addUser (an Admin creates an
// account), resetPin (an Admin resets one) and updateUserProfile (the owner
// changes their own). They all run the same three checks, in the same order,
// through normalizePin_():
//
//   1. the value must already be a STRING. It used to be run through
//      String() first, which quietly turned pin:true into the four-character
//      PIN "true" and pin:{} into "[object Object]" on the self-service path,
//   2. it must not contain control characters (a newline in a credential is a
//      hazard for any later CSV/row export),
//   3. once trimmed, it must be MIN_PIN_LENGTH..MAX_PIN_LENGTH characters.
//
// Whitespace is TRIMMED rather than rejected, because the three screens trim
// differently (the Admin reset prompt trims, the self-service form did not).
// Trimming inside the shared helper is what makes one typed PIN behave
// identically no matter which screen set it; the value that gets hashed is
// the trimmed one, so a login can never be typed two ways.
var PIN_CONTROL_CHARS_RE = /[\u0000-\u001f\u007f]/;

function normalizePin_(pin) {
  if (typeof pin !== "string") return null;
  if (PIN_CONTROL_CHARS_RE.test(pin)) return null;
  var trimmed = pin.replace(/^\s+|\s+$/g, "");
  if (trimmed.length < MIN_PIN_LENGTH || trimmed.length > MAX_PIN_LENGTH) return null;
  return trimmed;
}

function isValidPin_(pin) { return normalizePin_(pin) !== null; }

function pinError_() {
  return "PIN " + MIN_PIN_LENGTH + "-" + MAX_PIN_LENGTH +
    " অক্ষরের হতে হবে (আগে-পিছনের ফাঁকা জায়গা বাদ যাবে)।";
}

function safeJsonParse_(str, fallback) {
  try {
    var v = JSON.parse(str);
    return Array.isArray(v) ? v : fallback;
  } catch (e) { return fallback; }
}

function userFromRow_(row, rowIndex) {
  return {
    _row: rowIndex,
    Username: row[0], FullName: row[1] || row[0], PIN: row[2], Role: row[3], Status: row[4],
    Permissions: safeJsonParse_(row[5], []), WalletAccess: safeJsonParse_(row[6], []),
    ProfilePic: row[7] || "", DefaultCurrency: row[8] || "", DefaultAccount: row[9] || "",
    CreatedAt: row[10], UpdatedAt: row[11],
    SessionVersion: Number(row[12] || 0) || 0,
  };
}

// Row lookup used by the security helpers (session version bump) so a write
// never has to depend on a caller happening to already hold the user record.
function findUserRowIndex_(username) {
  var key = String(username || "").toLowerCase();
  var sheet = getUsersSheet_();
  if (sheet.getLastRow() < 2) return -1;
  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][0]).toLowerCase() === key) return i + 2;
  }
  return -1;
}

function getUserRecord_(username) {
  var key = String(username || "").toLowerCase();
  var cached = cacheGet_("user", key);
  if (cached !== undefined) return cached;

  var sheet = getUsersSheet_();
  if (sheet.getLastRow() < 2) return null;
  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, USER_HEADERS.length).getValues();
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][0]).toLowerCase() === key) {
      var user = userFromRow_(data[i], i + 2);
      cachePut_("user", key, user);
      return user;
    }
  }
  return null;
}

function getAllUsers_() {
  var sheet = getUsersSheet_();
  if (sheet.getLastRow() < 2) return [];
  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, USER_HEADERS.length).getValues();
  var out = [];
  for (var i = 0; i < data.length; i++) out.push(userFromRow_(data[i], i + 2));
  return out;
}

function isAdminRecord_(user) {
  return !!user && String(user.Role) === "Admin" && String(user.Status).toLowerCase() === "active";
}

function normalizeAction_(action) {
  var key = String(action || "");
  if (ALL_PERMISSIONS.indexOf(key) !== -1) return key;
  if (LEGACY_TO_NEW.hasOwnProperty(key)) return LEGACY_TO_NEW[key];
  return null;
}

function normalizeActions_(actions) {
  if (!Array.isArray(actions)) return [];
  var out = [];
  actions.forEach(function (a) {
    var n = normalizeAction_(a);
    if (n && out.indexOf(n) === -1) out.push(n);
  });
  return out;
}

// Only admin-grantable permissions may be persisted on a non-Admin user.
function sanitizeGrantableActions_(actions) {
  return normalizeActions_(actions).filter(function (p) {
    return GRANTABLE_PERMISSIONS.indexOf(p) !== -1;
  });
}

// Effective permissions:
//   Admin                  -> everything
//   non-Admin, no wallets  -> NOTHING usable (even stored perms are inert)
//   non-Admin with wallets -> default wallet actions + stored grantables
function getEffectivePermissions_(user) {
  if (!user) return [];
  if (isAdminRecord_(user)) return ALL_PERMISSIONS.slice();
  if (!(user.WalletAccess || []).length) return [];
  var effective = DEFAULT_WALLET_ACTIONS.slice();
  normalizeActions_(user.Permissions || []).forEach(function (p) {
    if (ADDITIONAL_PERMISSIONS.indexOf(p) !== -1 && effective.indexOf(p) === -1) effective.push(p);
  });
  return effective;
}

function getUserPermissions_(user) {
  return getEffectivePermissions_(user);
}

function getUserWalletAccess_(user) {
  if (!user) return [];
  if (isAdminRecord_(user)) return getAllWalletIds_();
  return (user.WalletAccess || []).map(String);
}

function hasPermission_(username, action) {
  var user = getUserRecord_(username);
  if (!user || String(user.Status).toLowerCase() !== "active") return false;
  return getEffectivePermissions_(user).indexOf(action) !== -1;
}

function hasWalletAccess_(username, walletId) {
  var user = getUserRecord_(username);
  if (!user || String(user.Status).toLowerCase() !== "active") return false;
  return getUserWalletAccess_(user).indexOf(String(walletId)) !== -1;
}

function isAdmin(username) {
  return isAdminRecord_(getUserRecord_(username));
}

function requirePermission_(username, perm) {
  if (!hasPermission_(username, perm)) return permissionDenied_();
  return null;
}

function requireWalletAccess_(username, walletId) {
  if (!hasWalletAccess_(username, walletId)) return walletAccessDenied_();
  return null;
}

function hasAnyUserMgmtPermission_(username) {
  return ["ADD_USER", "EDIT_USER", "DELETE_USER", "MANAGE_USER_PERMISSIONS"].some(function (p) {
    return hasPermission_(username, p);
  });
}

// Central authorization, and the ONLY order the app uses:
//
//     Wallet Access  ->  Permission  ->  Action
//
// A caller with no wallet access is denied before their permission list is even
// consulted (so a permission can never grant access to a wallet), and a wallet
// the caller cannot reach is denied before the action-specific permission is
// checked. Admin short-circuits to "allow" with full system access.
// Returns null when allowed, otherwise a structured error.
function authorize_(username, action, walletIds) {
  var user = getUserRecord_(username);
  if (!user || String(user.Status).toLowerCase() !== "active") {
    return errCode_(ERR.INVALID_SESSION, "Unauthorized.");
  }
  if (isAdminRecord_(user)) return null;
  if (!(user.WalletAccess || []).length) {
    return walletAccessDenied_("You do not have access to any wallet.");
  }
  var accessible = getUserWalletAccess_(user);
  var ids = Array.isArray(walletIds) ? walletIds : (walletIds ? [walletIds] : []);
  for (var i = 0; i < ids.length; i++) {
    if (accessible.indexOf(String(ids[i])) === -1) return walletAccessDenied_();
  }
  return requirePermission_(username, action);
}

function countActiveAdmins_() {
  return getAllUsers_().filter(function (u) {
    return String(u.Role) === "Admin" && String(u.Status).toLowerCase() === "active";
  }).length;
}

function publicUser_(user) {
  return {
    username: user.Username, fullName: user.FullName, role: user.Role, status: user.Status,
    permissions: getUserPermissions_(user), walletAccess: getUserWalletAccess_(user),
    profilePic: user.ProfilePic, defaultCurrency: user.DefaultCurrency, defaultAccount: user.DefaultAccount,
  };
}

// NOTE: PIN hashing / verification and the legacy-plaintext migration fallback
// now live in Security.gs so that all credential handling is in one file.

function ensureInitialAdmin_(userSheet) {
  if (userSheet.getLastRow() >= 2) return;
  var props = PropertiesService.getScriptProperties();
  var username = props.getProperty("INITIAL_ADMIN_USERNAME");
  var pin = props.getProperty("INITIAL_ADMIN_PIN");
  if (!username || !pin) return;
  var ts = nowStr();
  userSheet.appendRow([username, username, hashPin_(pin), "Admin", "Active", "[]", "[]", "", "", "", ts, ts, 0]);
  props.deleteProperty("INITIAL_ADMIN_PIN");
}

// ---------------- USER MANAGEMENT ----------------

var VALID_ROLES = ["Admin", "Sub-Admin", "User"];
var VALID_USER_STATUSES = ["Active", "Inactive"];
var MAX_FULLNAME_LENGTH = 100;
var MIN_PIN_LENGTH = 4;
var MAX_PIN_LENGTH = 20;
var MAX_PROFILE_PIC_CHARS = 48000;

function isValidRole_(role) { return VALID_ROLES.indexOf(role) !== -1; }
function isValidUserStatus_(status) { return VALID_USER_STATUSES.indexOf(status) !== -1; }

// isValidPin_ is defined once, at the top of this file, next to the PIN POLICY
// block. A second copy here would silently win (last declaration wins) and put
// the old String()-coercing rule back in charge.

function isValidProfilePic_(pic) {
  var s = String(pic || "");
  return s.length <= MAX_PROFILE_PIC_CHARS && /^data:image\//.test(s);
}

function rejectEscalation_(actorUsername, targetUsername, reason) {
  logAudit(actorUsername, "Rejected privilege escalation attempt", targetUsername, reason);
  return errCode_(ERR.PERMISSION_DENIED, reason);
}

function assertCanManageUser_(actorUsername, targetUsername, changes) {
  var actor = getUserRecord_(actorUsername);
  if (!actor || String(actor.Status).toLowerCase() !== "active") {
    return errCode_(ERR.INVALID_SESSION, "Unauthorized.");
  }
  var actorIsAdmin = String(actor.Role) === "Admin";
  var isSelf = String(actorUsername).toLowerCase() === String(targetUsername).toLowerCase();
  var target = getUserRecord_(targetUsername);
  var targetIsAdmin = !!target && String(target.Role) === "Admin";

  if (changes.role !== undefined) {
    if (!isValidRole_(changes.role)) return validationError_("Invalid role.");
    // Admin is the only role allowed to CREATE or ASSIGN the two privileged
    // tiers. A Sub-Admin holding ADD_USER could otherwise mint a fresh
    // "Sub-Admin" (the check used to block only "Admin"), which is itself a
    // step up the hierarchy and the entry point for granting any
    // ADDITIONAL_PERMISSION later. Demotion to "User" stays allowed for any
    // authorised actor, so nothing that previously worked for a non-Admin is
    // broken — only granting a privileged role is now refused.
    if (!actorIsAdmin && (changes.role === "Admin" || changes.role === "Sub-Admin" || targetIsAdmin)) {
      return rejectEscalation_(actorUsername, targetUsername, "Only an Admin can grant or change Admin or Sub-Admin access.");
    }
    if (!actorIsAdmin && isSelf) return rejectEscalation_(actorUsername, targetUsername, "You cannot change your own role.");
  }

  if (changes.permissions !== undefined) {
    if (!Array.isArray(changes.permissions) || changes.permissions.some(function (p) { return GRANTABLE_PERMISSIONS.indexOf(p) === -1; })) {
      return validationError_("Invalid permission in request.");
    }
    if (!actorIsAdmin) {
      if (targetIsAdmin) return rejectEscalation_(actorUsername, targetUsername, "You cannot modify an Admin's permissions.");
      if (isSelf) return rejectEscalation_(actorUsername, targetUsername, "You cannot change your own permissions.");
      var actorPerms = getUserPermissions_(actor);
      var grantingBeyondOwn = changes.permissions.some(function (p) { return actorPerms.indexOf(p) === -1; });
      if (grantingBeyondOwn) return rejectEscalation_(actorUsername, targetUsername, "You cannot grant a permission you do not have.");
    }
  }

  if (changes.walletAccess !== undefined) {
    if (!Array.isArray(changes.walletAccess)) return validationError_("Invalid wallet access request.");
    var realWalletIds = getAllWalletIds_();
    var allKnownWallets = changes.walletAccess.every(function (id) { return realWalletIds.indexOf(String(id)) !== -1; });
    if (!allKnownWallets) return validationError_("Unknown wallet in request.");
    if (!actorIsAdmin) {
      if (targetIsAdmin) return rejectEscalation_(actorUsername, targetUsername, "You cannot modify an Admin's wallet access.");
      if (isSelf) return rejectEscalation_(actorUsername, targetUsername, "You cannot change your own wallet access.");
      var actorWallets = getUserWalletAccess_(actor);
      var grantingBeyondOwnWallets = changes.walletAccess.some(function (id) { return actorWallets.indexOf(String(id)) === -1; });
      if (grantingBeyondOwnWallets) return rejectEscalation_(actorUsername, targetUsername, "You cannot grant access to a wallet you do not have.");
    }
  }

  if (changes.status !== undefined) {
    if (!isValidUserStatus_(changes.status)) return validationError_("Invalid status.");
    if (!actorIsAdmin) return rejectEscalation_(actorUsername, targetUsername, "Only an Admin can change user status.");
  }

  if (changes.deleting) {
    if (!actorIsAdmin) return rejectEscalation_(actorUsername, targetUsername, "Only an Admin can delete users.");
  }

  return null;
}

function usernameTaken_(username, excludeUsername) {
  var existing = getUserRecord_(username);
  if (!existing) return false;
  if (excludeUsername && String(existing.Username).toLowerCase() === String(excludeUsername).toLowerCase()) return false;
  return true;
}

function isValidUsername_(username) {
  return /^[a-zA-Z0-9._-]{3,30}$/.test(String(username || ""));
}

function addUser(fullName, username, pin, role, permissions, walletAccess, adminUsername) {
  setupDatabase();
  var permErr = requirePermission_(adminUsername, "ADD_USER");
  if (permErr) return permErr;
  if (!username || !pin || !role) return err_("সকল তথ্য পূরণ করুন!");
  var trimmedUsername = String(username).trim();
  if (!isValidUsername_(trimmedUsername)) return err_("Username শুধু ইংরেজি অক্ষর, সংখ্যা, _ . - ব্যবহার করতে পারবে (৩-৩০ অক্ষর)।");
  if (!isValidRole_(role)) return err_("Invalid role.");
  // Normalized once here and reused for the hash below, so the value that is
  // stored is provably the same value that was accepted.
  var newUserPin = normalizePin_(pin);
  if (!newUserPin) return err_(pinError_());
  if (usernameTaken_(trimmedUsername)) return err_("এই ইউজারনেম আগে থেকেই আছে!");

  // Defence in depth: creating an Admin requires the Admin-only
  // CREATE_ADMIN permission on top of ADD_USER, so a user who is ever granted
  // ADD_USER alone can never mint a new Admin.
  if (role === "Admin") {
    var createAdminErr = requirePermission_(adminUsername, "CREATE_ADMIN");
    if (createAdminErr) return createAdminErr;
  }

  var perms = role === "Admin" ? [] : sanitizeGrantableActions_(permissions || []);
  var wallets = role === "Admin" ? [] : (Array.isArray(walletAccess) ? walletAccess.map(String) : []);
  var authErr = assertCanManageUser_(adminUsername, trimmedUsername, { role: role, permissions: perms, walletAccess: wallets });
  if (authErr) return authErr;

  var ts = nowStr();
  // hash the NORMALIZED PIN, not the raw input: the value that gets stored has
  // to be the one the same three checks will accept on the login screen.
  getUsersSheet_().appendRow([trimmedUsername, (fullName || trimmedUsername).trim().slice(0, MAX_FULLNAME_LENGTH), hashPin_(newUserPin), role, "Active",
    JSON.stringify(perms), JSON.stringify(wallets), "", "", "", ts, ts, 0]);
  cacheRemove_("user", trimmedUsername);
  logAudit(adminUsername, "User created", trimmedUsername, role);
  return { status: "SUCCESS", message: "নতুন ইউজার সফলভাবে যোগ করা হয়েছে!" };
}

function updateUser(username, fullName, role, adminUsername) {
  setupDatabase();
  var user = getUserRecord_(username);
  if (!user) return err_("ইউজার পাওয়া যায়নি!");

  var roleChanged = role && role !== user.Role;
  var nameChanged = fullName !== undefined && fullName !== null && fullName !== user.FullName;

  if (nameChanged) {
    var editPermErr = requirePermission_(adminUsername, "EDIT_USER");
    if (editPermErr) return editPermErr;
  }
  if (roleChanged) {
    var roleErr = requirePermission_(adminUsername, "CHANGE_USER_ROLE");
    if (roleErr) return roleErr;
    var authErr = assertCanManageUser_(adminUsername, username, { role: role });
    if (authErr) return authErr;
    if (user.Role === "Admin" && role !== "Admin" && countActiveAdmins_() <= 1) {
      return err_("সর্বশেষ সক্রিয় Admin এর role পরিবর্তন করা যাবে না!");
    }
  }
  if (!roleChanged && !nameChanged) {
    if (!hasPermission_(adminUsername, "EDIT_USER") && !hasPermission_(adminUsername, "CHANGE_USER_ROLE")) {
      return err_("You do not have permission to perform this action.");
    }
  }

  if (nameChanged) getUsersSheet_().getRange(user._row, USER_COL_FULLNAME, 1, 1).setValue(fullName);
  if (roleChanged) getUsersSheet_().getRange(user._row, 4, 1, 1).setValue(role);
  getUsersSheet_().getRange(user._row, USER_COL_UPDATED_AT, 1, 1).setValue(nowStr());
  cacheRemove_("user", username);
  // A role change alters what the account is allowed to do, so every session
  // it already holds must stop working.
  if (roleChanged) {
    var roleBumpErr = requireSessionBump_(username, getUserRecord_(username), "role changed");
    if (roleBumpErr) return roleBumpErr;
  }
  logAudit(adminUsername, "User updated", username, JSON.stringify({ fullName: fullName, role: role }));
  return { status: "SUCCESS", message: "ইউজার আপডেট হয়েছে!" };
}

// ---------------- DELETION SAFETY / USER HISTORY ----------------
//
// A user is referenced BY NAME from every financial sheet: the wallet ledgers
// (Transactions "User"), Loans ("User" and "CreatedBy"), LoanPayments and
// LoanAdditions (both). The Audit_Log is deliberately NOT counted here: audit
// rows are immutable history rather than a parent record, and every account
// has at least one ("User created"), so counting them would make deletion
// impossible for every user ever created.
//
// Deleting a row is not a tidy empty slot, it RELEASES the username: addUser()
// will happily hand "rahim" to a different person, and that person then
// silently inherits the previous owner's transactions, loans, repayments and
// additions. So a user that financial history still points at is archived
// instead of deleted, which keeps every historical row attributable to the
// person who actually made it and is reversible.
// Resolved from the header arrays rather than hand-counted, so a column added
// to a sheet can never silently shift one of these lookups onto the wrong
// field (the wallet ledger's "User" is column 11, not 10).
function headerColumn_(headers, name) {
  var idx = headers.indexOf(name);
  if (idx === -1) throw new Error("Missing column " + name);
  return idx + 1;
}

function countColumnValue_(sheet, startRow, col, key) {
  if (!sheet || sheet.getLastRow() < startRow) return 0;
  var values = sheet.getRange(startRow, col, sheet.getLastRow() - startRow + 1, 1).getValues();
  var n = 0;
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0] || "").toLowerCase() === key) n++;
  }
  return n;
}

function userFinancialHistory_(username) {
  var key = String(username || "").toLowerCase();
  var refs = { transactions: 0, loans: 0, loanPayments: 0, loanAdditions: 0 };
  if (!key) return refs;
  getAllWalletsSafe_().forEach(function (w) {
    // getSheetByName, not resolveWalletSheet_: looking for evidence must never
    // create a sheet as a side effect.
    refs.transactions += countColumnValue_(ss_().getSheetByName(w.SheetName), WALLET_DATA_START_ROW,
      headerColumn_(TRANSACTION_HEADERS, "User"), key);
  });
  var loansSheet = getLoansSheet_();
  refs.loans = countColumnValue_(loansSheet, 2, headerColumn_(LOAN_HEADERS, "User"), key)
    + countColumnValue_(loansSheet, 2, headerColumn_(LOAN_HEADERS, "CreatedBy"), key);
  refs.loanPayments = countColumnValue_(getLoanPaymentsSheet_(), 2, headerColumn_(LOAN_PAYMENT_HEADERS, "User"), key)
    + countColumnValue_(getLoanPaymentsSheet_(), 2, headerColumn_(LOAN_PAYMENT_HEADERS, "CreatedBy"), key);
  refs.loanAdditions = countColumnValue_(getLoanAdditionsSheet_(), 2, headerColumn_(LOAN_ADDITION_HEADERS, "User"), key)
    + countColumnValue_(getLoanAdditionsSheet_(), 2, headerColumn_(LOAN_ADDITION_HEADERS, "CreatedBy"), key);
  return refs;
}

function userFinancialHistoryTotal_(refs) {
  return refs.transactions + refs.loans + refs.loanPayments + refs.loanAdditions;
}

function describeUserHistory_(refs) {
  var parts = [];
  if (refs.transactions) parts.push(refs.transactions + "টি লেনদেন");
  if (refs.loans) parts.push(refs.loans + "টি লেন");
  if (refs.loanPayments) parts.push(refs.loanPayments + "টি লেন পরিশোধ");
  if (refs.loanAdditions) parts.push(refs.loanAdditions + "টি লেন সংযোজন");
  return parts.length ? parts.join(", ") : "";
}

function deleteUser(username, adminUsername) {
  setupDatabase();
  var permErr = requirePermission_(adminUsername, "DELETE_USER");
  if (permErr) return permErr;
  var user = getUserRecord_(username);
  if (!user) return err_("ইউজার পাওয়া যায়নি!");
  // Self-deletion is a footgun, not a feature: the row is the only thing that
  // makes the Admin's own session resolvable, so the caller would lock
  // themselves out mid-operation with no way back except another Admin. The
  // user list already hides this action for the signed-in Admin.
  if (String(adminUsername).toLowerCase() === String(username).toLowerCase()) {
    return rejectEscalation_(adminUsername, username, "You cannot delete your own account.");
  }
  if (user.Role === "Admin" && countActiveAdmins_() <= 1) return err_("সর্বশেষ সক্রিয় Admin মুছবেন না!");
  var authErr = assertCanManageUser_(adminUsername, username, { deleting: true });
  if (authErr) return authErr;

  // Archive instead of delete while anything financial still points here.
  var refs = userFinancialHistory_(username);
  if (userFinancialHistoryTotal_(refs) > 0) {
    logAudit(adminUsername, "User delete refused - financial history exists", username, JSON.stringify(refs));
    return validationError_(
      "এই ইউজারের নামে আর্থিক রেকর্ড আছে (" + describeUserHistory_(refs) +
      "), তাই মুছে ফেলা যাবে না — ইতিহাস অক্ষত রাখতে অনুগ্রহ করে ইউজারটি Deactivate করুন।"
    );
  }

  getUsersSheet_().deleteRow(user._row);
  cacheRemove_("user", username);
  // The name is free again, so a failed-login counter left behind would lock
  // out whoever legitimately takes the name next.
  clearFailedLogins_(username);
  logAudit(adminUsername, "User deleted", username, "");
  return { status: "SUCCESS", message: "ইউজার মুছে ফেলা হয়েছে!" };
}

function setUserStatus(username, status, adminUsername) {
  setupDatabase();
  var permErr = requirePermission_(adminUsername, "EDIT_USER");
  if (permErr) return permErr;
  var user = getUserRecord_(username);
  if (!user) return err_("ইউজার পাওয়া যায়নি!");
  var authErr = assertCanManageUser_(adminUsername, username, { status: status });
  if (authErr) return authErr;
  if (user.Role === "Admin" && status !== "Active" && countActiveAdmins_() <= 1) {
    return err_("সর্বশেষ সক্রিয় Admin নিষ্ক্রিয় করা যাবে না!");
  }
  getUsersSheet_().getRange(user._row, USER_COL_STATUS, 1, 1).setValue(status);
  getUsersSheet_().getRange(user._row, USER_COL_UPDATED_AT, 1, 1).setValue(nowStr());
  cacheRemove_("user", username);
  // Deactivation (and the reverse) changes whether the account may be used at
  // all, so any session the target still holds is invalidated here.
  var statusBumpErr = requireSessionBump_(username, getUserRecord_(username), "status changed");
  if (statusBumpErr) return statusBumpErr;
  logAudit(adminUsername, "User status changed", username, status);
  return { status: "SUCCESS", message: "ইউজার স্ট্যাটাস আপডেট হয়েছে!" };
}

function changeUserRole(username, newRole, adminUsername) {
  return updateUser(username, null, newRole, adminUsername);
}

function resetPin(username, newPin, adminUsername) {
  setupDatabase();
  var permErr = requirePermission_(adminUsername, "CHANGE_USER_PASSWORD");
  if (permErr) return permErr;
  var target = getUserRecord_(username);
  if (!target) return err_("ইউজার পাওয়া যায়নি!");
  var resetPinValue = normalizePin_(newPin);
  if (!resetPinValue) return err_(pinError_());

  if (String(adminUsername).toLowerCase() === String(username).toLowerCase()) {
    return rejectEscalation_(adminUsername, username, "You cannot reset your own PIN here — use Profile → Edit Profile.");
  }
  var actor = getUserRecord_(adminUsername);
  var actorIsAdmin = !!actor && String(actor.Role) === "Admin";
  if (!actorIsAdmin && String(target.Role) === "Admin") {
    return rejectEscalation_(adminUsername, username, "Only an Admin can reset an Admin's PIN.");
  }

  getUsersSheet_().getRange(target._row, USER_COL_PIN, 1, 1).setValue(hashPin_(resetPinValue));
  getUsersSheet_().getRange(target._row, USER_COL_UPDATED_AT, 1, 1).setValue(nowStr());
  cacheRemove_("user", username);
  clearFailedLogins_(username);
  // A PIN reset is a credential change: every session the target holds must
  // die, so a stolen session cannot outlive the reset.
  var resetBumpErr = requireSessionBump_(username, getUserRecord_(username), "PIN reset");
  if (resetBumpErr) return resetBumpErr;
  logAudit(adminUsername, "PIN reset", username, "");
  return { status: "SUCCESS", message: "ইউজারের PIN রিসেট করা হয়েছে!", sessionInvalidated: true };
}

function updateUserPermissions(username, permissions, adminUsername) {
  setupDatabase();
  var permErr = requirePermission_(adminUsername, "MANAGE_USER_PERMISSIONS");
  if (permErr) return permErr;
  var user = getUserRecord_(username);
  if (!user) return err_("ইউজার পাওয়া যায়নি!");
  var sanitized = isAdminRecord_(user) ? [] : sanitizeGrantableActions_(permissions || []);
  var authErr = assertCanManageUser_(adminUsername, username, { permissions: sanitized });
  if (authErr) return authErr;
  getUsersSheet_().getRange(user._row, USER_COL_PERMISSIONS, 1, 1).setValue(JSON.stringify(sanitized));
  getUsersSheet_().getRange(user._row, USER_COL_UPDATED_AT, 1, 1).setValue(nowStr());
  cacheRemove_("user", username);
  var permBumpErr = requireSessionBump_(username, getUserRecord_(username), "permissions changed");
  if (permBumpErr) return permBumpErr;
  logAudit(adminUsername, "Permissions changed", username, JSON.stringify(sanitized));
  return { status: "SUCCESS", message: "Permissions আপডেট হয়েছে!" };
}

function updateUserWalletAccess(username, walletAccess, adminUsername) {
  setupDatabase();
  var permErr = requirePermission_(adminUsername, "MANAGE_USER_PERMISSIONS");
  if (permErr) return permErr;
  var user = getUserRecord_(username);
  if (!user) return err_("ইউজার পাওয়া যায়নি!");
  var requested = Array.isArray(walletAccess) ? walletAccess.map(String) : [];
  var authErr = assertCanManageUser_(adminUsername, username, { walletAccess: requested });
  if (authErr) return authErr;
  // Defence in depth against privilege manipulation: a non-Admin manager may
  // hand out wallets it has access to, but it must never grant a wallet it
  // lacks and it must never silently STRIP a wallet the target already had -
  // revoking access is a decision only an Admin may make.
  // isAdminRecord_() takes a user RECORD, not a username, so the actor is
  // resolved first; passing the username here silently looked like a non-admin.
  var actor = getUserRecord_(adminUsername);
  var actorIsAdmin = !!actor && String(actor.Role) === "Admin";
  var targetIsAdmin = String(user.Role) === "Admin";
  if (!actorIsAdmin) {
    var actorWallets = getUserWalletAccess_(actor);
    var currentWalletIds = (user.WalletAccess || []).map(String);
    var widening = requested.some(function (id) {
      return currentWalletIds.indexOf(id) === -1 && actorWallets.indexOf(id) === -1;
    });
    if (widening) {
      return rejectEscalation_(adminUsername, username, "You cannot grant access to a wallet you do not have.");
    }
    var stripping = currentWalletIds.some(function (id) {
      return requested.indexOf(id) === -1;
    });
    if (stripping) {
      return rejectEscalation_(adminUsername, username, "Only an Admin can remove a wallet from a user.");
    }
  }
  getUsersSheet_().getRange(user._row, USER_COL_WALLET_ACCESS, 1, 1).setValue(JSON.stringify(targetIsAdmin ? [] : requested));
  getUsersSheet_().getRange(user._row, USER_COL_UPDATED_AT, 1, 1).setValue(nowStr());
  cacheRemove_("user", username);
  // Wallet scope is part of the security envelope, so the target's live
  // sessions must re-derive it from the sheet.
  var walletBumpErr = requireSessionBump_(username, getUserRecord_(username), "wallet access changed");
  if (walletBumpErr) return walletBumpErr;
  logAudit(adminUsername, "Wallet access changed", username, JSON.stringify(requested));
  return { status: "SUCCESS", message: "Wallet Access আপডেট হয়েছে!" };
}

function updateUserProfile(data) {
  setupDatabase();
  if (!data || !data.username) return err_("ইউজার পাওয়া যায়নি!");
  var user = getUserRecord_(data.username);
  if (!user) return err_("ইউজার পাওয়া যায়নি!");

  if (data.newUsername && String(data.newUsername).trim() !== user.Username) {
    return err_("Username cannot be changed.");
  }

  // Validate EVERY field before writing ANY of them. Writing the PIN first and
  // then failing on a later field would leave the account holding a new PIN the
  // caller was never told about, while the old session stayed alive. So the
  // values are collected first and written only once everything is known good.
  var pinChanged = false;
  var newPinHash = null;
  if (data.pin) {
    // currentPin is compared the same way: a non-string here is a caller bug,
    // not a credential, so it is refused rather than coerced (String(true) once
    // matched a stored "true" hash).
    if (typeof data.currentPin !== "string" || !verifyPin_(user.PIN, data.currentPin)) {
      return err_("Current PIN সঠিক নয়!");
    }
    var normalizedPin = normalizePin_(data.pin);
    if (!normalizedPin) {
      return err_(pinError_());
    }
    newPinHash = hashPin_(normalizedPin);
    pinChanged = true;
  }

  var newFullName = undefined;
  if (data.fullName !== undefined) {
    newFullName = String(data.fullName).trim();
    if (!newFullName) return err_("Full Name খালি রাখা যাবে না।");
    if (newFullName.length > MAX_FULLNAME_LENGTH) return err_("Full Name অনেক বড়।");
  }
  if (data.profilePic && !isValidProfilePic_(data.profilePic)) {
    return err_("ছবির ফরম্যাট বা সাইজ সঠিক নয়।");
  }

  // The default currency/account pair is a preference for a wallet the user can
  // actually reach, so it is checked against the user's own wallets instead of
  // being stored blind: a default of a currency no accessible wallet uses (or
  // BDT with a Bank account pointed at a Cash-only wallet) is exactly the
  // inconsistent currency/account state the rest of the backend refuses to
  // store. Both halves are resolved together, so a caller can never leave a
  // currency with no account or the reverse.
  var newDefaultCurrency = user.DefaultCurrency;
  var newDefaultAccount = user.DefaultAccount;
  if (data.defaultCurrency || data.defaultAccount) {
    newDefaultCurrency = String(data.defaultCurrency || user.DefaultCurrency || "");
    newDefaultAccount = String(data.defaultAccount || user.DefaultAccount || "");
    if (!isValidCurrency_(newDefaultCurrency)) {
      return validationError_("Default currency " + (newDefaultCurrency || "(খালি)") + " সঠিক নয়।");
    }
    if (!isValidAccount_(newDefaultAccount)) {
      return validationError_("Default account সঠিক নয়।");
    }
    var reachable = getUserWalletAccess_(user).some(function (walletId) {
      var wallet = getWalletById_(walletId);
      return wallet
        && String(wallet.Currency) === newDefaultCurrency
        && String(wallet.Status) === "Active";
    });
    if (!reachable) {
      return validationError_(
        "Default currency/account জোড়াটি আপনার কোনো সক্রিয় ওয়ালেটের সাথে মেলে না।"
      );
    }
  }

  var sheet = getUsersSheet_();
  if (pinChanged) sheet.getRange(user._row, USER_COL_PIN, 1, 1).setValue(newPinHash);
  if (newFullName !== undefined) sheet.getRange(user._row, USER_COL_FULLNAME, 1, 1).setValue(newFullName);
  if (data.profilePic) sheet.getRange(user._row, headerColumn_(USER_HEADERS, "ProfilePic"), 1, 1).setValue(data.profilePic);
  if (newDefaultCurrency) sheet.getRange(user._row, headerColumn_(USER_HEADERS, "DefaultCurrency"), 1, 1).setValue(newDefaultCurrency);
  if (newDefaultAccount) sheet.getRange(user._row, headerColumn_(USER_HEADERS, "DefaultAccount"), 1, 1).setValue(newDefaultAccount);
  sheet.getRange(user._row, USER_COL_UPDATED_AT, 1, 1).setValue(nowStr());
  // Any accepted write drops the cached record, not just a PIN change: a name,
  // picture or default-currency write would otherwise be served back stale by
  // the next validateSession/getInitialData for the whole cache window.
  cacheRemove_("user", user.Username);

  // Self-service PIN change: the current session is destroyed on purpose so
  // the new PIN has to be used from a clean login. Every OTHER session of this
  // account dies with the version bump. A save that did not touch the
  // credential leaves every session alone.
  if (pinChanged) {
    clearFailedLogins_(user.Username);
    var selfBumpErr = requireSessionBump_(user.Username, getUserRecord_(user.Username), "self PIN change");
    if (selfBumpErr) return selfBumpErr;
  }

  logAudit(user.Username, "Profile updated", user.Username, pinChanged ? "PIN changed" : "");
  return {
    status: "SUCCESS",
    message: "প্রোফাইল আপডেট হয়েছে!",
    username: user.Username,
    sessionInvalidated: pinChanged,
  };
}

// ---------------- INITIAL DATA ----------------

// Builds the per-row user list returned to the user-management screen.
//
// Wallet IDs a viewer has no access to are MASKED OUT rather than replaced
// with a placeholder. The UI already treats any wallet id it does not hold as
// "out of scope" (see UserProfileView), and a placeholder string would be a
// real id that merely looks unfamiliar, so the id is simply not disclosed. The
// resulting list is therefore exactly "the wallets this viewer is allowed to
// see", which is the same set the mutation endpoints will authorise.
function buildUserListForViewer_(viewer) {
  var viewerIsAdmin = isAdminRecord_(viewer);
  var viewerWallets = getUserWalletAccess_(viewer);
  return getAllUsers_().map(function (u) {
    var effective = getUserWalletAccess_(u);
    var visible = viewerIsAdmin ? effective : effective.filter(function (id) {
      return viewerWallets.indexOf(String(id)) !== -1;
    });
    return {
      Username: u.Username, FullName: u.FullName, Role: u.Role, Status: u.Status,
      Permissions: getUserPermissions_(u), WalletAccess: visible,
    };
  });
}

function getInitialData(username) {
  setupDatabase();
  var user = getUserRecord_(username);
  if (!user) return errCode_(ERR.INVALID_SESSION, "ইউজার পাওয়া যায়নি!");
  if (String(user.Status).toLowerCase() !== "active") {
    return errCode_(ERR.SESSION_EXPIRED, "এই একাউন্টটি নিষ্ক্রিয়। অ্যাডমিনের সাথে যোগাযোগ করুন।");
  }

  var wallets = getWallets(username);
  var accessible = getUserWalletAccess_(user);
  var transactions = [];
  accessible.forEach(function (id) {
    var resolved = resolveWalletSheet_(id);
    if (resolved && String(resolved.wallet.Status) === "Active") {
      transactions = transactions.concat(readWalletTransactions_(resolved.sheet, resolved.wallet));
    }
  });
  transactions.sort(function (a, b) { return new Date(b.Date) - new Date(a.Date); });

  var users = [];
  if (hasAnyUserMgmtPermission_(username)) {
    users = buildUserListForViewer_(user);
  }

  var categories = getCategories(username).categories;

  // Every financial account of every wallet the caller can reach, so the
  // account dropdowns and the per-account balance cards render without an extra
  // request each. Inactive accounts are included (the management screens need
  // them); the forms filter to Active themselves.
  var accounts = [];
  wallets.forEach(function (w) {
    accounts = accounts.concat(financialAccountsForWallet_(w.WalletID, { includeInactive: true }));
  });

  return {
    status: "SUCCESS", transactions: transactions, users: users, wallets: wallets, categories: categories, accounts: accounts,
    // Authoritative identity/permission payload. The frontend bootstrap stores
    // this instead of trusting whatever was cached in localStorage.
    user: publicUser_(user),
    permissions: getUserPermissions_(user), allPermissions: ALL_PERMISSIONS,
  };
}
