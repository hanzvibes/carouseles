import { describe, expect, it } from "vitest";
import { createTemplateDocument, applyBrandKit, brandKitSchema } from "./templates";

const idFactory = (() => { let id = 0; return () => `id-${++id}`; })();

describe("carousel templates", () => {
  it("creates schema-valid editable documents for every starter template", () => {
    for (const id of ["editorial", "bold", "minimal"] as const) {
      const document = createTemplateDocument(id, idFactory);
      expect(document.pages).toHaveLength(4);
      expect(document.pages.every((page) => page.elements.length >= 2)).toBe(true);
    }
  });

  it("applies a brand kit across all slides without changing element identity or geometry", () => {
    const document = createTemplateDocument("editorial", idFactory);
    const before = document.pages.flatMap((page) => page.elements);
    const updated = applyBrandKit(document, { name: "My brand", colors: ["#111111", "#eeeeee", "#ff5500"], fontFamily: "Inter" });
    const after = updated.pages.flatMap((page) => page.elements);
    expect(updated.theme.name).toBe("My brand");
    expect(updated.pages[0].background).toBe("#111111");
    expect(updated.pages[1].background).toBe("#eeeeee");
    expect(after.map((item) => item.id)).toEqual(before.map((item) => item.id));
    expect(after.map((item) => [item.x, item.y, item.width, item.height])).toEqual(before.map((item) => [item.x, item.y, item.width, item.height]));
    expect(after.filter((item) => item.type === "text").every((item) => item.style.fontFamily === "Inter")).toBe(true);
  });

  it("rejects invalid brand colors", () => {
    expect(brandKitSchema.safeParse({ name: "Broken", colors: ["red", "#ffffff", "#000000"], fontFamily: "Inter" }).success).toBe(false);
  });
});
