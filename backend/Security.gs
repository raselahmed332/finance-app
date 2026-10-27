// ============================================================
// SECURITY PRIMITIVES
// ============================================================
// This file is the single place where the following live:
//
//   1. Structured error codes (so the frontend can react to a FAILURE
//      REASON instead of regex-matching an English/Bengali sentence).
//   2. doPost() request/param validation (shape + type + size checks).
//   3. Server-side session creation / validation / revocation, including
//      the per-user "session version" that makes every other session of a
//      user die the moment a security-sensitive change happens.
//   4. PIN hashing, verification and the ISOLATED legacy-plaintext
//      migration fallback.
//   5. The atomic failed-login counter.
//
// Nothing here changes any business rule; it only decides WHO may call
// WHAT, and rejects malformed requests before they reach business logic.
// ============================================================

// ---------------- 1. STRUCTURED ERROR CODES ----------------

var ERR = {
  SESSION_EXPIRED: "SESSION_EXPIRED",
  INVALID_SESSION: "INVALID_SESSION",
  AUTH_REQUIRED: "AUTH_REQUIRED",
  INVALID_REQUEST: "INVALID_REQUEST",
  INVALID_PARAMS: "INVALID_PARAMS",
  PERMISSION_DENIED: "PERMISSION_DENIED",
  WALLET_ACCESS_DENIED: "WALLET_ACCESS_DENIED",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  UNKNOWN_ACTION: "UNKNOWN_ACTION",
  SESSION_INVALIDATION_FAILED: "SESSION_INVALIDATION_FAILED",
};

// Codes that mean "this browser is no longer authenticated". The frontend
// clears its token and returns to the Login screen for exactly these.
function errCode_(code, message) {
  return { status: "ERROR", code: code, message: message };
}

// ---------------- REQUEST / PARAM VALIDATION ----------------
//
// Hard limits. Anything larger is refused outright instead of being parsed
// and then rejected deep inside business logic.
var MAX_REQUEST_CHARS = 8 * 1024 * 1024; // generous: profile pics + JSON backups
var MAX_PARAMS = 32;
var MAX_ACTION_NAME_LEN = 64;
var MAX_TOKEN_LEN = 128;
var MAX_SHORT_STRING_LEN = 200;
var MAX_PLAIN_STRING_LEN = 20000;
var MAX_SCALAR_DEPTH = 12;

var ACTION_NAME_RE = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
var TOKEN_RE = /^[A-Za-z0-9-]{16,128}$/;
var IDENTIFIER_RE = /^[^\u0000-\u001f\u007f]{1,200}$/;
var CONTROL_CHARS_RE = /[\u0000-\u001f\u007f]/;

// Per-action positional param schema. Checked BEFORE bindCallerToParams_()
// overwrites the identity positions, so a malformed request never reaches a
// business function.
//
//   "sn"  short identifier string (<=200 chars, no control characters)
//   "s"   plain string (may be null/undefined -> passed through as-is)
//   "s!"  plain string, required, non-empty
//   "n"   finite number
//   "n!"  finite number, required
//   "o"   plain object
//   "o!"  plain object, required
//   "a"   array
//   "b"   boolean
//   "*"   any non-null JSON scalar
//
// A null/undefined value always satisfies the type check (it means "argument
// not supplied"); only the "!" variants require the argument to be present.
// Extra trailing args are tolerated ONLY when they are null/undefined, so an
// older/newer frontend build that appends an empty placeholder cannot hard-
// fail, while genuinely unexpected extra data is still rejected.
var ACTION_PARAM_SCHEMAS = {
  login: ["sn!", "sn!"],
  // logout and validateSession take no params: the router passes the token
  // straight from the request body.
  logout: [],
  validateSession: [],

  getInitialData: ["sn"],
  getWallets: ["sn"],
  getAllWallets: ["sn"],
  getBackupData: ["sn"],
  getCategories: ["sn"],
  findBrokenTransferPairs: ["sn"],

  addTransaction: ["o!"],
  updateTransaction: ["o!", "sn"],
  deleteTransaction: ["sn", "sn", "sn"],
  getTransactions: ["sn", "o"],
  getTransferPair: ["sn", "sn", "sn"],

  addWallet: ["s!", "s!", "n", "n", "sn"],
  updateWallet: ["sn", "s", "s", "sn"],
  deleteWallet: ["sn", "sn"],
  checkWalletHasTransactions: ["sn", "sn"],

  getReport: ["sn", "sn", "s", "s"],

  addCategory: ["s!", "s!", "sn"],
  updateCategory: ["sn", "o!", "sn"],
  deleteCategory: ["sn", "sn"],
  getAuditLog: ["sn", "o"],
  runAuditCleanup: ["sn"],

  getCurrencies: ["sn"],
  addCurrency: ["o!", "sn"],
  updateCurrency: ["sn", "o", "sn"],
  deleteCurrency: ["sn", "sn"],

  // Accounts (types + per-wallet financial accounts)
  getAccountTypes: ["sn"],
  addAccountType: ["o!", "sn"],
  updateAccountType: ["sn", "o", "sn"],
  deleteAccountType: ["sn", "sn"],
  getFinancialAccounts: ["sn", "sn"],
  addFinancialAccount: ["o!", "sn"],
  updateFinancialAccount: ["sn", "o", "sn"],
  deleteFinancialAccount: ["sn", "o", "sn"],

  addUser: ["s", "sn!", "sn!", "s!", "a", "a", "sn"],
  updateUser: ["sn", "s", "s", "sn"],
  deleteUser: ["sn", "sn"],
  setUserStatus: ["sn", "s!", "sn"],
  changeUserRole: ["sn", "s!", "sn"],
  updateUserPermissions: ["sn", "a", "sn"],
  updateUserWalletAccess: ["sn", "a", "sn"],
  updateUserProfile: ["o!"],
  resetPin: ["sn", "sn!", "sn"],

  importBackup: ["o!", "sn"],

  getLoans: ["sn", "s", "o"],
  getLoanDetails: ["sn", "sn"],
  getPersonActiveLoans: ["sn", "o"],
  createLoan: ["o!"],
  addLoan: ["o!"],
  updateLoan: ["o!", "sn"],
  deleteLoan: ["sn", "sn"],
  addLoanPayment: ["o!"],
  addLoanRepayment: ["o!"],
  updateLoanPayment: ["o!", "sn"],
  deleteLoanPayment: ["sn", "sn"],
  addLoanAddition: ["o!"],
  editLoanAddition: ["o!", "sn"],
  deleteLoanAddition: ["sn", "sn"],

  // Savings
  getSavingsPlans: ["sn", "s", "o"],
  getSavingsPlanDetails: ["sn", "sn"],
  createSavingsPlan: ["o!"],
  updateSavingsPlan: ["o!", "sn"],
  deleteSavingsPlan: ["sn", "sn"],
  addSavingsGroupMember: ["o!"],
  updateSavingsGroupMember: ["o!", "sn"],
  removeSavingsGroupMember: ["sn", "sn"],
  setSavingsGroupRecipientOrder: ["o!"],
  recordSavingsGroupContribution: ["o!"],
  recordSavingsGroupPayout: ["o!"],
  generateSavingsFixedInstallments: ["o!"],
  addSavingsFixedPayment: ["o!"],
  closeSavingsFixedPlan: ["o!"],
  addSavingsFlexDeposit: ["o!"],
  addSavingsFlexWithdrawal: ["o!"],
  closeSavingsFlexPlan: ["o!"],
  deleteSavingsFlexTransaction: ["sn", "s", "sn"],

  getShopLedgers: ["sn"],
  getShopLedgerDetails: ["sn!", "sn"],
  getShopLedgerReport: ["sn!", "sn!", "sn"],
  createShopLedger: ["o!", "sn"],
  updateShopLedger: ["sn!", "o!", "sn"],
  setShopLedgerStatus: ["sn!", "o!", "sn"],
  addShopMarket: ["sn!", "o!", "sn"],
  updateShopMarket: ["sn!", "o!", "sn"],
  deleteShopMarket: ["sn!", "o!", "sn"],
  addShopPayment: ["sn!", "o!", "sn"],
  updateShopPayment: ["sn!", "o!", "sn"],
  deleteShopPayment: ["sn!", "o!", "sn"],
};

function isPlainObject_(v) {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

// Bounds nested payload size/depth so a hostile "backup" object cannot be
// used to exhaust the Apps Script execution quota before validation runs.
function payloadWithinLimits_(value, depth) {
  depth = depth || 0;
  if (depth > MAX_SCALAR_DEPTH) return false;
  if (value === null) return true;
  var t = typeof value;
  if (t === "string") return value.length <= MAX_PLAIN_STRING_LEN * 8;
  if (t === "number") return isFinite(value);
  if (t === "boolean") return true;
  if (t !== "object") return false;
  if (Array.isArray(value)) {
    for (var i = 0; i < value.length; i++) {
      if (!payloadWithinLimits_(value[i], depth + 1)) return false;
    }
    return true;
  }
  var keys = Object.keys(value);
  if (keys.length > 2000) return false;
  for (var j = 0; j < keys.length; j++) {
    if (!payloadWithinLimits_(value[keys[j]], depth + 1)) return false;
  }
  return true;
}

function paramTypeOk_(value, spec) {
  var required = spec.charAt(spec.length - 1) === "!";
  var base = required ? spec.slice(0, -1) : spec;
  var absent = value === undefined || value === null || value === "";

  // A number slot is the one type where a supplied value can legitimately look
  // "empty" to JavaScript (0, "", false), so presence is judged on the value
  // itself rather than on truthiness.
  if (base === "n") {
    if (absent) return !required;
    return typeof value !== "boolean" && typeof value !== "object" && isFinite(Number(value));
  }
  // A non-required slot that was not supplied at all is fine: the handler
  // receives undefined and applies its own default. Without this, the identity
  // slots that bindCallerToParams_() fills in later would be rejected here.
  if (absent) return !required;

  switch (base) {
    case "sn":
      return typeof value === "string" && value.length <= MAX_SHORT_STRING_LEN &&
        IDENTIFIER_RE.test(value) && !CONTROL_CHARS_RE.test(value);
    case "s":
      return typeof value === "string" && value.length <= MAX_PLAIN_STRING_LEN;
    case "o":
      return isPlainObject_(value) && payloadWithinLimits_(value, 0);
    case "a":
      return Array.isArray(value) && value.length <= 5000 && payloadWithinLimits_(value, 0);
    case "b":
      return typeof value === "boolean";
    case "*":
      return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
    default:
      return false;
  }
}

// Parses and validates the raw doPost payload. Returns either
// { error: <structured error> } or { body: <validated body> }.
function parseAndValidateRequest_(e) {
  if (!e || !e.postData || typeof e.postData.contents !== "string" || !e.postData.contents.length) {
    return { error: errCode_(ERR.INVALID_REQUEST, "Invalid request: empty body.") };
  }
  if (e.postData.contents.length > MAX_REQUEST_CHARS) {
    return { error: errCode_(ERR.INVALID_REQUEST, "Invalid request: payload too large.") };
  }

  var body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (parseErr) {
    return { error: errCode_(ERR.INVALID_REQUEST, "Invalid request: malformed JSON.") };
  }
  if (!isPlainObject_(body)) {
    return { error: errCode_(ERR.INVALID_REQUEST, "Invalid request: body must be a JSON object.") };
  }

  if (body.action !== "login" && body.token !== undefined && body.token !== null && body.token !== "") {
    if (typeof body.token !== "string" || !TOKEN_RE.test(body.token)) {
      // A token that is not even well-formed cannot belong to a live session
      // (session tokens are always [A-Za-z0-9-]{16,128}). Report it as an
      // invalid session rather than a generic bad request so the client clears
      // it and returns to the login screen instead of showing a confusing
      // "invalid request" error.
      return { error: errCode_(ERR.INVALID_SESSION, "Invalid session. Please log in again.") };
    }
  }

  var action = body.action;
  if (typeof action !== "string" || !action.length) {
    return { error: errCode_(ERR.INVALID_REQUEST, "Invalid request: missing action.") };
  }
  if (action.length > MAX_ACTION_NAME_LEN || !ACTION_NAME_RE.test(action)) {
    return { error: errCode_(ERR.INVALID_REQUEST, "Invalid request: malformed action.") };
  }
  // hasOwnProperty (never a truthy `ALLOWED_ACTIONS[action]` lookup) so an
  // action named "constructor"/"toString"/"__proto__" can never resolve to
  // something on Object.prototype and be invoked.
  if (!Object.prototype.hasOwnProperty.call(ALLOWED_ACTIONS, action) ||
      typeof ALLOWED_ACTIONS[action] !== "function") {
    return { error: errCode_(ERR.UNKNOWN_ACTION, "Unknown action: " + action) };
  }

  var params = body.params;
  if (params === undefined || params === null) params = [];
  if (!Array.isArray(params)) {
    return { error: errCode_(ERR.INVALID_PARAMS, "Invalid params: expected an array.") };
  }
  if (params.length > MAX_PARAMS) {
    return { error: errCode_(ERR.INVALID_PARAMS, "Invalid params: too many arguments.") };
  }

  var schema = ACTION_PARAM_SCHEMAS[action];
  if (!schema) {
    return { error: errCode_(ERR.UNKNOWN_ACTION, "Unknown action: " + action) };
  }
  for (var i = 0; i < params.length; i++) {
    var value = params[i];
    if (i >= schema.length) {
      // Only tolerate an absent trailing placeholder; reject real extra data.
      if (value === undefined || value === null) continue;
      return { error: errCode_(ERR.INVALID_PARAMS, "Invalid params: unexpected argument for " + action + ".") };
    }
    if (!paramTypeOk_(value, schema[i])) {
      return { error: errCode_(ERR.INVALID_PARAMS, "Invalid params: argument " + (i + 1) + " of " + action + " has the wrong type.") };
    }
  }
  for (var k = 0; k < schema.length; k++) {
    if (schema[k].charAt(schema[k].length - 1) !== "!") continue;
    var pv = params[k];
    if (pv === undefined || pv === null || pv === "") {
      return { error: errCode_(ERR.INVALID_PARAMS, "Invalid params: missing required argument " + (k + 1) + " of " + action + ".") };
    }
  }

  return { body: body, action: action, params: params };
}

// ---------------- PIN HASHING ----------------
//
// Stored format: "hmac-sha256:<salt>:<hex-digest>". The HMAC key is kept in
// Script Properties, separately from the Users sheet, so a sheet-only
// disclosure does not provide enough data to guess PINs offline.
// Do not delete or rotate PIN_HASH_PEPPER after hashes have been stored; doing
// so would make every account using this format unable to authenticate.
// The PIN itself is never persisted, never returned by any API and never
// placed in a URL, a log line or an audit row.

function getPinHashPepper_() {
  var properties = PropertiesService.getScriptProperties();
  var pepper = properties.getProperty("PIN_HASH_PEPPER");
  if (pepper) return pepper;

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    pepper = properties.getProperty("PIN_HASH_PEPPER");
    if (!pepper) {
      pepper = Utilities.getUuid().replace(/-/g, "") +
        Utilities.getUuid().replace(/-/g, "");
      properties.setProperty("PIN_HASH_PEPPER", pepper);
    }
    return pepper;
  } finally {
    lock.releaseLock();
  }
}

function digestHex_(bytes) {
  return bytes.map(function (b) { return (b + 256).toString(16).slice(-2); }).join("");
}

function hashPin_(pin, salt) {
  salt = salt || Utilities.getUuid().replace(/-/g, "");
  var bytes = Utilities.computeHmacSha256Signature(salt + ":" + String(pin), getPinHashPepper_());
  return "hmac-sha256:" + salt + ":" + digestHex_(bytes);
}

function isHashedPin_(storedPin) {
  var stored = String(storedPin || "");
  return stored.indexOf("sha256:") === 0 || stored.indexOf("hmac-sha256:") === 0;
}

function isCurrentPinHash_(storedPin) {
  return String(storedPin || "").indexOf("hmac-sha256:") === 0;
}

// Length-independent comparison so a wrong PIN cannot be recovered by timing
// the response.
function safeEquals_(a, b) {
  var x = String(a === undefined || a === null ? "" : a);
  var y = String(b === undefined || b === null ? "" : b);
  var diff = x.length ^ y.length;
  var n = Math.max(x.length, y.length);
  for (var i = 0; i < n; i++) {
    diff |= (x.charCodeAt(i) || 0) ^ (y.charCodeAt(i) || 0);
  }
  return diff === 0;
}

function verifyPin_(storedPin, suppliedPin) {
  if (!isHashedPin_(storedPin)) {
    return verifyLegacyPlaintextPin_(storedPin, suppliedPin);
  }
  var parts = String(storedPin).split(":");
  if (parts.length !== 3 || !parts[1] || !/^[a-f0-9]{64}$/i.test(parts[2])) return false;
  if (parts[0] === "hmac-sha256") {
    return safeEquals_(hashPin_(suppliedPin, parts[1]), storedPin);
  }
  if (parts[0] === "sha256") {
    var oldDigest = digestHex_(Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      parts[1] + ":" + String(suppliedPin),
    ));
    return safeEquals_("sha256:" + parts[1] + ":" + oldDigest, storedPin);
  }
  return false;
}

// ---------------- LEGACY PLAINTEXT-PIN MIGRATION (ISOLATED) ----------------
//
// !! DEPRECATED — MIGRATION SUPPORT ONLY !!
// Older accounts may still have a raw PIN or an unkeyed SHA-256 hash in the
// Users sheet. They are upgraded to the keyed format after successful login.
//
// This is the ONLY place in the codebase that may compare against a plaintext
// PIN, it is never called for an already-hashed PIN, and it must be deleted
// together with migrateLegacyPin_() once every legacy account has logged in
// at least once (Users > PIN starts with "hmac-sha256:").
// Do NOT extend, reuse or expose it.

var LEGACY_PLAIN_PIN_MAX_LEN = 64;

function verifyLegacyPlaintextPin_(storedPin, suppliedPin) {
  var stored = String(storedPin === undefined || storedPin === null ? "" : storedPin);
  var supplied = String(suppliedPin === undefined || suppliedPin === null ? "" : suppliedPin);
  if (!stored.length || stored.length > LEGACY_PLAIN_PIN_MAX_LEN) return false;
  return safeEquals_(stored, supplied);
}

// Rewrites one user's PIN cell to the hashed form. Safe to call repeatedly.
// Returns true when a row was actually rewritten.
function migrateLegacyPin_(user, pin) {
  if (!user || user._row === undefined || user._row < 1) return false;
  if (isCurrentPinHash_(user.PIN)) return false;
  try {
    // Hash once and reuse it in memory so verification in this request matches
    // the value written to the Users sheet.
    var hashed = hashPin_(pin);
    getUsersSheet_().getRange(user._row, USER_COL_PIN, 1, 1).setValue(hashed);
    user.PIN = hashed;
    cacheRemove_("user", user.Username);
    logAudit("system", "Legacy PIN hash upgraded", user.Username, "");
    return true;
  } catch (e) {
    // Never fail a successful login because the upgrade write failed.
    return false;
  }
}

// ---------------- SESSIONS (server-side, versioned) ----------------
//
// A session value packs the owner plus the sessionVersion that was current
// when the session was created. Every authenticated request re-reads the user's
// current version and rejects the session when they differ, so bumping the
// version invalidates EVERY existing session of that user at once - including
// ones the client still holds and ones we cannot enumerate server-side.

var SESSION_TTL_SECONDS = 21600;
var SESSION_VALUE_PREFIX = "v2|";
var SESSION_USERNAME_RE = /^[A-Za-z0-9._-]{1,64}$/;

function packSession_(username, version) {
  return SESSION_VALUE_PREFIX + String(version) + "|" + String(username);
}

function unpackSession_(raw) {
  if (!raw || typeof raw !== "string") return null;
  if (raw.indexOf(SESSION_VALUE_PREFIX) !== 0) return null; // legacy/unknown format
  var rest = raw.slice(SESSION_VALUE_PREFIX.length);
  var sep = rest.indexOf("|");
  if (sep === -1) return null;
  var version = Number(rest.slice(0, sep));
  if (!isFinite(version) || version < 0) return null;
  var username = rest.slice(sep + 1);
  if (!SESSION_USERNAME_RE.test(username)) return null;
  return { username: username, version: Math.floor(version) };
}

function getSessionVersion_(user) {
  if (!user) return 0;
  var v = Number(user.SessionVersion);
  return isFinite(v) && v >= 0 ? Math.floor(v) : 0;
}

function createSession_(username, user) {
  var token = Utilities.getUuid() + Utilities.getUuid().replace(/-/g, "");
  var version = user ? getSessionVersion_(user) : getSessionVersion_(getUserRecord_(username));
  CacheService.getScriptCache().put("session:" + token, packSession_(username, version), SESSION_TTL_SECONDS);
  return token;
}

// Single authority for "is this request authenticated?". Never trust a
// client-supplied username; only the token is read from the request.
//
// Returns { ok: true, username, version } or { ok: false, code, message }.
function resolveSession_(token) {
  if (token === undefined || token === null || token === "") {
    return { ok: false, code: ERR.AUTH_REQUIRED, message: "Authentication required. Please log in." };
  }
  if (typeof token !== "string" || !TOKEN_RE.test(token)) {
    return { ok: false, code: ERR.INVALID_SESSION, message: "Invalid session. Please log in again." };
  }
  var raw = CacheService.getScriptCache().get("session:" + token);
  if (raw === null || raw === undefined) {
    return { ok: false, code: ERR.SESSION_EXPIRED, message: "Your session has expired. Please log in again." };
  }
  var session = unpackSession_(raw);
  if (!session) {
    return { ok: false, code: ERR.INVALID_SESSION, message: "Invalid session. Please log in again." };
  }
  var user = getUserRecord_(session.username);
  if (!user) {
    return { ok: false, code: ERR.INVALID_SESSION, message: "Invalid session. Please log in again." };
  }
  if (String(user.Status).toLowerCase() !== "active") {
    return { ok: false, code: ERR.SESSION_EXPIRED, message: "This account is not active. Please contact the administrator." };
  }
  if (getSessionVersion_(user) !== session.version) {
    return { ok: false, code: ERR.SESSION_EXPIRED, message: "Your session has expired. Please log in again." };
  }
  return { ok: true, username: user.Username, version: session.version };
}

// Increments the user's session/security version, which invalidates every
// session created before the change. Call this for ANY security-sensitive
// account change: PIN change/reset, role change, activation/deactivation,
// permission change and wallet-access change.
function bumpSessionVersion_(username, user) {
  var rowIdx = user && user._row ? user._row : findUserRowIndex_(username);
  if (!rowIdx || rowIdx < 1) return 0;
  var next = getSessionVersion_(user) + 1;
  try {
    getUsersSheet_().getRange(rowIdx, USER_COL_SESSION_VERSION, 1, 1).setValue(next);
    if (user) user.SessionVersion = next;
  } catch (e) {
    return 0;
  }
  cacheRemove_("user", username);
  return next;
}

// Bumps the session version on behalf of a security-sensitive mutation and
// turns a failed write into a structured error. A change that could NOT
// invalidate the account's existing sessions (PIN, role, status, permissions,
// wallet access) must never be reported as a clean success, because the old
// sessions would silently keep working. Returns null on success.
function requireSessionBump_(username, user, actionLabel) {
  var next = bumpSessionVersion_(username, user);
  if (next > 0) return null;
  logAudit(
    "system",
    "Session version bump FAILED - existing sessions may still be valid",
    username,
    String(actionLabel || "").slice(0, 200)
  );
  return errCode_(
    ERR.SESSION_INVALIDATION_FAILED,
    "পরিবর্তনটি সম্পন্ন হয়েছে, কিন্তু পুরোনো সেশন বন্ধ করা যায়নি। " +
      "নিরাপত্তার জন্য অনুগ্রহ করে পরে আবার চেষ্টা করুন।"
  );
}

function revokeSession_(token) {
  if (typeof token === "string" && TOKEN_RE.test(token)) {
    var session = unpackSession_(CacheService.getScriptCache().get("session:" + token));
    CacheService.getScriptCache().remove("session:" + token);
    if (session) logAudit(session.username, "Logout", session.username, "");
  }
  return { status: "SUCCESS", message: "লগআউট হয়েছে।" };
}

// ---------------- ATOMIC FAILED-LOGIN COUNTER ----------------
//
// The counter lives in the script cache and is a read-modify-write, so
// concurrent attempts could otherwise all read the same count and race past
// the lockout threshold (or lose increments). Every read-modify-write now runs
// under a script lock, and the threshold check happens inside the same lock as
// the increment, which also closes the check-then-act window.

var MAX_LOGIN_ATTEMPTS = 5;
var LOGIN_LOCKOUT_SECONDS = 900;
var LOGIN_LOCK_WAIT_MS = 15000;

function loginAttemptKey_(username) {
  return "loginfail:" + String(username || "").toLowerCase();
}

function readFailedLoginCount_(username) {
  var raw = CacheService.getScriptCache().get(loginAttemptKey_(username));
  var n = Number(raw || 0);
  return isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

// Runs fn() while holding the script lock. Returns
// { error: <structured error> } when the lock could not be taken.
function withAuthLock_(fn) {
  var lock = LockService.getScriptLock();
  var acquired = false;
  try {
    acquired = lock.tryLock(LOGIN_LOCK_WAIT_MS);
  } catch (e) {
    acquired = false;
  }
  if (!acquired) {
    return { error: errCode_(ERR.INVALID_REQUEST, "Please try again.") };
  }
  try {
    return { value: fn() };
  } finally {
    try { if (lock.hasLock()) lock.releaseLock(); } catch (e2) { /* ignore */ }
  }
}

// Atomically: is the account locked right now? If not, record this failure.
// The count is capped at MAX_LOGIN_ATTEMPTS so it can never be inflated to
// hide a real counter reset, and the lockout window still refreshes on every
// failed attempt (unchanged lockout policy).
function registerFailedLoginAttempt_(username) {
  var res = withAuthLock_(function () {
    var count = readFailedLoginCount_(username);
    var wasLocked = count >= MAX_LOGIN_ATTEMPTS;
    if (!wasLocked) {
      count = Math.min(MAX_LOGIN_ATTEMPTS, count + 1);
      CacheService.getScriptCache().put(loginAttemptKey_(username), String(count), LOGIN_LOCKOUT_SECONDS);
    }
    return { wasLocked: wasLocked, count: count };
  });
  if (res.error) return { wasLocked: true, count: MAX_LOGIN_ATTEMPTS };
  return res.value;
}

function isLoginLocked_(username) {
  return readFailedLoginCount_(username) >= MAX_LOGIN_ATTEMPTS;
}

function clearFailedLogins_(username) {
  CacheService.getScriptCache().remove(loginAttemptKey_(username));
}

// ---------------- AUTHORIZATION ERROR HELPERS ----------------

function permissionDenied_(message) {
  return errCode_(ERR.PERMISSION_DENIED, message || "You do not have permission to perform this action.");
}

function walletAccessDenied_(message) {
  return errCode_(ERR.WALLET_ACCESS_DENIED, message || "You do not have access to this wallet.");
}

function validationError_(message) {
  return errCode_(ERR.VALIDATION_ERROR, message || "Invalid request.");
}
