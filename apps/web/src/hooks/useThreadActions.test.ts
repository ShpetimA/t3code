import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { shouldNavigateAfterArchive, ThreadArchiveBlockedError } from "./useThreadActions";

describe("ThreadArchiveBlockedError", () => {
  it("keeps the blocked thread context with the fixed message", () => {
    const error = new ThreadArchiveBlockedError({
      environmentId: EnvironmentId.make("environment-1"),
      threadId: ThreadId.make("thread-1"),
    });

    expect(error).toMatchObject({
      environmentId: "environment-1",
      threadId: "thread-1",
    });
    expect(error.message).toBe("Cannot archive a running thread.");
  });
});

describe("shouldNavigateAfterArchive", () => {
  it("keeps the existing active-route behavior by default", () => {
    expect(shouldNavigateAfterArchive(undefined, true)).toBe(true);
    expect(shouldNavigateAfterArchive("new-draft", true)).toBe(true);
  });

  it("lets the tab model own navigation when requested", () => {
    expect(shouldNavigateAfterArchive("preserve", true)).toBe(false);
    expect(shouldNavigateAfterArchive("preserve", false)).toBe(false);
  });

  it("does not navigate when archiving a background route", () => {
    expect(shouldNavigateAfterArchive(undefined, false)).toBe(false);
  });
});
