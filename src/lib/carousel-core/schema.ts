import { z } from "zod";

export const elementTypeSchema = z.enum(["text", "shape", "image"]);
export const carouselElementSchema = z.object({
  id: z.string().min(1),
  type: elementTypeSchema,
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().positive(),
  height: z.number().positive(),
  rotation: z.number().finite().default(0),
  content: z.string().default(""),
  style: z.object({
    color: z.string().optional(),
    backgroundColor: z.string().optional(),
    fontSize: z.number().positive().optional(),
    fontFamily: z.string().optional(),
    fontWeight: z.enum(["normal", "medium", "bold"]).optional(),
    textAlign: z.enum(["left", "center", "right"]).optional(),
    borderRadius: z.number().nonnegative().optional()
  }).default({})
});

export const carouselPageSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).default("Untitled slide"),
  background: z.string().default("#ffffff"),
  elements: z.array(carouselElementSchema).default([])
});

export const carouselDocumentSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  title: z.string().min(1),
  width: z.number().positive().default(1080),
  height: z.number().positive().default(1350),
  theme: z.object({
    name: z.string().default("Custom"),
    colors: z.array(z.string()).default(["#111111", "#ffffff", "#6d5dfc"]),
    fontFamily: z.string().default("Inter")
  }).default({ name: "Custom", colors: ["#111111", "#ffffff", "#6d5dfc"], fontFamily: "Inter" }),
  pages: z.array(carouselPageSchema).min(1)
});

export type CarouselElement = z.infer<typeof carouselElementSchema>;
export type CarouselPage = z.infer<typeof carouselPageSchema>;
export type CarouselDocument = z.infer<typeof carouselDocumentSchema>;

export function validateCarouselDocument(input: unknown): CarouselDocument {
  return carouselDocumentSchema.parse(input);
}

export function createEmptyCarouselDocument(id = crypto.randomUUID()): CarouselDocument {
  return {
    schemaVersion: 1,
    id,
    title: "Untitled carousel",
    width: 1080,
    height: 1350,
    theme: { name: "Midnight", colors: ["#111111", "#ffffff", "#8b7cff"], fontFamily: "Inter" },
    pages: [{ id: crypto.randomUUID(), name: "Slide 1", background: "#ffffff", elements: [] }]
  };
}