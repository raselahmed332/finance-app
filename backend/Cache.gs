// ---------------- DATA CACHE LAYER ----------------
// CacheService max TTL is 6 hours (21600s). We use 5 minutes for data that
// changes infrequently but must stay reasonably fresh.
var CACHE_TTL = 300; // 5 minutes in seconds
var _userCache = {};  // in-memory cache for warm executions (survives within same instance)
var _cacheKeys = {};  // prefix -> set of script-cache keys we wrote, so a prefix
                      // clear can reach the script cache and not just memory

function cacheKey_(prefix, key) { return prefix + ":" + String(key).toLowerCase(); }

function cacheGet_(prefix, key) {
  var ck = cacheKey_(prefix, key);
  if (_userCache[ck] && (Date.now() - _userCache[ck].ts) < CACHE_TTL * 1000) {
    return _userCache[ck].val;
  }
  try {
    var raw = CacheService.getScriptCache().get(ck);
    if (raw !== null) {
      var val = JSON.parse(raw);
      _userCache[ck] = { val: val, ts: Date.now() };
      // Remember the key even though THIS execution did not write it. A cold
      // execution (the common case for a write) starts with an empty
      // _cacheKeys, so without this a later cacheClear_() could not reach the
      // script-cache entry and the namespace would stay stale for CACHE_TTL.
      if (!_cacheKeys[prefix]) _cacheKeys[prefix] = {};
      _cacheKeys[prefix][ck] = true;
      return val;
    }
  } catch (e) { /* fall through */ }
  return undefined;
}

function cachePut_(prefix, key, val) {
  var ck = cacheKey_(prefix, key);
  _userCache[ck] = { val: val, ts: Date.now() };
  if (!_cacheKeys[prefix]) _cacheKeys[prefix] = {};
  _cacheKeys[prefix][ck] = true;
  try {
    CacheService.getScriptCache().put(ck, JSON.stringify(val), CACHE_TTL);
  } catch (e) { /* storage full — ignore */ }
}

function cacheRemove_(prefix, key) {
  var ck = cacheKey_(prefix, key);
  delete _userCache[ck];
  if (_cacheKeys[prefix]) delete _cacheKeys[prefix][ck];
  try {
    CacheService.getScriptCache().remove(ck);
  } catch (e) { /* ignore */ }
}

// Clears EVERY key of a namespace in BOTH cache layers. The memory layer is
// walked by prefix; the script cache can only be removed key by key, so keys
// are remembered as they are written.
function cacheClear_(prefix) {
  var p = prefix + ":";
  Object.keys(_userCache).forEach(function (k) {
    if (k.indexOf(p) === 0) delete _userCache[k];
  });
  var known = _cacheKeys[prefix] || {};
  Object.keys(known).forEach(function (ck) {
    try { CacheService.getScriptCache().remove(ck); } catch (e) { /* ignore */ }
  });
  delete _cacheKeys[prefix];
}

// A failed compensation can leave a partial write behind, and the message tells
// the user to have an Admin verify the wallet. A cached ledger read would hide
// exactly the row that needs checking, so the named wallets are dropped
// explicitly (works on a cold execution) and the whole namespace is cleared as
// a safety net for wallets we cannot enumerate.
function invalidateLedgersAfterPartialWrite_(walletIds) {
  (walletIds || []).forEach(function (id) {
    if (id !== undefined && id !== null && id !== "") cacheRemove_("txns", "txns_" + id);
  });
  cacheClear_("txns");
}
