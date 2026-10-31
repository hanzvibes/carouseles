import { describe, expect, it } from "vitest";
import { buildGeneratedCarousel, extractGeneratedJson, generatedCarouselSchema, generationRequestSchema } from "./generation";

const request = generationRequestSchema.parse({ prompt: "How to build better habits", slideCount: 3, tone: "educational" });
const generated = generatedCarouselSchema.parse({
  title: "Build Better Habits",
  slides: [
    { headline: "Start smaller than you think", body: "Choose one action you can repeat every day." },
    { headline: "Make it obvious", body: "Put the cue where you can see it." },
    { headline: "Track the repetition", body: "Focus on showing up, not being perfect." }
  ]
});

describe("AI carousel generation", () => {
  it("validates prompt limits and slide count", () => {
    expect(generationRequestSchema.safeParse({ prompt: "short", slideCount: 3 }).success).toBe(false);
    expect(generationRequestSchema.safeParse({ prompt: "A useful carousel topic", slideCount: 11 }).success).toBe(false);
  });
  it("rejects malformed generated slides", () => {
    expect(generatedCarouselSchema.safeParse({ title: "Bad", slides: [{ headline: "", body: "x" }] }).success).toBe(false);
  });
  it("converts validated output into an editable document", () => {
    let id = 0;
    const document = buildGeneratedCarousel(generated, request, () => `id-${++id}`);
    expect(document.pages).toHaveLength(3);
    expect(document.pages[0].elements).toHaveLength(2);
    expect(document.pages[0].elements[0].content).toBe("Start smaller than you think");
    expect(document.pages[2].elements[1].content).toContain("showing up");
  });
  it("extracts JSON from fenced model output", () => {
    expect(extractGeneratedJson('```json\n{"title":"Test"}\n```')).toEqual({ title: "Test" });
  });
});
