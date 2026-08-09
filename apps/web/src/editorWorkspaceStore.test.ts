import { describe, expect, test } from "vitest";

import { findEditorGroup, type EditorTabId } from "./editorWorkspace";
import {
  activateSurfaceWorkspaceTab,
  activateThreadWorkspaceTab,
  closeAllThreadEditorSurfaceTabs,
  closeOtherThreadEditorSurfaceTabs,
  closeThreadEditorSurfaceTab,
  closeThreadEditorSurfaceTabsToRight,
  createThreadEditorWorkspace,
  findEditorWorkspaceTabGroup,
  findSurfaceTabs,
  mergeThreadEditorGroups,
  moveThreadEditorTabToGroup,
  parsePersistedEditorWorkspaceState,
  reconcileThreadEditorWorkspace,
  reorderThreadEditorTab,
  splitThreadEditorTab,
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
    const surfaceActive = activateSurfaceWorkspaceTab(initial, "files");
    expect(surfaceActive.tabsById[activeTabId(surfaceActive) ?? ""]).toMatchObject({
      _tag: "Surface",
      surfaceId: "files",
    });
    const threadActive = activateThreadWorkspaceTab(surfaceActive);
    expect(threadActive.tabsById[activeTabId(threadActive) ?? ""]).toMatchObject({
      _tag: "Thread",
    });
  });

  test("copies a surface into a new group but keeps the thread singleton", () => {
    const initial = createThreadEditorWorkspace(["file:one.ts"]);
    const surfaceTab = findSurfaceTabs(initial, "file:one.ts")[0]!;
    const groupId = findEditorWorkspaceTabGroup(initial, surfaceTab.id)!;
    const copied = splitThreadEditorTab(initial, {
      groupId,
      tabId: surfaceTab.id,
      direction: "right",
      mode: "copy",
    });

    expect(findSurfaceTabs(copied, "file:one.ts")).toHaveLength(2);
    const threadTab = Object.values(initial.tabsById).find((tab) => tab._tag === "Thread")!;
    expect(
      splitThreadEditorTab(initial, {
        groupId,
        tabId: threadTab.id,
        direction: "right",
        mode: "copy",
      }),
    ).toBe(initial);
  });

  test("moves a surface and prevents moving the only tab from a group", () => {
    const initial = createThreadEditorWorkspace(["files", "diff"]);
    const fileTab = findSurfaceTabs(initial, "files")[0]!;
    const rootGroupId = findEditorWorkspaceTabGroup(initial, fileTab.id)!;
    const moved = splitThreadEditorTab(initial, {
      groupId: rootGroupId,
      tabId: fileTab.id,
      direction: "down",
      mode: "move",
    });
    const movedGroupId = findEditorWorkspaceTabGroup(moved, fileTab.id)!;
    const diffTab = findSurfaceTabs(moved, "diff")[0]!;
    const diffMoved = splitThreadEditorTab(moved, {
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
    const reordered = reorderThreadEditorTab(initial, {
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
    const surfaceReordered = reorderThreadEditorTab(initial, {
      groupId: initial.workspace.focusedGroupId,
      tabId: filesTab.id,
      targetIndex: 0,
    });
    const threadReordered = reorderThreadEditorTab(surfaceReordered, {
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
    const split = splitThreadEditorTab(initial, {
      groupId: sourceGroupId,
      tabId: filesTab.id,
      direction: "right",
      mode: "move",
    });
    const targetGroupId = findEditorWorkspaceTabGroup(split, filesTab.id)!;
    const diffTab = findSurfaceTabs(split, "diff")[0]!;
    const moved = moveThreadEditorTabToGroup(split, {
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

  test("pins the thread first when moving it into an existing group", () => {
    const initial = createThreadEditorWorkspace(["files", "diff"]);
    const filesTab = findSurfaceTabs(initial, "files")[0]!;
    const sourceGroupId = findEditorWorkspaceTabGroup(initial, filesTab.id)!;
    const split = splitThreadEditorTab(initial, {
      groupId: sourceGroupId,
      tabId: filesTab.id,
      direction: "right",
      mode: "move",
    });
    const targetGroupId = findEditorWorkspaceTabGroup(split, filesTab.id)!;
    const threadTab = Object.values(split.tabsById).find((tab) => tab._tag === "Thread")!;
    const moved = moveThreadEditorTabToGroup(split, {
      sourceGroupId,
      targetGroupId,
      tabId: threadTab.id,
    });
    const targetGroup = findEditorGroup(moved.workspace.root, targetGroupId);

    expect(targetGroup?.tabIds).toEqual([threadTab.id, filesTab.id]);
  });

  test("pins the thread first when merging its group into another group", () => {
    const initial = createThreadEditorWorkspace(["files", "diff"]);
    const filesTab = findSurfaceTabs(initial, "files")[0]!;
    const sourceGroupId = findEditorWorkspaceTabGroup(initial, filesTab.id)!;
    const split = splitThreadEditorTab(initial, {
      groupId: sourceGroupId,
      tabId: filesTab.id,
      direction: "right",
      mode: "move",
    });
    const targetGroupId = findEditorWorkspaceTabGroup(split, filesTab.id)!;
    const threadTab = Object.values(split.tabsById).find((tab) => tab._tag === "Thread")!;
    const diffTab = findSurfaceTabs(split, "diff")[0]!;
    const merged = mergeThreadEditorGroups(split, { sourceGroupId, targetGroupId });

    expect(findEditorGroup(merged.workspace.root, targetGroupId)?.tabIds).toEqual([
      threadTab.id,
      filesTab.id,
      diffTab.id,
    ]);
  });

  test("deduplicates copied surfaces when moving or merging groups", () => {
    const initial = createThreadEditorWorkspace(["files", "diff"]);
    const filesTab = findSurfaceTabs(initial, "files")[0]!;
    const rootGroupId = findEditorWorkspaceTabGroup(initial, filesTab.id)!;
    const split = splitThreadEditorTab(initial, {
      groupId: rootGroupId,
      tabId: filesTab.id,
      direction: "right",
      mode: "copy",
    });
    const copiedFilesTab = findSurfaceTabs(split, "files").find((tab) => tab.id !== filesTab.id)!;
    const copiedGroupId = findEditorWorkspaceTabGroup(split, copiedFilesTab.id)!;
    const moved = moveThreadEditorTabToGroup(split, {
      sourceGroupId: copiedGroupId,
      targetGroupId: rootGroupId,
      tabId: copiedFilesTab.id,
    });

    expect(findSurfaceTabs(moved, "files")).toHaveLength(1);
    expect(moved.workspace.root._tag).toBe("Group");

    const copiedAgain = splitThreadEditorTab(initial, {
      groupId: rootGroupId,
      tabId: filesTab.id,
      direction: "right",
      mode: "copy",
    });
    const duplicate = findSurfaceTabs(copiedAgain, "files").find((tab) => tab.id !== filesTab.id)!;
    const duplicateGroupId = findEditorWorkspaceTabGroup(copiedAgain, duplicate.id)!;
    const merged = mergeThreadEditorGroups(copiedAgain, {
      sourceGroupId: duplicateGroupId,
      targetGroupId: rootGroupId,
    });

    expect(findSurfaceTabs(merged, "files")).toHaveLength(1);
    expect(merged.workspace.root._tag).toBe("Group");
    if (merged.workspace.root._tag !== "Group") return;
    expect(merged.workspace.root.activeTabId).toBe(filesTab.id);
  });

  test("closes only one copied view until the last resource tab closes", () => {
    const initial = createThreadEditorWorkspace(["files"]);
    const fileTab = findSurfaceTabs(initial, "files")[0]!;
    const groupId = findEditorWorkspaceTabGroup(initial, fileTab.id)!;
    const copied = splitThreadEditorTab(initial, {
      groupId,
      tabId: fileTab.id,
      direction: "right",
      mode: "copy",
    });
    const copiedTab = findSurfaceTabs(copied, "files").find((tab) => tab.id !== fileTab.id)!;
    const copiedGroupId = findEditorWorkspaceTabGroup(copied, copiedTab.id)!;
    const oneClosed = closeThreadEditorSurfaceTab(copied, copiedGroupId, copiedTab.id);
    const allClosed = closeThreadEditorSurfaceTab(oneClosed, groupId, fileTab.id);

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
      Object.values(closeOtherThreadEditorSurfaceTabs(initial, groupId, diffTab.id).tabsById).map(
        (tab) => (tab._tag === "Thread" ? "thread" : tab.surfaceId),
      ),
    ).toEqual(["thread", "diff"]);
    expect(
      Object.values(closeThreadEditorSurfaceTabsToRight(initial, groupId, diffTab.id).tabsById).map(
        (tab) => (tab._tag === "Thread" ? "thread" : tab.surfaceId),
      ),
    ).toEqual(["thread", "files", "diff"]);
    expect(Object.values(closeAllThreadEditorSurfaceTabs(initial, groupId).tabsById)).toEqual([
      expect.objectContaining({ _tag: "Thread" }),
    ]);
  });

  test("reconciles resources without disturbing existing split placement", () => {
    const initial = createThreadEditorWorkspace(["files"]);
    const fileTab = findSurfaceTabs(initial, "files")[0]!;
    const groupId = findEditorWorkspaceTabGroup(initial, fileTab.id)!;
    const split = splitThreadEditorTab(initial, {
      groupId,
      tabId: fileTab.id,
      direction: "right",
      mode: "copy",
    });
    const reconciled = reconcileThreadEditorWorkspace(split, ["files", "diff"]);
    const removed = reconcileThreadEditorWorkspace(reconciled, ["diff"]);

    expect(findSurfaceTabs(reconciled, "files")).toHaveLength(2);
    expect(findSurfaceTabs(reconciled, "diff")).toHaveLength(1);
    expect(findSurfaceTabs(removed, "files")).toHaveLength(0);
    expect(findSurfaceTabs(removed, "diff")).toHaveLength(1);
  });

  test("replaces transient explorer tabs without moving their groups", () => {
    const initial = createThreadEditorWorkspace(["files"]);
    const filesTab = findSurfaceTabs(initial, "files")[0]!;
    const groupId = findEditorWorkspaceTabGroup(initial, filesTab.id)!;
    const split = splitThreadEditorTab(initial, {
      groupId,
      tabId: filesTab.id,
      direction: "right",
      mode: "copy",
    });
    const groupsBefore = findSurfaceTabs(split, "files").map((tab) =>
      findEditorWorkspaceTabGroup(split, tab.id),
    );
    const reconciled = reconcileThreadEditorWorkspace(split, ["file:src/app.ts"]);

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

  test("parses valid persisted trees and clamps their split ratios", () => {
    const initial = createThreadEditorWorkspace(["files"]);
    const filesTab = findSurfaceTabs(initial, "files")[0]!;
    const groupId = findEditorWorkspaceTabGroup(initial, filesTab.id)!;
    const split = splitThreadEditorTab(initial, {
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
