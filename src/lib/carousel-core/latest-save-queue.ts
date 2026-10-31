export type LatestSaveQueue<T> = {
  enqueue: (snapshot: T) => void;
};

export function createLatestSaveQueue<T>(
  save: (snapshot: T) => Promise<void>,
  onError: (error: unknown) => void = () => undefined
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

        try {
          await save(snapshot);
        } catch (error) {
          onError(error);
        }
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
