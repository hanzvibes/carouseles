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

export function getConflictDraftStorageKey(userId: string) {
  return `carouseles:local-draft:conflict:${userId}:v1`;
}


export type LocalDraftSnapshot<T> = { document: T; savedAt: number | null; baseCloudUpdatedAt: string | null };
const LOCAL_DRAFT_FORMAT = "carouseles-local-draft";

export function serializeLocalDraft<T>(document: T, savedAt = Date.now(), baseCloudUpdatedAt: string | null = null) {
  return JSON.stringify({ format: LOCAL_DRAFT_FORMAT, version: 1, savedAt, baseCloudUpdatedAt, document });
}

export function isDraftBasedOnCloud<T>(draft: LocalDraftSnapshot<T>, cloudUpdatedAt: string) {
  return draft.baseCloudUpdatedAt !== null && draft.baseCloudUpdatedAt === cloudUpdatedAt;
}

export function parseLocalDraft<T>(raw: string | null, validate: (input: unknown) => T): LocalDraftSnapshot<T> | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && "format" in parsed && parsed.format === LOCAL_DRAFT_FORMAT) {
      if (!("version" in parsed) || parsed.version !== 1 || !("savedAt" in parsed) || typeof parsed.savedAt !== "number" || !Number.isFinite(parsed.savedAt) || !("document" in parsed)) return null;
      const baseCloudUpdatedAt = "baseCloudUpdatedAt" in parsed && typeof parsed.baseCloudUpdatedAt === "string" ? parsed.baseCloudUpdatedAt : null;
      return { document: validate(parsed.document), savedAt: parsed.savedAt, baseCloudUpdatedAt };
    }
    return { document: validate(parsed), savedAt: null, baseCloudUpdatedAt: null };
  } catch { return null; }
}
