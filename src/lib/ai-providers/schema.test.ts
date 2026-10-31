import { describe, expect, it } from "vitest";
import { chatRequestSchema, providerInputSchema } from "./schema";

const validProvider = {
  name: "My OpenAI",
  providerType: "openai",
  baseUrl: "https://api.openai.com/v1",
  apiKey: "test-key",
  modelId: "gpt-4o-mini",
  role: "writer",
  capabilities: { text: true, structuredOutput: true, toolCalling: false, vision: false, imageGeneration: false, streaming: false },
  isDefault: true
};

describe("AI provider schemas", () => {
  it("accepts a valid provider configuration", () => {
    expect(providerInputSchema.safeParse(validProvider).success).toBe(true);
  });
  it("rejects an empty model ID", () => {
    expect(providerInputSchema.safeParse({ ...validProvider, modelId: "" }).success).toBe(false);
  });
  it("allows chat routing by assigned role without a provider ID", () => {
    expect(chatRequestSchema.safeParse({ role: "writer", messages: [{ role: "user", content: "Hello" }] }).success).toBe(true);
  });
  it("requires either a provider ID or role", () => {
    expect(chatRequestSchema.safeParse({ messages: [{ role: "user", content: "Hello" }] }).success).toBe(false);
  });
});
