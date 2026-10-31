import { describe, expect, it } from "vitest";
import { canReadLegacyDraft, getDraftStorageKey } from "./draft-storage";

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
