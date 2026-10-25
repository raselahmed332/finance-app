// Small shared helper — builds a CSV file client-side and triggers a download.
// No backend call needed since the data is already loaded in the page. The file
// is delivered through the shared save helper so it also works inside the
// Android/iOS shell (see utils/files.js).
import { saveBlob } from "./files.js";

export function escapeCsvCell(value) {
  const text = String(value ?? '');
  const startsWithFormulaAfterControls = /^[\s\u0000-\u001f\u007f]*[=+@-]/.test(text);
  const isPlainNegativeNumber = /^-\d+(\.\d+)?$/.test(text);
  const protectedText = startsWithFormulaAfterControls && !isPlainNegativeNumber
    ? `'${text}`
    : text;
  return `"${protectedText.replace(/"/g, '""')}"`;
}

export function downloadCsv(filename, headers, rows) {
  const lines = [headers.map(escapeCsvCell).join(','), ...rows.map(row => row.map(escapeCsvCell).join(','))];
  const csv = lines.join('\n');
  // \uFEFF is UTF-8 Byte Order Mark (BOM), required by Microsoft Excel to open Bengali/Unicode CSV correctly
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  saveBlob(filename, blob);
}
