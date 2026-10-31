import type { CarouselDocument, CarouselElement } from "./schema";

export function sanitizeExportFileName(value: string) {
  const normalized = value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  const slug = normalized.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64);
  return slug || "carouseles";
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character] ?? character);
}

function safeColor(value: string | undefined, fallback: string) {
  if (!value) return fallback;
  const candidate = value.trim();
  return /^(#[\da-f]{3,8}|(?:rgb|rgba|hsl|hsla)\([\d\s.,%+-]+\)|[a-z]{1,24})$/i.test(candidate)
    ? candidate
    : fallback;
}

function safeFontFamily(value: string | undefined, fallback: string) {
  if (!value || value.length > 80 || !/^[a-z\d ,_-]+$/i.test(value)) return fallback;
  return value;
}

function renderElement(element: CarouselElement) {
  const position = `left:${element.x}px;top:${element.y}px;width:${element.width}px;height:${element.height}px;transform:rotate(${element.rotation}deg)`;
  if (element.type === "image") {
    const source = /^(data:image\/(?:png|jpe?g|webp|gif|svg\+xml);|https?:\/\/|blob:)/i.test(element.content)
      ? element.content
      : "";
    return `<div class="element" style="${position}">${source ? `<img src="${escapeHtml(source)}" alt="" />` : ""}</div>`;
  }
  if (element.type === "shape") {
    const background = safeColor(element.style.backgroundColor, "#7057e8");
    const radius = Math.max(0, Math.min(element.style.borderRadius ?? 0, element.width / 2, element.height / 2));
    return `<div class="element shape" style="${position};background:${background};border-radius:${radius}px"></div>`;
  }
  const color = safeColor(element.style.color, "#171717");
  const fontSize = Math.max(1, Math.min(element.style.fontSize ?? 40, 500));
  const fontFamily = safeFontFamily(element.style.fontFamily, "Arial");
  const fontWeight = element.style.fontWeight ?? "normal";
  const textAlign = element.style.textAlign ?? "left";
  return `<div class="element text" style="${position};color:${color};font-size:${fontSize}px;font-family:&quot;${escapeHtml(fontFamily)}&quot;;font-weight:${fontWeight};text-align:${textAlign}">${escapeHtml(element.content)}</div>`;
}

export function buildCarouselPrintHtml(carousel: CarouselDocument) {
  const slides = carousel.pages.map((page, index) => {
    const background = safeColor(page.background, "#ffffff");
    const elements = page.elements.map(renderElement).join("");
    return `<section class="slide" style="background:${background}" aria-label="Slide ${index + 1}">${elements}</section>`;
  }).join("");
  const title = escapeHtml(carousel.title);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title} — PDF export</title>
<style>
@page{size:${carousel.width}px ${carousel.height}px;margin:0}
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.slide{position:relative;width:${carousel.width}px;height:${carousel.height}px;overflow:hidden;break-after:page;page-break-after:always}
.slide:last-of-type{break-after:auto;page-break-after:auto}
.element{position:absolute;transform-origin:center center;overflow:hidden}
.element.text{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.08;padding:5px;display:block}
.element.shape{display:block}
.element img{display:block;width:100%;height:100%;object-fit:cover}
@media screen{body{width:max-content;margin:24px auto}.slide{margin:0 auto 24px;box-shadow:0 8px 32px #0002}}
@media print{html,body{width:${carousel.width}px}.slide{margin:0;box-shadow:none}}
</style>
</head>
<body>
${slides}
<script>
window.addEventListener("load", async () => {
  const images = Array.from(document.images);
  await Promise.all(images.map((image) => image.decode().catch(() => undefined)));
  if (document.fonts && document.fonts.ready) await document.fonts.ready;
  setTimeout(() => window.print(), 250);
});
window.addEventListener("afterprint", () => window.close());
</script>
</body>
</html>`;
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function header(size: number, signature: number) {
  const bytes = new Uint8Array(size);
  new DataView(bytes.buffer).setUint32(0, signature, true);
  return bytes;
}

export async function createZipBlob(files: Array<{ name: string; blob: Blob }>) {
  if (files.length === 0) throw new Error("There are no files to archive.");
  if (files.length > 100) throw new Error("Too many files for one export.");
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let localOffset = 0;

  for (const file of files) {
    const name = file.name.replace(/[/\\\\]/g, "-").slice(0, 120) || "slide.jpg";
    const nameBytes = encoder.encode(name);
    const data = new Uint8Array(await file.blob.arrayBuffer());
    if (data.byteLength > 0xffffffff) throw new Error("An export file is too large.");
    const checksum = crc32(data);

    const local = header(30, 0x04034b50);
    const localView = new DataView(local.buffer);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, 0, true);
    localView.setUint16(12, 0x21, true);
    localView.setUint32(14, checksum, true);
    localView.setUint32(18, data.byteLength, true);
    localView.setUint32(22, data.byteLength, true);
    localView.setUint16(26, nameBytes.length, true);
    localView.setUint16(28, 0, true);
    localParts.push(local, nameBytes, data);

    const central = header(46, 0x02014b50);
    const centralView = new DataView(central.buffer);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, 0, true);
    centralView.setUint16(14, 0x21, true);
    centralView.setUint32(16, checksum, true);
    centralView.setUint32(20, data.byteLength, true);
    centralView.setUint32(24, data.byteLength, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, localOffset, true);
    centralParts.push(central, nameBytes);
    localOffset += local.byteLength + nameBytes.byteLength + data.byteLength;
  }

  const centralSize = centralParts.reduce((total, part) => total + part.byteLength, 0);
  if (localOffset + centralSize > 0xffffffff) throw new Error("The export archive is too large.");
  const end = header(22, 0x06054b50);
  const endView = new DataView(end.buffer);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, localOffset, true);
  endView.setUint16(20, 0, true);

  return new Blob([...localParts, ...centralParts, end], { type: "application/zip" });
}
