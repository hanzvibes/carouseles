import { afterEach, describe, expect, it, vi } from "vitest";

const originalKey = process.env.CAROUSELES_PROVIDER_ENCRYPTION_KEY;

afterEach(() => {
  if (originalKey === undefined) delete process.env.CAROUSELES_PROVIDER_ENCRYPTION_KEY;
  else process.env.CAROUSELES_PROVIDER_ENCRYPTION_KEY = originalKey;
});

describe("provider credential encryption", () => {
  it("encrypts and decrypts an API key without storing plaintext", async () => {
    process.env.CAROUSELES_PROVIDER_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    const { encryptApiKey, decryptApiKey } = await import("./server");
    const encrypted = encryptApiKey("sk-test-secret");
    expect(encrypted.api_key_ciphertext).not.toContain("sk-test-secret");
    expect(decryptApiKey(encrypted)).toBe("sk-test-secret");
  });

  it("rejects an invalid encryption key", async () => {
    process.env.CAROUSELES_PROVIDER_ENCRYPTION_KEY = Buffer.alloc(8).toString("base64");
    const { encryptApiKey } = await import("./server");
    expect(() => encryptApiKey("secret")).toThrow(/32-byte/);
  });
});

describe("provider endpoint validation", () => {
  it("rejects insecure and local endpoints before making a request", async () => {
    const { validateProviderBaseUrl } = await import("./server");
    await expect(validateProviderBaseUrl("http://api.example.com/v1")).rejects.toThrow(/HTTPS/);
    await expect(validateProviderBaseUrl("https://localhost/v1")).rejects.toThrow(/Local and internal/);
    await expect(validateProviderBaseUrl("https://127.0.0.1/v1")).rejects.toThrow(/Private network/);
  });

  it("rejects URL credentials and query parameters", async () => {
    const { validateProviderBaseUrl } = await import("./server");
    await expect(validateProviderBaseUrl("https://user:pass@example.com/v1")).rejects.toThrow(/credentials/);
    await expect(validateProviderBaseUrl("https://example.com/v1?token=x")).rejects.toThrow(/credentials/);
  });
});
