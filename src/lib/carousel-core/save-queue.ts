export function createLatestSaveQueue<T>(
  save: (value: T) => Promise<void>,
  onSaved: () => void,
  onError: (error: unknown) => void
) {
  let pending: T | null = null;
  let running = false;

  async function drain() {
    if (running) return;
    running = true;
    try {
      while (pending !== null) {
        const current = pending;
        pending = null;
        try {
          await save(current);
          onSaved();
        } catch (error) {
          onError(error);
        }
      }
    } finally {
      running = false;
      if (pending !== null) void drain();
    }
  }

  return (value: T) => {
    pending = value;
    void drain();
  };
}
