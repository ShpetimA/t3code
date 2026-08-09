import type { ScopedThreadRef } from "@t3tools/contracts";
import { beforeEach, describe, expect, test } from "vitest";

import {
  findEditorWorkspaceTabGroup,
  findSurfaceTabs,
  useEditorWorkspaceStore,
} from "./editorWorkspaceStore";
import { useRightPanelStore } from "./rightPanelStore";
import { transitionThreadWorkspace } from "./threadWorkspace";

const THREAD_REF = {
  environmentId: "env-test",
  threadId: "thread-test",
} as ScopedThreadRef;

beforeEach(() => {
  useEditorWorkspaceStore.setState({ byThreadKey: {} });
  useRightPanelStore.setState({ byThreadKey: {} });
});

describe("thread workspace lifecycle", () => {
  test("opens a surface catalog entry and placement together", () => {
    const result = transitionThreadWorkspace(THREAD_REF, {
      _tag: "OpenSurface",
      surface: { _tag: "Files" },
      presentation: "preserve-panel",
    });

    expect(result.rightPanel.surfaces).toEqual([{ id: "files", kind: "files" }]);
    expect(findSurfaceTabs(result.editorWorkspace!, "files")).toHaveLength(1);
  });

  test("keeps a resource until its last copied placement closes", () => {
    const opened = transitionThreadWorkspace(THREAD_REF, {
      _tag: "OpenSurface",
      surface: { _tag: "Files" },
    }).editorWorkspace!;
    const tab = findSurfaceTabs(opened, "files")[0]!;
    const groupId = findEditorWorkspaceTabGroup(opened, tab.id)!;
    transitionThreadWorkspace(THREAD_REF, {
      _tag: "ApplyEditorTransition",
      transition: {
        _tag: "SplitTab",
        groupId,
        tabId: tab.id,
        direction: "right",
        mode: "copy",
      },
    });
    const copied = transitionThreadWorkspace(THREAD_REF, {
      _tag: "ApplyEditorTransition",
      transition: {
        _tag: "CloseSurfaceTab",
        groupId,
        tabId: tab.id,
      },
    });

    expect(copied.removedSurfaces).toEqual([]);
    const remaining = findSurfaceTabs(copied.editorWorkspace!, "files");
    expect(remaining).toHaveLength(1);
    const lastGroupId = findEditorWorkspaceTabGroup(copied.editorWorkspace!, remaining[0]!.id)!;
    const closed = transitionThreadWorkspace(THREAD_REF, {
      _tag: "ApplyEditorTransition",
      transition: {
        _tag: "CloseSurfaceTab",
        groupId: lastGroupId,
        tabId: remaining[0]!.id,
      },
    });

    expect(closed.removedSurfaces).toEqual([{ id: "files", kind: "files" }]);
    expect(closed.rightPanel.surfaces).toEqual([]);
  });

  test("reconciles panel closes across every editor group", () => {
    const opened = transitionThreadWorkspace(THREAD_REF, {
      _tag: "OpenSurface",
      surface: { _tag: "Diff" },
    }).editorWorkspace!;
    const tab = findSurfaceTabs(opened, "diff")[0]!;
    transitionThreadWorkspace(THREAD_REF, {
      _tag: "ApplyEditorTransition",
      transition: {
        _tag: "SplitTab",
        groupId: findEditorWorkspaceTabGroup(opened, tab.id)!,
        tabId: tab.id,
        direction: "down",
        mode: "copy",
      },
    });

    const closed = transitionThreadWorkspace(THREAD_REF, {
      _tag: "CloseSurface",
      surfaceId: "diff",
    });

    expect(closed.removedSurfaces).toEqual([{ id: "diff", kind: "diff" }]);
    expect(findSurfaceTabs(closed.editorWorkspace!, "diff")).toEqual([]);
  });
});
