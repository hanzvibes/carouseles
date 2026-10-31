import { describe, expect, it, vi } from "vitest";
import { createLatestSaveQueue } from "./latest-save-queue";

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("createLatestSaveQueue", () => {
  it("serializes saves and coalesces pending snapshots to the latest one", async () => {
    const firstSave = deferred<void>();
    const started: string[] = [];
    let activeSaves = 0;
    let maxActiveSaves = 0;

    const queue = createLatestSaveQueue(async (snapshot: string) => {
      activeSaves += 1;
      maxActiveSaves = Math.max(maxActiveSaves, activeSaves);
      started.push(snapshot);
      if (snapshot === "first") await firstSave.promise;
      activeSaves -= 1;
    });

    queue.enqueue("first");
    queue.enqueue("outdated");
    queue.enqueue("latest");

    await Promise.resolve();
    expect(started).toEqual(["first"]);
    expect(maxActiveSaves).toBe(1);

    firstSave.resolve();
    await vi.waitFor(() => expect(started).toEqual(["first", "latest"]));
    await vi.waitFor(() => expect(activeSaves).toBe(0));

    expect(maxActiveSaves).toBe(1);
  });

  it("retries a failed snapshot and reports success without requiring another edit", async () => {
    let attempts = 0;
    const errors: unknown[] = [];
    const queue = createLatestSaveQueue(
      async () => {
        attempts += 1;
        if (attempts === 1) throw new Error("temporary network error");
      },
      (error) => errors.push(error),
      [1]
    );

    queue.enqueue("draft");
    await vi.waitFor(() => expect(attempts).toBe(2));
    expect(errors).toHaveLength(0);
  });

  it("reports an error after the bounded retries are exhausted", async () => {
    let attempts = 0;
    const errors: unknown[] = [];
    const queue = createLatestSaveQueue(
      async () => {
        attempts += 1;
        throw new Error("offline");
      },
      (error) => errors.push(error),
      [1, 1]
    );

    queue.enqueue("draft");
    await vi.waitFor(() => expect(errors).toHaveLength(1));
    expect(attempts).toBe(3);
    expect(errors[0]).toBeInstanceOf(Error);
  });

  it("skips retrying a failed snapshot when a newer one is waiting", async () => {
    const firstAttempt = deferred<void>();
    const started: string[] = [];
    const errors: unknown[] = [];
    const queue = createLatestSaveQueue(
      async (snapshot: string) => {
        started.push(snapshot);
        if (snapshot === "old") {
          await firstAttempt.promise;
          throw new Error("stale save failed");
        }
      },
      (error) => errors.push(error),
      [10]
    );

    queue.enqueue("old");
    queue.enqueue("latest");
    firstAttempt.resolve();

    await vi.waitFor(() => expect(started).toEqual(["old", "latest"]));
    expect(errors).toHaveLength(0);
  });
});
