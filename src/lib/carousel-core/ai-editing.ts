import { z } from "zod";
import type { CarouselElement } from "./schema";

export const slideEditRequestSchema = z.object({
  instruction: z.string().trim().min(4).max(500),
  elements: z.array(z.object({
    id: z.string().min(1).max(100),
    content: z.string().max(2000)
  }).strict()).min(1).max(20)
}).strict();

export const slideTextEditsSchema = z.object({
  edits: z.array(z.object({
    id: z.string().min(1).max(100),
    content: z.string().trim().min(1).max(2000)
  }).strict()).min(1).max(20)
}).strict();

export type SlideTextEdit = z.infer<typeof slideTextEditsSchema>["edits"][number];

export function applySlideTextEdits(elements: CarouselElement[], edits: SlideTextEdit[]) {
  const textElements = elements.filter((element) => element.type === "text");
  const expectedIds = new Set(textElements.map((element) => element.id));
  const receivedIds = new Set(edits.map((edit) => edit.id));
  if (receivedIds.size !== edits.length || receivedIds.size !== expectedIds.size ||
      [...expectedIds].some((id) => !receivedIds.has(id))) {
    throw new Error("AI edits must match every text element on the selected slide.");
  }
  return elements.map((element) => {
    if (element.type !== "text") return element;
    const edit = edits.find((item) => item.id === element.id);
    return edit ? { ...element, content: edit.content } : element;
  });
}
