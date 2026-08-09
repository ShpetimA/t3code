import { describe, expect, test } from "vitest";

import type { EditorTabId } from "./editorWorkspace";
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
  reconcileThreadEditorWorkspace,
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
});
