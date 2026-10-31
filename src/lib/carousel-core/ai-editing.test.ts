import { describe, expect, it } from "vitest";
import { applySlideTextEdits, slideEditRequestSchema, slideTextEditsSchema } from "./ai-editing";
import type { CarouselElement } from "./schema";

const elements: CarouselElement[] = [
  { id: "title", type: "text", x: 10, y: 20, width: 400, height: 100, rotation: 0, content: "Old title", style: { fontSize: 40 } },
  { id: "photo", type: "image", x: 20, y: 150, width: 300, height: 200, rotation: 0, content: "data:image/png;base64,abc", style: {} },
  { id: "divider", type: "shape", x: 10, y: 360, width: 400, height: 8, rotation: 0, content: "", style: { backgroundColor: "#000000" } },
  { id: "body", type: "text", x: 10, y: 400, width: 400, height: 200, rotation: 0, content: "Old body", style: {} }
];

describe("AI slide editing", () => {
  it("validates bounded instructions and text-only payloads", () => {
    expect(slideEditRequestSchema.safeParse({ instruction: "Improve this copy", elements: [{ id: "title", content: "Old title" }] }).success).toBe(true);
    expect(slideEditRequestSchema.safeParse({ instruction: "no", elements: [{ id: "title", content: "Old title" }] }).success).toBe(false);
    expect(slideEditRequestSchema.safeParse({ instruction: "Improve this copy", elements: [{ id: "photo", content: "data:image/png;base64,abc" }] }).success).toBe(true);
  });
  it("rejects duplicate or missing element edits", () => {
    expect(slideTextEditsSchema.safeParse({ edits: [{ id: "title", content: "New title" }, { id: "title", content: "Duplicate" }] }).success).toBe(true);
    expect(() => applySlideTextEdits(elements, [{ id: "title", content: "New title" }])).toThrow(/match every text element/);
    expect(() => applySlideTextEdits(elements, [{ id: "title", content: "A" }, { id: "title", content: "B" }])).toThrow(/match every text element/);
  });
  it("changes only text content and preserves image, shape, IDs and styles", () => {
    const updated = applySlideTextEdits(elements, [
      { id: "title", content: "Sharper title" },
      { id: "body", content: "Clearer body" }
    ]);
    expect(updated[0]).toEqual({ ...elements[0], content: "Sharper title" });
    expect(updated[1]).toEqual(elements[1]);
    expect(updated[2]).toEqual(elements[2]);
    expect(updated[3]).toEqual({ ...elements[3], content: "Clearer body" });
  });
});
