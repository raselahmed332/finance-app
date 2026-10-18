// Small shared helper — builds a CSV file client-side and triggers a download.
// No backend call needed since the data is already loaded in the page. The file
// is delivered through the shared save helper so it also works inside the
// Android/iOS shell (see utils/files.js).
import { saveBlob } from "./files.js";

export function downloadCsv(filename, headers, rows) {
  // CSV cells starting with =, +, @ or a formula-like "-" would be evaluated
  // as formulas when opened in Excel. Neutralize them by prefixing an apostrophe
  // (which Excel interprets literally), while leaving plain numbers untouched.
  const escapeCell = (v) => {
    const s = String(v ?? '');
    const needsDefense = /^[=+@]/.test(s) || (/^-/.test(s) && !/^-?\d+(\.\d+)?$/.test(s));
    const protected_ = needsDefense ? `'${s}` : s;
    return `"${protected_.replace(/"/g, '""')}"`;
  };
  const lines = [headers.map(escapeCell).join(','), ...rows.map(row => row.map(escapeCell).join(','))];
  const csv = lines.join('\n');
  // \uFEFF is UTF-8 Byte Order Mark (BOM), required by Microsoft Excel to open Bengali/Unicode CSV correctly
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  saveBlob(filename, blob);
}
