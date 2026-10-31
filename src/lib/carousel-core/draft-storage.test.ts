import { describe, expect, it } from "vitest";
import { canReadLegacyDraft, getDraftStorageKey, parseLocalDraft, serializeLocalDraft } from "./draft-storage";

describe("per-account draft storage", () => {
  it("uses a separate storage key for each authenticated user", () => {
    expect(getDraftStorageKey("user-a")).not.toBe(getDraftStorageKey("user-b"));
  });

  it("never maps an authenticated user to anonymous storage", () => {
    expect(getDraftStorageKey("user-a")).toBe("carouseles:local-draft:user:user-a:v1");
    expect(getDraftStorageKey("user-a")).not.toBe(getDraftStorageKey(null));
  });

  it("allows legacy draft migration only while anonymous", () => {
    expect(canReadLegacyDraft(null)).toBe(true);
    expect(canReadLegacyDraft("user-a")).toBe(false);
  });
});


describe("local draft snapshots", () => {
  const validate = (value: unknown) => {
    if (!value || typeof value !== "object" || !("title" in value)) throw new Error("Invalid draft");
    return value as { title: string };
  };
  it("round-trips a timestamped draft", () => {
    const raw = serializeLocalDraft({ title: "Latest" }, 1_800_000_000_000);
    expect(parseLocalDraft(raw, validate)).toEqual({ document: { title: "Latest" }, savedAt: 1_800_000_000_000 });
  });
  it("keeps compatibility with legacy plain documents", () => {
    expect(parseLocalDraft(JSON.stringify({ title: "Legacy" }), validate)).toEqual({ document: { title: "Legacy" }, savedAt: null });
  });
  it("rejects malformed envelopes and invalid documents", () => {
    expect(parseLocalDraft(JSON.stringify({ format: "carouseles-local-draft", version: 1, savedAt: "later", document: {} }), validate)).toBeNull();
    expect(parseLocalDraft("not-json", validate)).toBeNull();
    expect(parseLocalDraft(JSON.stringify({ nope: true }), validate)).toBeNull();
  });
});
