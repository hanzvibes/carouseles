import { describe, expect, it } from "vitest";
import { canReadLegacyDraft, getDraftStorageKey, getConflictDraftStorageKey, isDraftBasedOnCloud, parseLocalDraft, serializeLocalDraft } from "./draft-storage";

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
    expect(parseLocalDraft(raw, validate)).toEqual({ document: { title: "Latest" }, savedAt: 1_800_000_000_000, baseCloudUpdatedAt: null });
  });
  it("keeps compatibility with legacy plain documents", () => {
    expect(parseLocalDraft(JSON.stringify({ title: "Legacy" }), validate)).toEqual({ document: { title: "Legacy" }, savedAt: null, baseCloudUpdatedAt: null });
  });
  it("tracks the exact cloud version a local draft was based on", () => {
    const raw = serializeLocalDraft({ title: "Offline edit" }, 100, "2026-10-31T10:00:00.000Z");
    const draft = parseLocalDraft(raw, validate)!;
    expect(draft.baseCloudUpdatedAt).toBe("2026-10-31T10:00:00.000Z");
    expect(isDraftBasedOnCloud(draft, "2026-10-31T10:00:00.000Z")).toBe(true);
    expect(isDraftBasedOnCloud(draft, "2026-10-31T10:01:00.000Z")).toBe(false);
    expect(isDraftBasedOnCloud({ ...draft, baseCloudUpdatedAt: null }, "2026-10-31T10:00:00.000Z")).toBe(false);
  });
  it("uses a separate key for a preserved conflict draft", () => {
    expect(getConflictDraftStorageKey("user-a")).toContain("user-a");
    expect(getConflictDraftStorageKey("user-a")).not.toBe(getDraftStorageKey("user-a"));
  });
  it("rejects malformed envelopes and invalid documents", () => {
    expect(parseLocalDraft(JSON.stringify({ format: "carouseles-local-draft", version: 1, savedAt: "later", document: {} }), validate)).toBeNull();
    expect(parseLocalDraft("not-json", validate)).toBeNull();
    expect(parseLocalDraft(JSON.stringify({ nope: true }), validate)).toBeNull();
  });
});
