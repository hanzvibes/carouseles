import { describe, expect, it } from "vitest";
import { buildCarouselPrintHtml, createZipBlob, sanitizeExportFileName } from "./export";
import type { CarouselDocument } from "./schema";

const carousel: CarouselDocument = {
  schemaVersion: 1,
  id: "demo",
  title: 'A <test> "carousel"',
  width: 1080,
  height: 1350,
  theme: { name: "Custom", colors: ["#111111", "#ffffff"], fontFamily: "Inter" },
  pages: [
    {
      id: "one",
      name: "Slide 1",
      background: "#ffffff",
      elements: [
        { id: "headline", type: "text", x: 20, y: 30, width: 500, height: 120, rotation: 0, content: "<script>alert(1)</script>", style: { color: "#222222", fontSize: 48 } },
        { id: "image", type: "image", x: 20, y: 180, width: 300, height: 300, rotation: 0, content: "data:image/png;base64,AAAA", style: {} },
        { id: "shape", type: "shape", x: 20, y: 500, width: 100, height: 20, rotation: 0, content: "", style: { backgroundColor: "#ff0000" } }
      ]
    },
    { id: "two", name: "Slide 2", background: "#eeeeee", elements: [] }
  ]
};

describe("carousel export helpers", () => {
  it("creates stable safe filenames", () => {
    expect(sanitizeExportFileName("  Café / My Carousel!! ")).toBe("cafe-my-carousel");
    expect(sanitizeExportFileName("🔥")).toBe("carouseles");
  });

  it("builds print-ready HTML for every slide and escapes user content", () => {
    const html = buildCarouselPrintHtml(carousel);
    expect(html).toContain("@page{size:1080px 1350px;margin:0}");
    expect(html.match(/class="slide"/g)).toHaveLength(2);
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("data:image/png;base64,AAAA");
    expect(html).toContain("break-after:page");
  });

  it("creates a readable ZIP archive containing every named file", async () => {
    const zip = await createZipBlob([
      { name: "slide-01.jpg", blob: new Blob(["first"]) },
      { name: "slide-02.jpg", blob: new Blob(["second"]) }
    ]);
    const bytes = new Uint8Array(await zip.arrayBuffer());
    const signature = new DataView(bytes.buffer).getUint32(0, true);
    expect(signature).toBe(0x04034b50);
    const content = new TextDecoder().decode(bytes);
    expect(content).toContain("slide-01.jpg");
    expect(content).toContain("slide-02.jpg");
    expect(new DataView(bytes.buffer).getUint32(bytes.length - 22, true)).toBe(0x06054b50);
  });

  it("rejects an empty archive", async () => {
    await expect(createZipBlob([])).rejects.toThrow("There are no files");
  });
});
