import { z } from "zod";

export const providerRoles = ["writer", "planner", "designer", "editor", "vision"] as const;
export const providerCapabilitiesSchema = z.object({
  text: z.boolean().default(true),
  structuredOutput: z.boolean().default(false),
  toolCalling: z.boolean().default(false),
  vision: z.boolean().default(false),
  imageGeneration: z.boolean().default(false),
  streaming: z.boolean().default(false)
});
export const providerInputSchema = z.object({
  name: z.string().trim().min(1).max(60),
  providerType: z.enum(["openai", "openrouter", "groq", "deepseek", "custom"]),
  baseUrl: z.string().trim().url().max(500),
  apiKey: z.string().trim().max(4096).optional(),
  modelId: z.string().trim().min(1).max(160),
  role: z.enum(providerRoles),
  capabilities: providerCapabilitiesSchema,
  isDefault: z.boolean().default(false)
});
export const chatRequestSchema = z.object({
  providerId: z.string().uuid().optional(),
  role: z.enum(providerRoles).optional(),
  messages: z.array(z.object({
    role: z.enum(["system", "user", "assistant"]),
    content: z.string().min(1).max(20000)
  })).min(1).max(40)
}).refine((value) => value.providerId || value.role, { message: "Choose a provider or AI role." });
export type ProviderInput = z.infer<typeof providerInputSchema>;
export type ProviderCapabilities = z.infer<typeof providerCapabilitiesSchema>;
