import { describe, expect, it } from "vite-plus/test";

import { TerminalInputWriter } from "./inputWriter";

interface Deferred {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
  readonly reject: (cause: unknown) => void;
}

function deferred(): Deferred {
  let resolvePromise: (() => void) | undefined;
  let rejectPromise: ((cause: unknown) => void) | undefined;
  const promise = new Promise<void>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return {
    promise,
    resolve: () => resolvePromise?.(),
    reject: (cause) => rejectPromise?.(cause),
  };
}

async function nextDrainTurn(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("TerminalInputWriter", () => {
  it("keeps Enter behind preceding input and coalesces while a write is active", async () => {
    const firstWrite = deferred();
    const writes: string[] = [];
    const writer = new TerminalInputWriter({
      send: (data) => {
        writes.push(data);
        return writes.length === 1 ? firstWrite.promise : Promise.resolve();
      },
      onError: () => {},
    });

    writer.write("vp");
    writer.write(" run dev");
    writer.write("\r");

    expect(writes).toEqual(["vp"]);
    firstWrite.resolve();
    await nextDrainTurn();

    expect(writes).toEqual(["vp", " run dev\r"]);
  });

  it("continues with pending input after a failed write", async () => {
    const firstWrite = deferred();
    const writes: string[] = [];
    const errors: unknown[] = [];
    const writer = new TerminalInputWriter({
      send: (data) => {
        writes.push(data);
        return writes.length === 1 ? firstWrite.promise : Promise.resolve();
      },
      onError: (cause) => errors.push(cause),
    });
    const failure = new Error("connection lost");

    writer.write("a");
    writer.write("b\r");
    firstWrite.reject(failure);
    await nextDrainTurn();

    expect(errors).toEqual([failure]);
    expect(writes).toEqual(["a", "b\r"]);
  });

  it("finishes accepted input after disposal and ignores later writes", async () => {
    const firstWrite = deferred();
    const writes: string[] = [];
    const writer = new TerminalInputWriter({
      send: (data) => {
        writes.push(data);
        return writes.length === 1 ? firstWrite.promise : Promise.resolve();
      },
      onError: () => {},
    });

    writer.write("accepted");
    writer.write("\r");
    writer.dispose();
    writer.write("ignored");
    firstWrite.resolve();
    await nextDrainTurn();

    expect(writes).toEqual(["accepted", "\r"]);
  });

  it("keeps every batch within the terminal wire limit without splitting Unicode", async () => {
    const writes: string[] = [];
    const writer = new TerminalInputWriter({
      send: (data) => {
        writes.push(data);
        return Promise.resolve();
      },
      onError: () => {},
    });
    const data = `${"x".repeat(65_535)}😀tail`;

    writer.write(data);
    await nextDrainTurn();

    expect(writes.map((write) => write.length)).toEqual([65_535, 6]);
    expect(writes.join("")).toBe(data);
  });
});
