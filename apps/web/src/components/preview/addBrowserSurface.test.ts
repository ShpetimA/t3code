import type { PreviewOpenInput, PreviewSessionSnapshot, ScopedThreadRef } from "@t3tools/contracts";
import { AsyncResult } from "effect/unstable/reactivity";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import {
  applyPreviewServerSnapshot,
  readThreadPreviewState,
  resetPreviewStateForTests,
} from "~/previewStateStore";
import {
  selectThreadWorkspace,
  transitionThreadWorkspace,
  useThreadWorkspaceStore,
} from "~/threadWorkspaceStore";

import { addBrowserSurface } from "./addBrowserSurface";

const threadRef = {
  environmentId: "local" as ScopedThreadRef["environmentId"],
  threadId: "thread-1" as ScopedThreadRef["threadId"],
};

const snapshot = (tabId: string): PreviewSessionSnapshot => ({
  threadId: threadRef.threadId,
  tabId,
  navStatus: { _tag: "Idle" },
  canGoBack: false,
  canGoForward: false,
  updatedAt: `2026-06-18T19:00:0${tabId.at(-1) ?? "0"}.000Z`,
});

beforeEach(() => {
  resetPreviewStateForTests();
  useThreadWorkspaceStore.setState({ byThreadKey: {} });
});

describe("addBrowserSurface", () => {
  it("creates another preview session when a browser tab is already active", async () => {
    const first = snapshot("tab-1");
    const second = snapshot("tab-2");
    applyPreviewServerSnapshot(threadRef, first);
    transitionThreadWorkspace(threadRef, {
      _tag: "OpenSurface",
      surface: { _tag: "Browser", tabId: first.tabId },
    });
    const openPreview = vi.fn(async (_input: PreviewOpenInput) => AsyncResult.success(second));

    await addBrowserSurface({ threadRef, openPreview: ({ input }) => openPreview(input) });

    expect(openPreview).toHaveBeenCalledWith({ threadId: "thread-1" });
    expect(Object.keys(readThreadPreviewState(threadRef).sessions)).toEqual(["tab-1", "tab-2"]);
    const workspace = selectThreadWorkspace(
      useThreadWorkspaceStore.getState().byThreadKey,
      threadRef,
    );
    expect(workspace).not.toBeNull();
    if (!workspace) return;
    expect(workspace.surfaces.map((surface) => surface.id)).toEqual([
      "browser:tab-1",
      "browser:tab-2",
    ]);
  });
});
