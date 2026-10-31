export const ANONYMOUS_DRAFT_STORAGE_KEY = "carouseles:local-draft:anonymous:v1";
export const LEGACY_DRAFT_STORAGE_KEY = "carouseles:local-draft:v1";

export function getDraftStorageKey(userId: string | null) {
  return userId
    ? `carouseles:local-draft:user:${userId}:v1`
    : ANONYMOUS_DRAFT_STORAGE_KEY;
}

export function canReadLegacyDraft(userId: string | null) {
  return userId === null;
}


export type LocalDraftSnapshot<T> = { document: T; savedAt: number | null };
const LOCAL_DRAFT_FORMAT = "carouseles-local-draft";

export function serializeLocalDraft<T>(document: T, savedAt = Date.now()) {
  return JSON.stringify({ format: LOCAL_DRAFT_FORMAT, version: 1, savedAt, document });
}

export function parseLocalDraft<T>(raw: string | null, validate: (input: unknown) => T): LocalDraftSnapshot<T> | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && "format" in parsed && parsed.format === LOCAL_DRAFT_FORMAT) {
      if (!("version" in parsed) || parsed.version !== 1 || !("savedAt" in parsed) || typeof parsed.savedAt !== "number" || !Number.isFinite(parsed.savedAt) || !("document" in parsed)) return null;
      return { document: validate(parsed.document), savedAt: parsed.savedAt };
    }
    return { document: validate(parsed), savedAt: null };
  } catch { return null; }
}
