"use strict";

const crypto = require("node:crypto");

// Minimal Apps Script runtime stubs.
//
// The backend is plain global-scope JS, so it can be loaded into a vm context
// and driven directly. Only the host services the code actually calls are
// emulated here; everything that touches a real spreadsheet is replaced per
// test with a fake, which keeps the suite fast and free of any dependency.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function pad2(n) {
  return String(n).padStart(2, "0");
}

// Supports exactly the patterns the backend asks for.
function formatDate(date, _tz, pattern) {
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  if (pattern === "yyyy-MM-dd") return `${y}-${pad2(m)}-${pad2(day)}`;
  if (pattern === "yyyy-MM") return `${y}-${pad2(m)}`;
  if (pattern === "dd-MMM-yyyy HH:mm") return `${pad2(day)}-${MONTHS[m - 1]}-${y} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  throw new Error("formatDate stub does not support pattern: " + pattern);
}

function createPropertyStore() {
  const data = new Map();
  return {
    getProperty: (k) => (data.has(k) ? data.get(k) : null),
    setProperty: (k, v) => {
      data.set(k, String(v));
    },
    deleteProperty: (k) => {
      data.delete(k);
    },
  };
}

function createCache() {
  const data = new Map();
  return {
    get: (k) => (data.has(k) ? data.get(k) : null),
    put: (k, v, _ttl) => {
      data.set(k, v);
    },
    remove: (k) => {
      data.delete(k);
    },
    removeAll: (k) => {
      data.delete(k);
    },
  };
}

// A sheet that satisfies only the few range operations the code paths under
// test perform. Anything richer would mean re-implementing SpreadsheetApp.
function createSheet(name, rows) {
  const data = (rows || []).map((r) => r.slice());
  const sheet = {
    getName: () => name,
    getLastRow: () => data.length,
    getLastColumn: () => (data.length ? Math.max(...data.map((r) => r.length)) : 0),
    getMaxRows: () => Math.max(data.length, 1),
    appendRow: (row) => {
      data.push(row.slice());
      return sheet;
    },
    getRange: (row, col, numRows, numCols) => {
      const r = numRows == null ? 1 : numRows;
      const c = numCols == null ? 1 : numCols;
      const getValues = () => {
        const out = [];
        for (let i = 0; i < r; i++) {
          const line = [];
          for (let j = 0; j < c; j++) {
            const cell = data[row - 1 + i];
            line.push(cell ? cell[col - 1 + j] : "");
          }
          out.push(line);
        }
        return out;
      };
      return {
        getValues,
        getValue: () => getValues()[0][0],
        setValue: (v) => {
          while (data.length < row) data.push([]);
          if (!data[row - 1]) data[row - 1] = [];
          data[row - 1][col - 1] = v;
          return this;
        },
        setValues: (values) => {
          while (data.length < row + r - 1) data.push([]);
          for (let i = 0; i < r; i++) {
            if (!data[row - 1 + i]) data[row - 1 + i] = [];
            for (let j = 0; j < c; j++) data[row - 1 + i][col - 1 + j] = values[i][j];
          }
          return this;
        },
        setNumberFormat: () => this,
        setFontWeight: () => this,
        clear: () => {
          data.length = 0;
          return this;
        },
        deleteRow: () => this,
        insertRowsBefore: () => this,
      };
    },
    setFrozenRows: () => sheet,
    deleteRow: (rowPosition) => {
      data.splice(rowPosition - 1, 1);
      return sheet;
    },
    deleteRows: (rowPosition, howMany) => {
      data.splice(rowPosition - 1, howMany);
      return sheet;
    },
    // Test-only helpers.
    _rows: () => data,
    _setRows: (rows2) => {
      data.length = 0;
      rows2.forEach((x) => data.push(x.slice()));
    },
  };
  return sheet;
}

function createSpreadsheet(sheets) {
  const map = new Map();
  (sheets || []).forEach((s) => map.set(s.getName(), s));
  const ss = {
    getSheetByName: (n) => map.get(n) || null,
    insertSheet: (n) => {
      const s = createSheet(n, []);
      map.set(n, s);
      return s;
    },
    deleteSheet: (sheet) => {
      map.delete(typeof sheet === "string" ? sheet : sheet.getName());
    },
    getSheets: () => Array.from(map.values()),
  };
  ss._map = map;
  return ss;
}

function baseGlobals(spreadsheet) {
  const lock = {
    hasLock: () => false,
    releaseLock: () => {},
    tryLock: () => true,
    waitLock: () => {},
  };
  const scriptProperties = createPropertyStore();
  const userProperties = createPropertyStore();
  return {
    Utilities: {
      formatDate,
      getUuid: () => "uuid-" + Math.random().toString(16).slice(2),
      DigestAlgorithm: { SHA_256: "sha256" },
      computeDigest: (_algorithm, value) => Array.from(crypto.createHash("sha256").update(String(value)).digest()),
      computeHmacSha256Signature: (value, key) =>
        Array.from(crypto.createHmac("sha256", String(key)).update(String(value)).digest()),
    },
    Session: {
      getScriptTimeZone: () => "Asia/Dhaka",
      getActiveUser: () => null,
      getEffectiveUser: () => ({ getEmail: () => "test@example.com" }),
    },
    CacheService: { getScriptCache: createCache },
    PropertiesService: {
      getScriptProperties: () => scriptProperties,
      getUserProperties: () => userProperties,
    },
    SpreadsheetApp: {
      getActive: () => spreadsheet,
      getActiveSpreadsheet: () => spreadsheet,
      flush: () => {},
    },
    LockService: { getScriptLock: () => lock, getDocumentLock: () => lock },
    Logger: { log: () => {}, info: () => {} },
    HtmlService: { createTemplateFromFile: () => ({ evaluate: () => ({ getContent: () => "" }) }) },
    console,
  };
}

module.exports = { formatDate, createSheet, createSpreadsheet, createCache, createPropertyStore, baseGlobals };
