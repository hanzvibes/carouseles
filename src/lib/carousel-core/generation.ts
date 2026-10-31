import { z } from "zod";
import type { CarouselDocument, CarouselElement } from "@/lib/carousel-core/schema";

export const generationRequestSchema = z.object({
  prompt: z.string().trim().min(8).max(2000),
  slideCount: z.number().int().min(3).max(10).default(6),
  tone: z.enum(["educational", "storytelling", "bold", "minimal"]).default("educational"),
  audience: z.string().trim().max(120).default("")
});

export const generatedSlideSchema = z.object({
  headline: z.string().trim().min(2).max(100),
  body: z.string().trim().min(2).max(500),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional()
});
export const generatedCarouselSchema = z.object({
  title: z.string().trim().min(2).max(100),
  slides: z.array(generatedSlideSchema).min(3).max(10)
});
export type GenerationRequest = z.infer<typeof generationRequestSchema>;
export type GeneratedCarousel = z.infer<typeof generatedCarouselSchema>;

function createElementId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `element-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function buildGeneratedCarousel(
  generated: GeneratedCarousel,
  request: GenerationRequest,
  idFactory: () => string = createElementId
): CarouselDocument {
  const palette = ["#17152b", "#f1edff", "#f4eee5", "#eaf1f5", "#f8f5ef"];
  return {
    schemaVersion: 1,
    id: idFactory(),
    title: generated.title,
    width: 1080,
    height: 1350,
    theme: {
      name: request.tone,
      colors: ["#17152b", "#ffffff", "#7865e8"],
      fontFamily: "Manrope"
    },
    pages: generated.slides.map((slide, index) => {
      const headline: CarouselElement = {
        id: idFactory(), type: "text", x: 84, y: 140, width: 912,
        height: index === 0 ? 390 : 300, rotation: 0,
        content: slide.headline,
        style: {
          color: index === 0 ? "#ffffff" : "#17152b",
          fontSize: index === 0 ? 76 : 62,
          fontFamily: "Manrope",
          fontWeight: "bold",
          textAlign: "left"
        }
      };
      const body: CarouselElement = {
        id: idFactory(), type: "text", x: 88, y: index === 0 ? 650 : 570,
        width: 900, height: 510, rotation: 0,
        content: slide.body,
        style: {
          color: index === 0 ? "#e8e5f4" : "#55535d",
          fontSize: 34, fontFamily: "Inter",
          fontWeight: "normal", textAlign: "left"
        }
      };
      return {
        id: idFactory(),
        name: `Slide ${index + 1}`,
        background: slide.background ?? (index === 0 ? "#25213f" : palette[(index % (palette.length - 1)) + 1]),
        elements: [headline, body]
      };
    })
  };
}

export function extractGeneratedJson(content: string): unknown {
  const trimmed = content.trim();
  const withoutFence = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = withoutFence.indexOf("{");
  const end = withoutFence.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("AI response did not contain a JSON carousel.");
  return JSON.parse(withoutFence.slice(start, end + 1)) as unknown;
}
