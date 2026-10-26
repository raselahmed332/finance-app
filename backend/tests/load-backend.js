"use strict";

// Loads every backend .gs file into a single vm context, exactly the way the
// Apps Script runtime does: one shared global scope, no modules, no exports.
// Tests then override individual globals (the sheet readers, the user store)
// to drive a single function under test.

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { createSpreadsheet, baseGlobals } = require("./stubs");

const BACKEND_DIR = path.resolve(__dirname, "..");

// Order does not matter (Apps Script hoists), but a stable, alphabetical list
// keeps the evaluated code identical from run to run.
const FILES = fs
  .readdirSync(BACKEND_DIR)
  .filter((f) => f.endsWith(".gs"))
  .sort();

function collectFunctionNames(sources) {
  const names = new Set();
  for (const src of sources) {
    const re = /^function\s+([A-Za-z0-9_$]+)\s*\(/gm;
    let m;
    while ((m = re.exec(src)) !== null) names.add(m[1]);
  }
  return Array.from(names);
}

function loadBackend(options) {
  const opts = options || {};
  const spreadsheet = createSpreadsheet(opts.sheets || []);
  const sandbox = Object.assign(baseGlobals(spreadsheet), opts.globals || {});
  const context = vm.createContext(sandbox);

  const sources = FILES.map((file) => ({
    file,
    code: fs.readFileSync(path.join(BACKEND_DIR, file), "utf8"),
  }));

  // Apps Script parses every file before any of them runs, so a function from a
  // later file is already defined when an earlier file's top-level code
  // references it (Code.gs builds an ALLOWED_ACTIONS map of handlers that live
  // in Loans.gs / Users.gs / ...). Reproduce that by pre-seeding every function
  // name with a late-binding forwarder that resolves the real implementation on
  // the context at call time. The forwarders are then overwritten by the real
  // definitions as each file is evaluated, but anything that already captured
  // one still dispatches correctly.
  const forwarders = {};
  for (const name of collectFunctionNames(sources.map((s) => s.code))) {
    forwarders[name] = function () {
      const real = context[name];
      if (typeof real !== "function") throw new Error("unresolved backend function: " + name);
      return real.apply(this, arguments);
    };
  }
  Object.assign(sandbox, forwarders);

  // Files are evaluated to a fixed point rather than in a fixed order. Apps
  // Script treats all .gs files as one program, so a top-level `var` in one
  // file may be read by another file's top-level initialiser (Currencies.gs
  // reads MONEY_DECIMALS from Money.gs, Database.gs reads
  // MAX_TRANSACTION_AMOUNT). Evaluating a file has no side effects - only
  // declarations - so re-running it is idempotent, and a file that failed only
  // because a dependency was not ready yet will succeed on a later pass.
  let lastError = null;
  let previousFailures = Infinity;
  let loaded = false;
  for (let pass = 0; pass < 8; pass++) {
    const failures = [];
    let passError = null;
    for (const { file, code } of sources) {
      try {
        vm.runInContext(code, context, { filename: file });
      } catch (err) {
        failures.push(file);
        passError = err;
      }
    }
    if (failures.length === 0) {
      loaded = true;
      break;
    }
    lastError = passError;
    if (failures.length >= previousFailures) break;
    previousFailures = failures.length;
  }
  if (!loaded) {
    const err = new Error("failed to load backend: " + (lastError ? lastError.message : "unknown"));
    err.cause = lastError;
    throw err;
  }
  return context;
}

module.exports = { loadBackend, FILES };
