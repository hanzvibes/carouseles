export type LatestSaveQueue<T> = {
  enqueue: (snapshot: T) => void;
};

export function createLatestSaveQueue<T>(
  save: (snapshot: T) => Promise<void>,
  onError: (error: unknown) => void = () => undefined,
  retryDelaysMs: number[] = [500, 1500]
): LatestSaveQueue<T> {
  let pendingSnapshot = undefined as T;
  let hasPendingSnapshot = false;
  let isSaving = false;

  async function drain() {
    if (isSaving) return;
    isSaving = true;

    try {
      while (hasPendingSnapshot) {
        const snapshot = pendingSnapshot;
        hasPendingSnapshot = false;
        let saved = false;
        let lastError: unknown;

        for (let attempt = 0; attempt <= retryDelaysMs.length; attempt += 1) {
          try {
            await save(snapshot);
            saved = true;
            break;
          } catch (error) {
            lastError = error;
            // A version conflict is not transient: retrying the same stale
            // snapshot cannot succeed and only delays the user's recovery.
            if (error instanceof Error && error.name === "CloudDraftConflictError") break;
            const isLastAttempt = attempt === retryDelaysMs.length;
            if (isLastAttempt || hasPendingSnapshot) break;

            await new Promise<void>((resolve) => {
              setTimeout(resolve, retryDelaysMs[attempt]);
            });
            // A newer snapshot makes retrying this stale version unnecessary.
            if (hasPendingSnapshot) break;
          }
        }

        if (!saved && !hasPendingSnapshot) onError(lastError);
      }
    } finally {
      isSaving = false;
      // A snapshot can be queued after the loop's final check but before cleanup.
      if (hasPendingSnapshot) void drain();
    }
  }

  return {
    enqueue(snapshot) {
      pendingSnapshot = snapshot;
      hasPendingSnapshot = true;
      void drain();
    }
  };
}
