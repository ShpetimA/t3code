import { describe, expect, test } from "vitest";

import { findEditorGroup, type EditorTabId } from "./editorWorkspace";
import {
  createThreadEditorWorkspace,
  findEditorWorkspaceTabGroup,
  findSurfaceTabs,
  parsePersistedEditorWorkspaceState,
  transitionThreadEditorWorkspace,
} from "./editorWorkspaceStore";

function activeTabId(state: ReturnType<typeof createThreadEditorWorkspace>): EditorTabId | null {
  const group =
    state.workspace.root._tag === "Group"
      ? state.workspace.root
      : state.workspace.root.second._tag === "Group"
        ? state.workspace.root.second
        : null;
  return group?.activeTabId ?? null;
}

describe("thread editor workspace", () => {
  test("starts with the always-on thread tab and opens surfaces in the focused group", () => {
    const state = createThreadEditorWorkspace(["files", "diff"]);
    const group = state.workspace.root;

    expect(group._tag).toBe("Group");
    if (group._tag !== "Group") return;
    expect(group.tabIds.map((tabId) => state.tabsById[tabId]?._tag)).toEqual([
      "Thread",
      "Surface",
      "Surface",
    ]);
    expect(state.tabsById[group.activeTabId ?? ""]).toMatchObject({
      _tag: "Thread",
    });
  });

  test("activates an existing surface and returns to the thread tab", () => {
    const initial = createThreadEditorWorkspace(["files", "diff"]);
    const surfaceActive = transitionThreadEditorWorkspace(initial, {
      _tag: "ActivateSurface",
      surfaceId: "files",
    });
    expect(surfaceActive.tabsById[activeTabId(surfaceActive) ?? ""]).toMatchObject({
      _tag: "Surface",
      surfaceId: "files",
    });
    const threadActive = transitionThreadEditorWorkspace(surfaceActive, { _tag: "ActivateThread" });
    expect(threadActive.tabsById[activeTabId(threadActive) ?? ""]).toMatchObject({
      _tag: "Thread",
    });
  });

  test("opens the same surface once in each focused group", () => {
    const initial = createThreadEditorWorkspace(["files"]);
    const filesTab = findSurfaceTabs(initial, "files")[0]!;
    const rootGroupId = findEditorWorkspaceTabGroup(initial, filesTab.id)!;
    const split = transitionThreadEditorWorkspace(initial, {
      _tag: "SplitTab",
      groupId: rootGroupId,
      tabId: filesTab.id,
      direction: "right",
      mode: "move",
    });
    const threadFocused = transitionThreadEditorWorkspace(split, { _tag: "ActivateThread" });
    const opened = transitionThreadEditorWorkspace(threadFocused, {
      _tag: "OpenSurface",
      surfaceId: "files",
    });
    const reopened = transitionThreadEditorWorkspace(opened, {
      _tag: "OpenSurface",
      surfaceId: "files",
    });
    const filesTabs = findSurfaceTabs(opened, "files");

    expect(filesTabs).toHaveLength(2);
    expect(new Set(filesTabs.map((tab) => findEditorWorkspaceTabGroup(opened, tab.id))).size).toBe(
      2,
    );
    expect(findSurfaceTabs(reopened, "files")).toHaveLength(2);
    expect(reopened.nextId).toBe(opened.nextId);
  });

  test("copies a surface into a new group but keeps the thread singleton", () => {
    const initial = createThreadEditorWorkspace(["file:one.ts"]);
    const surfaceTab = findSurfaceTabs(initial, "file:one.ts")[0]!;
    const groupId = findEditorWorkspaceTabGroup(initial, surfaceTab.id)!;
    const copied = transitionThreadEditorWorkspace(initial, {
      _tag: "SplitTab",
      groupId,
      tabId: surfaceTab.id,
      direction: "right",
      mode: "copy",
    });

    expect(findSurfaceTabs(copied, "file:one.ts")).toHaveLength(2);
    const threadTab = Object.values(initial.tabsById).find((tab) => tab._tag === "Thread")!;
    expect(
      transitionThreadEditorWorkspace(initial, {
        _tag: "SplitTab",
        groupId,
        tabId: threadTab.id,
        direction: "right",
        mode: "copy",
      }),
    ).toBe(initial);
  });

  test("opens an empty split for choosing a new surface", () => {
    const initial = createThreadEditorWorkspace();
    const next = transitionThreadEditorWorkspace(initial, {
      _tag: "SplitGroup",
      groupId: initial.workspace.focusedGroupId,
      direction: "right",
    });
    const focused = findEditorGroup(next.workspace.root, next.workspace.focusedGroupId);

    expect(next.workspace.root._tag).toBe("Split");
    expect(focused).toMatchObject({ tabIds: [], activeTabId: null });
    expect(next.tabsById).toEqual(initial.tabsById);
    expect(next.nextId).toBe(initial.nextId + 2);
  });

  test("moves a surface and prevents moving the only tab from a group", () => {
    const initial = createThreadEditorWorkspace(["files", "diff"]);
    const fileTab = findSurfaceTabs(initial, "files")[0]!;
    const rootGroupId = findEditorWorkspaceTabGroup(initial, fileTab.id)!;
    const moved = transitionThreadEditorWorkspace(initial, {
      _tag: "SplitTab",
      groupId: rootGroupId,
      tabId: fileTab.id,
      direction: "down",
      mode: "move",
    });
    const movedGroupId = findEditorWorkspaceTabGroup(moved, fileTab.id)!;
    const diffTab = findSurfaceTabs(moved, "diff")[0]!;
    const diffMoved = transitionThreadEditorWorkspace(moved, {
      _tag: "SplitTab",
      groupId: movedGroupId,
      tabId: fileTab.id,
      direction: "right",
      mode: "move",
    });

    expect(diffMoved).toBe(moved);
    expect(findEditorWorkspaceTabGroup(moved, diffTab.id)).toBe(rootGroupId);
  });

  test("reorders tabs within one group", () => {
    const initial = createThreadEditorWorkspace(["files", "diff"]);
    const diffTab = findSurfaceTabs(initial, "diff")[0]!;
    const reordered = transitionThreadEditorWorkspace(initial, {
      _tag: "ReorderTab",
      groupId: initial.workspace.focusedGroupId,
      tabId: diffTab.id,
      targetIndex: 1,
    });
    const root = reordered.workspace.root;

    expect(root._tag).toBe("Group");
    if (root._tag !== "Group") return;
    expect(
      root.tabIds.map((tabId) => {
        const tab = reordered.tabsById[tabId];
        return tab?._tag === "Thread" ? "thread" : tab?.surfaceId;
      }),
    ).toEqual(["thread", "diff", "files"]);
  });

  test("keeps the thread tab pinned before reordered surface tabs", () => {
    const initial = createThreadEditorWorkspace(["files", "diff"]);
    const filesTab = findSurfaceTabs(initial, "files")[0]!;
    const threadTab = Object.values(initial.tabsById).find((tab) => tab._tag === "Thread")!;
    const surfaceReordered = transitionThreadEditorWorkspace(initial, {
      _tag: "ReorderTab",
      groupId: initial.workspace.focusedGroupId,
      tabId: filesTab.id,
      targetIndex: 0,
    });
    const threadReordered = transitionThreadEditorWorkspace(surfaceReordered, {
      _tag: "ReorderTab",
      groupId: surfaceReordered.workspace.focusedGroupId,
      tabId: threadTab.id,
      targetIndex: 2,
    });

    expect(
      surfaceReordered.workspace.root._tag === "Group"
        ? surfaceReordered.workspace.root.tabIds
        : [],
    ).toEqual([threadTab.id, filesTab.id, findSurfaceTabs(initial, "diff")[0]!.id]);
    expect(threadReordered).toBe(surfaceReordered);
  });

  test("moves tabs into existing groups without creating another split", () => {
    const initial = createThreadEditorWorkspace(["files", "diff"]);
    const filesTab = findSurfaceTabs(initial, "files")[0]!;
    const sourceGroupId = findEditorWorkspaceTabGroup(initial, filesTab.id)!;
    const split = transitionThreadEditorWorkspace(initial, {
      _tag: "SplitTab",
      groupId: sourceGroupId,
      tabId: filesTab.id,
      direction: "right",
      mode: "move",
    });
    const targetGroupId = findEditorWorkspaceTabGroup(split, filesTab.id)!;
    const diffTab = findSurfaceTabs(split, "diff")[0]!;
    const moved = transitionThreadEditorWorkspace(split, {
      _tag: "MoveTabToGroup",
      sourceGroupId,
      targetGroupId,
      tabId: diffTab.id,
    });
    const targetGroup =
      moved.workspace.root._tag === "Split" && moved.workspace.root.second._tag === "Group"
        ? moved.workspace.root.second
        : null;

    expect(targetGroup?.tabIds.map((tabId) => moved.tabsById[tabId])).toEqual([
      expect.objectContaining({ _tag: "Surface", surfaceId: "files" }),
      expect.objectContaining({ _tag: "Surface", surfaceId: "diff" }),
    ]);
    expect(targetGroup?.activeTabId).toBe(diffTab.id);
  });

  test("moves a tab to a target edge and swaps complete groups", () => {
    const initial = createThreadEditorWorkspace(["files", "diff"]);
    const filesTab = findSurfaceTabs(initial, "files")[0]!;
    const sourceGroupId = findEditorWorkspaceTabGroup(initial, filesTab.id)!;
    const columns = transitionThreadEditorWorkspace(initial, {
      _tag: "SplitTab",
      groupId: sourceGroupId,
      tabId: filesTab.id,
      direction: "right",
      mode: "move",
    });
    const rightGroupId = findEditorWorkspaceTabGroup(columns, filesTab.id)!;
    const diffTab = findSurfaceTabs(columns, "diff")[0]!;
    const splitAtTarget = transitionThreadEditorWorkspace(columns, {
      _tag: "MoveTabToSplit",
      sourceGroupId,
      targetGroupId: rightGroupId,
      tabId: diffTab.id,
      direction: "down",
    });

    expect(findEditorWorkspaceTabGroup(splitAtTarget, diffTab.id)).not.toBe(sourceGroupId);
    expect(splitAtTarget.workspace.focusedGroupId).toBe(
      findEditorWorkspaceTabGroup(splitAtTarget, diffTab.id),
    );

    const swapped = transitionThreadEditorWorkspace(columns, {
      _tag: "SwapGroups",
      sourceGroupId,
      targetGroupId: rightGroupId,
    });
    expect(swapped.workspace.root._tag).toBe("Split");
    if (swapped.workspace.root._tag !== "Split") return;
    expect(
      swapped.workspace.root.first._tag === "Group" ? swapped.workspace.root.first.id : null,
    ).toBe(rightGroupId);
  });

  test("pins the thread first when moving it into an existing group", () => {
    const initial = createThreadEditorWorkspace(["files", "diff"]);
    const filesTab = findSurfaceTabs(initial, "files")[0]!;
    const sourceGroupId = findEditorWorkspaceTabGroup(initial, filesTab.id)!;
    const split = transitionThreadEditorWorkspace(initial, {
      _tag: "SplitTab",
      groupId: sourceGroupId,
      tabId: filesTab.id,
      direction: "right",
      mode: "move",
    });
    const targetGroupId = findEditorWorkspaceTabGroup(split, filesTab.id)!;
    const threadTab = Object.values(split.tabsById).find((tab) => tab._tag === "Thread")!;
    const moved = transitionThreadEditorWorkspace(split, {
      _tag: "MoveTabToGroup",
      sourceGroupId,
      targetGroupId,
      tabId: threadTab.id,
    });
    const targetGroup = findEditorGroup(moved.workspace.root, targetGroupId);

    expect(targetGroup?.tabIds).toEqual([threadTab.id, filesTab.id]);
  });

  test("deduplicates copied surfaces when moving into an existing group", () => {
    const initial = createThreadEditorWorkspace(["files", "diff"]);
    const filesTab = findSurfaceTabs(initial, "files")[0]!;
    const rootGroupId = findEditorWorkspaceTabGroup(initial, filesTab.id)!;
    const split = transitionThreadEditorWorkspace(initial, {
      _tag: "SplitTab",
      groupId: rootGroupId,
      tabId: filesTab.id,
      direction: "right",
      mode: "copy",
    });
    const copiedFilesTab = findSurfaceTabs(split, "files").find((tab) => tab.id !== filesTab.id)!;
    const copiedGroupId = findEditorWorkspaceTabGroup(split, copiedFilesTab.id)!;
    const moved = transitionThreadEditorWorkspace(split, {
      _tag: "MoveTabToGroup",
      sourceGroupId: copiedGroupId,
      targetGroupId: rootGroupId,
      tabId: copiedFilesTab.id,
    });

    expect(findSurfaceTabs(moved, "files")).toHaveLength(1);
    expect(moved.workspace.root._tag).toBe("Group");
  });

  test("closes only one copied view until the last resource tab closes", () => {
    const initial = createThreadEditorWorkspace(["files"]);
    const fileTab = findSurfaceTabs(initial, "files")[0]!;
    const groupId = findEditorWorkspaceTabGroup(initial, fileTab.id)!;
    const copied = transitionThreadEditorWorkspace(initial, {
      _tag: "SplitTab",
      groupId,
      tabId: fileTab.id,
      direction: "right",
      mode: "copy",
    });
    const copiedTab = findSurfaceTabs(copied, "files").find((tab) => tab.id !== fileTab.id)!;
    const copiedGroupId = findEditorWorkspaceTabGroup(copied, copiedTab.id)!;
    const oneClosed = transitionThreadEditorWorkspace(copied, {
      _tag: "CloseSurfaceTab",
      groupId: copiedGroupId,
      tabId: copiedTab.id,
    });
    const allClosed = transitionThreadEditorWorkspace(oneClosed, {
      _tag: "CloseSurfaceTab",
      groupId,
      tabId: fileTab.id,
    });

    expect(findSurfaceTabs(oneClosed, "files")).toHaveLength(1);
    expect(findSurfaceTabs(allClosed, "files")).toHaveLength(0);
    expect(Object.values(allClosed.tabsById)).toEqual([
      expect.objectContaining({ _tag: "Thread" }),
    ]);
  });

  test("keeps the thread tab when closing other, right-side, or all surface tabs", () => {
    const initial = createThreadEditorWorkspace(["files", "diff", "agents"]);
    const groupId = initial.workspace.focusedGroupId;
    const diffTab = findSurfaceTabs(initial, "diff")[0]!;

    expect(
      Object.values(
        transitionThreadEditorWorkspace(initial, {
          _tag: "CloseOtherSurfaceTabs",
          groupId,
          tabId: diffTab.id,
        }).tabsById,
      ).map((tab) => (tab._tag === "Thread" ? "thread" : tab.surfaceId)),
    ).toEqual(["thread", "diff"]);
    expect(
      Object.values(
        transitionThreadEditorWorkspace(initial, {
          _tag: "CloseSurfaceTabsToRight",
          groupId,
          tabId: diffTab.id,
        }).tabsById,
      ).map((tab) => (tab._tag === "Thread" ? "thread" : tab.surfaceId)),
    ).toEqual(["thread", "files", "diff"]);
    expect(
      Object.values(
        transitionThreadEditorWorkspace(initial, {
          _tag: "CloseAllSurfaceTabs",
          groupId,
        }).tabsById,
      ),
    ).toEqual([expect.objectContaining({ _tag: "Thread" })]);
  });

  test("reconciles resources without disturbing existing split placement", () => {
    const initial = createThreadEditorWorkspace(["files"]);
    const fileTab = findSurfaceTabs(initial, "files")[0]!;
    const groupId = findEditorWorkspaceTabGroup(initial, fileTab.id)!;
    const split = transitionThreadEditorWorkspace(initial, {
      _tag: "SplitTab",
      groupId,
      tabId: fileTab.id,
      direction: "right",
      mode: "copy",
    });
    const reconciled = transitionThreadEditorWorkspace(split, {
      _tag: "ReconcileSurfaces",
      surfaceIds: ["files", "diff"],
    });
    const removed = transitionThreadEditorWorkspace(reconciled, {
      _tag: "ReconcileSurfaces",
      surfaceIds: ["diff"],
    });

    expect(findSurfaceTabs(reconciled, "files")).toHaveLength(2);
    expect(findSurfaceTabs(reconciled, "diff")).toHaveLength(1);
    expect(findSurfaceTabs(removed, "files")).toHaveLength(0);
    expect(findSurfaceTabs(removed, "diff")).toHaveLength(1);
  });

  test("applies explicit surface replacements without moving their groups", () => {
    const initial = createThreadEditorWorkspace(["files"]);
    const filesTab = findSurfaceTabs(initial, "files")[0]!;
    const groupId = findEditorWorkspaceTabGroup(initial, filesTab.id)!;
    const split = transitionThreadEditorWorkspace(initial, {
      _tag: "SplitTab",
      groupId,
      tabId: filesTab.id,
      direction: "right",
      mode: "copy",
    });
    const groupsBefore = findSurfaceTabs(split, "files").map((tab) =>
      findEditorWorkspaceTabGroup(split, tab.id),
    );
    const replaced = transitionThreadEditorWorkspace(split, {
      _tag: "ReplaceSurface",
      previousSurfaceId: "files",
      nextSurfaceId: "file:src/app.ts",
    });
    const reconciled = transitionThreadEditorWorkspace(replaced, {
      _tag: "ReconcileSurfaces",
      surfaceIds: ["file:src/app.ts"],
    });

    expect(findSurfaceTabs(reconciled, "files")).toHaveLength(0);
    expect(findSurfaceTabs(reconciled, "file:src/app.ts").map((tab) => tab.id)).toEqual(
      findSurfaceTabs(split, "files").map((tab) => tab.id),
    );
    expect(
      findSurfaceTabs(reconciled, "file:src/app.ts").map((tab) =>
        findEditorWorkspaceTabGroup(reconciled, tab.id),
      ),
    ).toEqual(groupsBefore);
  });

  test("does not infer replacement identity from surface id prefixes", () => {
    const initial = createThreadEditorWorkspace(["files"]);
    const filesTab = findSurfaceTabs(initial, "files")[0]!;
    const reconciled = transitionThreadEditorWorkspace(initial, {
      _tag: "ReconcileSurfaces",
      surfaceIds: ["file:src/app.ts"],
    });

    expect(findSurfaceTabs(reconciled, "file:src/app.ts")[0]?.id).not.toBe(filesTab.id);
  });

  test("parses valid persisted trees and clamps their split ratios", () => {
    const initial = createThreadEditorWorkspace(["files"]);
    const filesTab = findSurfaceTabs(initial, "files")[0]!;
    const groupId = findEditorWorkspaceTabGroup(initial, filesTab.id)!;
    const split = transitionThreadEditorWorkspace(initial, {
      _tag: "SplitTab",
      groupId,
      tabId: filesTab.id,
      direction: "right",
      mode: "copy",
    });
    if (split.workspace.root._tag !== "Split") throw new Error("Expected split workspace");
    const parsed = parsePersistedEditorWorkspaceState({
      byThreadKey: {
        thread: {
          ...split,
          nextId: 1,
          workspace: {
            ...split.workspace,
            maximizedGroupId: groupId,
            root: { ...split.workspace.root, ratio: 5 },
          },
        },
      },
    }).byThreadKey.thread;

    expect(parsed?.workspace.root._tag).toBe("Split");
    expect(parsed?.workspace.root._tag === "Split" ? parsed.workspace.root.ratio : null).toBe(0.9);
    expect(parsed?.tabsById).toEqual(split.tabsById);
    expect(parsed?.nextId).toBeGreaterThan(1);
    expect(parsed?.workspace.maximizedGroupId).toBe(groupId);
  });

  test("drops malformed persisted threads without discarding valid siblings", () => {
    const valid = createThreadEditorWorkspace(["files"]);
    const malformed = {
      ...valid,
      workspace: {
        ...valid.workspace,
        root: {
          ...valid.workspace.root,
          activeTabId: "editor-tab:missing",
        },
      },
    };

    expect(
      Object.keys(
        parsePersistedEditorWorkspaceState({
          byThreadKey: { valid, malformed },
        }).byThreadKey,
      ),
    ).toEqual(["valid"]);
    expect(parsePersistedEditorWorkspaceState(null)).toEqual({ byThreadKey: {} });
  });

  test("loads layouts saved before Focus View existed", () => {
    const valid = createThreadEditorWorkspace(["files"]);
    const parsed = parsePersistedEditorWorkspaceState({
      byThreadKey: {
        legacy: {
          ...valid,
          workspace: {
            root: valid.workspace.root,
            focusedGroupId: valid.workspace.focusedGroupId,
          },
        },
      },
    }).byThreadKey.legacy;

    expect(parsed?.workspace.maximizedGroupId).toBeNull();
  });
});
