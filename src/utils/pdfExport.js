import { isNative } from "./files.js";

// Add the captured page image to the PDF one page at a time. Long reports
// paginate instead of being squashed onto one sheet. Native WebViews preview the
// page images because they do not reliably render PDF blobs inside an iframe.
async function addCanvasPagesToPdf(pdf, canvas, orientation, makePreview) {
  const isLandscape = orientation === "landscape";
  const pageW = isLandscape ? 297 : 210;
  const pageH = isLandscape ? 210 : 297;
  const margin = 10;
  const usableW = pageW - margin * 2;
  const usableH = pageH - margin * 2;
  const fullImgH = canvas.height * (usableW / canvas.width);
  const previewBlobs = [];
  let pageIndex = 0;

  const addPage = async (page) => {
    if (pageIndex) pdf.addPage();
    pdf.addImage(page, "PNG", margin, margin, usableW, page.height * (usableW / page.width));
    if (makePreview) previewBlobs.push(await canvasToBlob(page));
    pageIndex += 1;
  };

  if (fullImgH <= usableH) {
    await addPage(canvas);
    return previewBlobs;
  }

  const slicePx = Math.max(1, Math.floor(canvas.width * (usableH / usableW)));
  let y = 0;
  while (y < canvas.height) {
    const h = Math.min(slicePx, canvas.height - y);
    const slice = document.createElement("canvas");
    slice.width = canvas.width;
    slice.height = h;
    const ctx = slice.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, slice.width, slice.height);
    ctx.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
    await addPage(slice);
    y += h;
  }
  return previewBlobs;
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Could not create report preview image"));
    }, "image/png");
  });
}

// Capture one DOM element and build a multi-page A4 PDF. Bengali text is
// rasterised by the browser so it keeps its shaping in the exported file.
export async function buildPdfFromElement(element, filename) {
  if (!element) return null;

  const scrollY = window.scrollY;
  const restore = [];
  const patch = (node, style) => {
    restore.push([node, node.getAttribute("style")]);
    Object.assign(node.style, style);
  };
  const scroller = element.querySelector(".report-scroll");
  const table = element.querySelector("table");
  const theads = Array.from(element.querySelectorAll("thead"));
  const noPrints = Array.from(element.querySelectorAll(".no-print"));

  try {
    // Let long tables expand instead of clipping their right-hand columns.
    // Stacked card reports keep their on-screen width (forcing max-content
    // would turn every wrapped paragraph into one unreadably wide line).
    if (table) {
      patch(element, { width: "max-content", maxWidth: "none" });
      patch(table, { width: "max-content", minWidth: "0" });
    }
    if (scroller) patch(scroller, { maxHeight: "none", overflow: "visible", margin: "0" });
    theads.forEach((thead) => patch(thead, { position: "static" }));
    noPrints.forEach((node) => patch(node, { display: "none" }));
    void element.offsetHeight;

    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
      import("html2canvas-pro"),
      import("jspdf"),
    ]);

    const captureW = Math.ceil(element.offsetWidth);
    const captureH = Math.ceil(element.offsetHeight);
    const MAX_AREA = 16000000;
    const scale = Math.max(1, Math.min(2, Math.sqrt(MAX_AREA / Math.max(1, captureW * captureH))));

    const canvas = await html2canvas(element, {
      scale,
      width: captureW,
      height: captureH,
      windowWidth: Math.max(window.innerWidth, captureW + 40),
      windowHeight: Math.max(window.innerHeight, captureH + 40),
      backgroundColor: "#ffffff",
      useCORS: true,
      ignoreElements: (node) => node.classList && node.classList.contains("no-print"),
      onclone: (doc) => { doc.documentElement.classList.remove("dark"); },
    });

    const orientation = canvas.width > canvas.height ? "landscape" : "portrait";
    const pdf = new jsPDF({ orientation, unit: "mm", format: "a4", compress: true });
    const previewBlobs = await addCanvasPagesToPdf(pdf, canvas, orientation, isNative());

    return { blob: pdf.output("blob"), filename, previewBlobs };
  } finally {
    restore.reverse().forEach(([node, previous]) => {
      if (previous === null) node.removeAttribute("style");
      else node.setAttribute("style", previous);
    });
    window.scrollTo(0, scrollY);
  }
}
