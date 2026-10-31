import { describe, expect, it } from "vitest";
import {
  carouselDocumentSchema,
  createEmptyCarouselDocument,
  validateCarouselDocument
} from "./schema";

describe("Carousel Core document schema", () => {
  it("creates a valid empty document with one slide", () => {
    const document = createEmptyCarouselDocument("test-document");
    expect(document.pages).toHaveLength(1);
    expect(validateCarouselDocument(document).id).toBe("test-document");
  });

  it("accepts a document with a text element", () => {
    const document = createEmptyCarouselDocument("with-text");
    document.pages[0].elements.push({
      id: "headline",
      type: "text",
      x: 40,
      y: 80,
      width: 900,
      height: 180,
      rotation: 0,
      content: "Hello carousel",
      style: { fontSize: 64, color: "#111111" }
    });
    expect(carouselDocumentSchema.safeParse(document).success).toBe(true);
  });

  it("rejects a document without any pages", () => {
    const document = createEmptyCarouselDocument("no-pages");
    expect(carouselDocumentSchema.safeParse({ ...document, pages: [] }).success).toBe(false);
  });

  it("rejects invalid element geometry", () => {
    const document = createEmptyCarouselDocument("bad-element");
    document.pages[0].elements.push({
      id: "bad",
      type: "shape",
      x: 0,
      y: 0,
      width: -10,
      height: 30,
      rotation: 0,
      content: "",
      style: {}
    });
    expect(carouselDocumentSchema.safeParse(document).success).toBe(false);
  });
});