import type { CarouselDocument, CarouselPage } from "./schema";

export function safeExportName(title: string) {
  return title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "carousel";
}

export async function renderCarouselPage(document: CarouselDocument, page: CarouselPage, format: "image/png" | "image/jpeg" = "image/png", quality = 0.94): Promise<Blob> {
  const canvas = window.document.createElement("canvas");
  canvas.width = document.width;
  canvas.height = document.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas export is unavailable in this browser.");
  context.fillStyle = page.background;
  context.fillRect(0, 0, canvas.width, canvas.height);

  for (const element of page.elements) {
    context.save();
    const centerX = element.x + element.width / 2;
    const centerY = element.y + element.height / 2;
    context.translate(centerX, centerY);
    context.rotate((element.rotation * Math.PI) / 180);

    if (element.type === "shape") {
      context.fillStyle = element.style.backgroundColor ?? "#7057e8";
      const radius = Math.min(element.style.borderRadius ?? 0, element.width / 2, element.height / 2);
      context.beginPath();
      context.roundRect(-element.width / 2, -element.height / 2, element.width, element.height, radius);
      context.fill();
    } else if (element.type === "image") {
      try {
        const image = new window.Image();
        image.src = element.content;
        await image.decode();
        context.drawImage(image, -element.width / 2, -element.height / 2, element.width, element.height);
      } catch {
        context.fillStyle = "#eeeeee";
        context.fillRect(-element.width / 2, -element.height / 2, element.width, element.height);
      }
    } else {
      const fontSize = element.style.fontSize ?? 40;
      context.fillStyle = element.style.color ?? "#171717";
      context.font = `${element.style.fontWeight ?? "normal"} ${fontSize}px ${element.style.fontFamily ?? "Arial"}`;
      context.textAlign = element.style.textAlign ?? "left";
      context.textBaseline = "top";
      const lines: string[] = [];
      let line = "";
      for (const word of element.content.split(/\\s+/)) {
        const candidate = line ? `${line} ${word}` : word;
        if (line && context.measureText(candidate).width > element.width - 20) {
          lines.push(line);
          line = word;
        } else line = candidate;
      }
      if (line) lines.push(line);
      const textX = context.textAlign === "center" ? 0 : context.textAlign === "right" ? element.width / 2 - 10 : -element.width / 2 + 10;
      lines.forEach((textLine, index) => context.fillText(textLine, textX, -element.height / 2 + 8 + index * fontSize * 1.18, element.width - 20));
    }
    context.restore();
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Could not create the export image.")), format, quality);
  });
}
