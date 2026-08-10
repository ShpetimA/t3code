import type { ScopedThreadRef } from "@t3tools/contracts";
import { beforeEach, describe, expect, test } from "vitest";

import { findThreadWorkspaceTabGroup, findSurfaceTabs } from "./threadWorkspace";
import { transitionThreadWorkspace, useThreadWorkspaceStore } from "./threadWorkspaceStore";

const THREAD_REF = {
  environmentId: "env-test",
  threadId: "thread-test",
} as ScopedThreadRef;

beforeEach(() => {
  useThreadWorkspaceStore.setState({ byThreadKey: {} });
});

describe("thread workspace lifecycle", () => {
  test("opens a surface catalog entry and placement together", () => {
    const result = transitionThreadWorkspace(THREAD_REF, {
      _tag: "OpenSurface",
      surface: { _tag: "Files" },
      presentation: "preserve-panel",
    });

    expect(result.state.surfaces).toEqual([{ id: "files", kind: "files" }]);
    expect(findSurfaceTabs(result.state, "files")).toHaveLength(1);
  });

  test("keeps a resource until its last copied placement closes", () => {
    const opened = transitionThreadWorkspace(THREAD_REF, {
      _tag: "OpenSurface",
      surface: { _tag: "Files" },
    }).state;
    const tab = findSurfaceTabs(opened, "files")[0]!;
    const paneId = findThreadWorkspaceTabGroup(opened, tab.id)!;
    transitionThreadWorkspace(THREAD_REF, {
      _tag: "SplitTab",
      paneId,
      tabId: tab.id,
      direction: "right",
      mode: "copy",
    });
    const copied = transitionThreadWorkspace(THREAD_REF, {
      _tag: "CloseSurfaceTab",
      paneId,
      tabId: tab.id,
    });

    expect(copied.removedSurfaces).toEqual([]);
    const remaining = findSurfaceTabs(copied.state, "files");
    expect(remaining).toHaveLength(1);
    const lastGroupId = findThreadWorkspaceTabGroup(copied.state, remaining[0]!.id)!;
    const closed = transitionThreadWorkspace(THREAD_REF, {
      _tag: "CloseSurfaceTab",
      paneId: lastGroupId,
      tabId: remaining[0]!.id,
    });

    expect(closed.removedSurfaces).toEqual([{ id: "files", kind: "files" }]);
    expect(closed.state.surfaces).toEqual([]);
  });

  test("reconciles panel closes across every pane", () => {
    const opened = transitionThreadWorkspace(THREAD_REF, {
      _tag: "OpenSurface",
      surface: { _tag: "Diff" },
    }).state;
    const tab = findSurfaceTabs(opened, "diff")[0]!;
    transitionThreadWorkspace(THREAD_REF, {
      _tag: "SplitTab",
      paneId: findThreadWorkspaceTabGroup(opened, tab.id)!,
      tabId: tab.id,
      direction: "down",
      mode: "copy",
    });

    const closed = transitionThreadWorkspace(THREAD_REF, {
      _tag: "CloseSurface",
      surfaceId: "diff",
    });

    expect(closed.removedSurfaces).toEqual([{ id: "diff", kind: "diff" }]);
    expect(findSurfaceTabs(closed.state, "diff")).toEqual([]);
  });

  test("replaces explorer placements explicitly when a file opens", () => {
    const opened = transitionThreadWorkspace(THREAD_REF, {
      _tag: "OpenSurface",
      surface: { _tag: "Files" },
    }).state;
    const filesTab = findSurfaceTabs(opened, "files")[0]!;
    const copied = transitionThreadWorkspace(THREAD_REF, {
      _tag: "SplitTab",
      paneId: findThreadWorkspaceTabGroup(opened, filesTab.id)!,
      tabId: filesTab.id,
      direction: "right",
      mode: "copy",
    }).state;
    const previousTabIds = findSurfaceTabs(copied, "files").map((tab) => tab.id);

    const fileOpened = transitionThreadWorkspace(THREAD_REF, {
      _tag: "OpenSurface",
      surface: { _tag: "File", relativePath: "src/app.ts" },
    }).state;

    expect(findSurfaceTabs(fileOpened, "files")).toEqual([]);
    expect(findSurfaceTabs(fileOpened, "file:src/app.ts").map((tab) => tab.id)).toEqual(
      previousTabIds,
    );
  });

  test("replaces a browser placeholder with the opened session", () => {
    const placeholder = transitionThreadWorkspace(THREAD_REF, {
      _tag: "OpenSurface",
      surface: { _tag: "Browser", tabId: null },
    }).state;
    const placeholderTabId = findSurfaceTabs(placeholder, "browser:new")[0]!.id;

    const opened = transitionThreadWorkspace(THREAD_REF, {
      _tag: "OpenSurface",
      surface: { _tag: "Browser", tabId: "tab-1" },
    }).state;

    expect(findSurfaceTabs(opened, "browser:new")).toEqual([]);
    expect(findSurfaceTabs(opened, "browser:tab-1")[0]?.id).toBe(placeholderTabId);
  });
});
