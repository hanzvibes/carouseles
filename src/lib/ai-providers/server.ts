import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { ProviderCapabilities } from "@/lib/ai-providers/schema";

export type ProviderRole = "writer" | "planner" | "designer" | "editor" | "vision";
export type ProviderRow = {
  id: string; user_id: string; name: string; provider_type: string; base_url: string;
  api_key_ciphertext: string; api_key_iv: string; api_key_tag: string;
  model_id: string; role: ProviderRole; capabilities: ProviderCapabilities;
  is_default: boolean; created_at: string; updated_at: string;
};

export function getEncryptionKey() {
  const encoded = process.env.CAROUSELES_PROVIDER_ENCRYPTION_KEY;
  if (!encoded) throw new Error("CAROUSELES_PROVIDER_ENCRYPTION_KEY is not configured.");
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) throw new Error("Provider encryption key must be a base64-encoded 32-byte key.");
  return key;
}
export function encryptApiKey(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return { api_key_ciphertext: ciphertext.toString("base64"), api_key_iv: iv.toString("base64"), api_key_tag: cipher.getAuthTag().toString("base64") };
}
export function decryptApiKey(row: Pick<ProviderRow, "api_key_ciphertext" | "api_key_iv" | "api_key_tag">) {
  const decipher = createDecipheriv("aes-256-gcm", getEncryptionKey(), Buffer.from(row.api_key_iv, "base64"));
  decipher.setAuthTag(Buffer.from(row.api_key_tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(row.api_key_ciphertext, "base64")), decipher.final()]).toString("utf8");
}
export async function getUserContext(request: Request): Promise<{ supabase: SupabaseClient; user: User }> {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token) throw new Error("AUTH_REQUIRED");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase environment variables are not configured.");
  const supabase = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
  });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) throw new Error("AUTH_REQUIRED");
  return { supabase, user: data.user };
}
export function publicProvider(row: ProviderRow) {
  return {
    id: row.id, name: row.name, providerType: row.provider_type, baseUrl: row.base_url,
    modelId: row.model_id, role: row.role, capabilities: row.capabilities,
    isDefault: row.is_default, hasApiKey: Boolean(row.api_key_ciphertext),
    createdAt: row.created_at, updatedAt: row.updated_at
  };
}
function isPrivateIpv4(address: string) {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) ||
    (a === 198 && (b === 18 || b === 19));
}
function isPrivateIpv6(address: string) {
  const normalized = address.toLowerCase();
  return normalized === "::1" || normalized === "::" || normalized.startsWith("fc") ||
    normalized.startsWith("fd") || normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") || normalized.startsWith("fea") ||
    normalized.startsWith("feb") || normalized.startsWith("::ffff:127.") ||
    normalized.startsWith("::ffff:10.") || normalized.startsWith("::ffff:192.168.");
}
export async function validateProviderBaseUrl(input: string) {
  let url: URL;
  try { url = new URL(input); } catch { throw new Error("Base URL is not a valid URL."); }
  if (url.protocol !== "https:") throw new Error("Provider endpoints must use HTTPS.");
  if (url.username || url.password || url.search || url.hash) throw new Error("Base URL cannot contain credentials, query parameters, or a fragment.");
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".test")) {
    throw new Error("Local and internal network endpoints are not allowed.");
  }
  const ipVersion = isIP(host);
  if (ipVersion === 4 && isPrivateIpv4(host)) throw new Error("Private network addresses are not allowed.");
  if (ipVersion === 6 && isPrivateIpv6(host)) throw new Error("Private network addresses are not allowed.");
  if (!ipVersion) {
    let addresses: Array<{ address: string; family: number }>;
    try { addresses = await lookup(host, { all: true, verbatim: true }); }
    catch { throw new Error("Provider hostname could not be resolved."); }
    if (!addresses.length || addresses.some((entry) => entry.family === 4 ? isPrivateIpv4(entry.address) : isPrivateIpv6(entry.address))) {
      throw new Error("Provider hostname resolves to a private or reserved network address.");
    }
  }
  url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString().replace(/\/$/, "");
}
export async function callProviderModels(baseUrl: string, apiKey: string) {
  const safeBaseUrl = await validateProviderBaseUrl(baseUrl);
  const response = await fetch(`${safeBaseUrl}/models`, {
    method: "GET", headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    redirect: "error", signal: AbortSignal.timeout(15000), cache: "no-store"
  });
  if (!response.ok) throw new Error(`Provider returned HTTP ${response.status} while listing models.`);
  const payload: unknown = await response.json();
  if (!payload || typeof payload !== "object") throw new Error("Provider returned an invalid models response.");
  const models = (payload as { data?: unknown }).data;
  if (!Array.isArray(models)) throw new Error("Endpoint is reachable, but it did not return an OpenAI-compatible models list.");
  return models.slice(0, 100).flatMap((item) => {
    if (!item || typeof item !== "object" || typeof (item as { id?: unknown }).id !== "string") return [];
    return [(item as { id: string }).id];
  });
}
export async function callProviderChat(baseUrl: string, apiKey: string, modelId: string, messages: Array<{role:string;content:string}>) {
  const safeBaseUrl = await validateProviderBaseUrl(baseUrl);
  const response = await fetch(`${safeBaseUrl}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ model: modelId, messages, temperature: 0.7 }),
    redirect: "error", signal: AbortSignal.timeout(60000), cache: "no-store"
  });
  if (!response.ok) throw new Error(`AI provider returned HTTP ${response.status}.`);
  const payload: unknown = await response.json();
  const content = (payload as { choices?: Array<{ message?: { content?: unknown } }> })?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("Provider response did not contain a text completion.");
  return content;
}
