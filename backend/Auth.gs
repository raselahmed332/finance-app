// ---------------- AUTH ----------------
//
// Session creation/validation/revocation, the login lockout policy and the
// (isolated) legacy plaintext-PIN upgrade all live in Security.gs. This file
// only orchestrates the login flow.

var LOGIN_FAILED_MESSAGE = "অবৈধ ইউজারনেম বা পিন!";
var LOGIN_LOCKED_MESSAGE = "অনেকবার ভুল চেষ্টার কারণে এই একাউন্ট সাময়িকভাবে বন্ধ। ১৫ মিনিট পর আবার চেষ্টা করুন।";

function loginUser(username, pin_) {
  setupDatabase();

  // Fast pre-check. The authoritative, atomic check happens inside
  // registerFailedLoginAttempt_() below; this read only avoids doing the sheet
  // lookup for an account that is already locked out.
  if (isLoginLocked_(username)) {
    return errCode_(ERR.VALIDATION_ERROR, LOGIN_LOCKED_MESSAGE);
  }

  var user = getUserRecord_(username);
  // The PIN is normalized exactly the way every write path normalizes it
  // (addUser / resetPin / updateUserProfile all hash the trimmed value), so a
  // credential never depends on stray spaces: the same PIN opens the app
  // whether it was set by an Admin, by the owner, or upgraded from a legacy
  // plaintext row. The LENGTH rule is deliberately not applied here - an old
  // weak PIN must still be able to sign in, otherwise the owner could never
  // replace it.
  var pin = typeof pin_ === "string" ? pin_.trim() : pin_;
  if (!user || !verifyPin_(user.PIN, pin) || String(user.Status).toLowerCase() !== "active") {
    // Only count failures for accounts that actually exist - otherwise an
    // attacker could lock out arbitrary (or mistyped) usernames for free.
    // For a real account the counter is read-modify-written under a script
    // lock, so simultaneous attempts cannot corrupt or slip past the limit.
    if (user) {
      var attempt = registerFailedLoginAttempt_(user.Username);
      if (attempt.wasLocked) return errCode_(ERR.VALIDATION_ERROR, LOGIN_LOCKED_MESSAGE);
    }
    // The audit row records the username only - never the supplied PIN.
    logAudit(user ? user.Username : String(username || ""), "Login failed", String(username || ""), "");
    return errCode_(ERR.VALIDATION_ERROR, LOGIN_FAILED_MESSAGE);
  }

  clearFailedLogins_(user.Username);

  // Legacy plaintext and unkeyed SHA-256 hashes are upgraded after successful
  // authentication; current keyed hashes are left unchanged.
  migrateLegacyPin_(user, pin);

  logAudit(user.Username, "Login success", user.Username, "");
  return {
    status: "SUCCESS",
    user: publicUser_(user),
    token: createSession_(user.Username, user),
  };
}

// Re-checks a stored token and returns the authoritative user/permission
// payload straight from the backend. This is what the app calls on startup so
// a stale client-side "user" object can never be treated as proof of login.
function validateSession(token) {
  setupDatabase();
  var session = resolveSession_(token);
  if (!session.ok) return { status: "ERROR", code: session.code, message: session.message };

  var user = getUserRecord_(session.username);
  if (!user) return errCode_(ERR.INVALID_SESSION, "Invalid session. Please log in again.");

  return { status: "SUCCESS", user: publicUser_(user) };
}
