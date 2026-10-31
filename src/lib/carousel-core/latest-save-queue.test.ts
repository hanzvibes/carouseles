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

  it("continues with the latest snapshot after a save fails", async () => {
    const errors: unknown[] = [];
    const saved: string[] = [];
    const queue = createLatestSaveQueue(
      async (snapshot: string) => {
        if (snapshot === "bad") throw new Error("network");
        saved.push(snapshot);
      },
      (error) => errors.push(error)
    );

    queue.enqueue("bad");
    queue.enqueue("good");

    await vi.waitFor(() => expect(saved).toEqual(["good"]));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(Error);
  });
});
