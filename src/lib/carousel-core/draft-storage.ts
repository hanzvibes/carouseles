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
