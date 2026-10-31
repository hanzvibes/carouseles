import { describe, expect, it, vi } from "vitest";
import { createLatestSaveQueue } from "./save-queue";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("createLatestSaveQueue", () => {
  it("serializes saves and coalesces pending snapshots to the latest", async () => {
    const firstSave = deferred<void>();
    const saved: number[] = [];
    let active = 0;
    let maxActive = 0;
    const enqueue = createLatestSaveQueue(
      async (value: number) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        if (value === 1) await firstSave.promise;
        saved.push(value);
        active -= 1;
      },
      () => undefined,
      () => undefined
    );

    enqueue(1);
    enqueue(2);
    enqueue(3);
    await Promise.resolve();
    expect(saved).toEqual([]);
    firstSave.resolve();
    await vi.waitFor(() => expect(saved).toEqual([1, 3]));
    expect(maxActive).toBe(1);
  });

  it("continues with the newest snapshot after a failed save", async () => {
    const errors: unknown[] = [];
    const saved: number[] = [];
    const enqueue = createLatestSaveQueue(
      async (value: number) => {
        if (value === 1) throw new Error("network");
        saved.push(value);
      },
      () => undefined,
      (error) => errors.push(error)
    );

    enqueue(1);
    enqueue(2);
    await vi.waitFor(() => expect(saved).toEqual([2]));
    expect(errors).toHaveLength(1);
  });
});
