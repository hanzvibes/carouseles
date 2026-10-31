import type { CarouselDocument, CarouselElement } from "./schema";
import { validateCarouselDocument } from "./schema";
import { z } from "zod";

export const brandKitSchema = z.object({
  name: z.string().trim().min(1).max(40),
  colors: z.tuple([
    z.string().regex(/^#[0-9a-fA-F]{6}$/),
    z.string().regex(/^#[0-9a-fA-F]{6}$/),
    z.string().regex(/^#[0-9a-fA-F]{6}$/)
  ]),
  fontFamily: z.enum(["Manrope", "Inter", "DM Sans", "Georgia"])
});
export type BrandKit = z.infer<typeof brandKitSchema>;

export const templateIds = ["editorial", "bold", "minimal"] as const;
export type TemplateId = typeof templateIds[number];
export const carouselTemplates: { id: TemplateId; name: string; description: string; colors: string[] }[] = [
  { id: "editorial", name: "Editorial", description: "Clean storytelling with a magazine feel.", colors: ["#20201f", "#f3efe7", "#b56d4b"] },
  { id: "bold", name: "Bold statement", description: "High contrast for strong opinions and hooks.", colors: ["#171717", "#f5f0e8", "#f05b35"] },
  { id: "minimal", name: "Minimal notes", description: "Quiet layouts with generous breathing room.", colors: ["#293b35", "#f2f5ef", "#8ba99a"] }
];

function makeId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `template-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function createTemplateDocument(templateId: TemplateId, idFactory: () => string = makeId): CarouselDocument {
  const template = carouselTemplates.find((item) => item.id === templateId) ?? carouselTemplates[0];
  const [ink, paper, accent] = template.colors;
  const makeText = (content: string, y: number, size: number, color: string, weight: CarouselElement["style"]["fontWeight"] = "normal"): CarouselElement => ({
    id: idFactory(), type: "text", x: 86, y, width: 908, height: size > 60 ? 430 : 390,
    rotation: 0, content, style: { color, fontSize: size, fontFamily: "Manrope", fontWeight: weight, textAlign: "left" }
  });
  const slides = [
    { name: "Cover", background: ink, headline: "A better way to share ideas", body: "A clear point of view deserves a thoughtful design." },
    { name: "The insight", background: paper, headline: "Start with one useful insight.", body: "Give every slide one job. Make it easy to understand, remember, and share." },
    { name: "The takeaway", background: paper, headline: "Make the message stick.", body: "Use a strong headline, supporting detail, and a visual rhythm that feels consistent." },
    { name: "Closing", background: accent, headline: "Your next idea starts here.", body: "Save this for later · Share it with someone who needs it." }
  ];
  return validateCarouselDocument({
    schemaVersion: 1, id: idFactory(), title: `${template.name} carousel`, width: 1080, height: 1350,
    theme: { name: template.name, colors: template.colors, fontFamily: "Manrope" },
    pages: slides.map((slide, index) => ({
      id: idFactory(), name: slide.name, background: slide.background,
      elements: [
        makeText(slide.headline, index === 0 ? 250 : 190, index === 0 ? 82 : 68, index === 0 ? paper : ink, "bold"),
        makeText(slide.body, 760, 34, index === 0 ? "#e8e5df" : ink),
        ...(index === 0 ? [{ id: idFactory(), type: "shape" as const, x: 86, y: 120, width: 95, height: 12, rotation: 0, content: "", style: { backgroundColor: accent, borderRadius: 6 } }] : [])
      ]
    }))
  });
}

export function applyBrandKit(document: CarouselDocument, input: BrandKit): CarouselDocument {
  const kit = brandKitSchema.parse(input);
  const [ink, paper, accent] = kit.colors;
  return {
    ...document,
    theme: { name: kit.name, colors: [...kit.colors], fontFamily: kit.fontFamily },
    pages: document.pages.map((page, pageIndex) => ({
      ...page,
      background: pageIndex === 0 ? ink : paper,
      elements: page.elements.map((element) => {
        if (element.type === "shape") {
          return { ...element, style: { ...element.style, backgroundColor: accent } };
        }
        if (element.type === "text") {
          return {
            ...element,
            style: {
              ...element.style,
              fontFamily: kit.fontFamily,
              color: pageIndex === 0 ? paper : element.style.fontWeight === "bold" ? ink : "#555555"
            }
          };
        }
        return element;
      })
    }))
  };
}
