import { describe, expect, test } from "vitest";

import {
  activateEditorTab,
  closeAllEditorTabs,
  closeEditorTab,
  closeEditorTabsToRight,
  closeOtherEditorTabs,
  createEditorWorkspace,
  findAdjacentEditorGroups,
  findEditorGroup,
  findTopRightEditorGroup,
  getTopEditorGroups,
  getVisibleEditorWorkspaceRoot,
  focusEditorGroup,
  getEditorGroups,
  mergeEditorGroups,
  moveEditorTabToGroup,
  openEditorTab,
  reorderEditorTab,
  resizeEditorSplit,
  splitEditorTab,
  toggleMaximizedEditorGroup,
  type EditorGroupId,
  type EditorSplitId,
  type EditorTabId,
} from "./editorWorkspace";

const group = (value: string) => `editor-group:${value}` as EditorGroupId;
const split = (value: string) => `editor-split:${value}` as EditorSplitId;
const tab = (value: string) => `editor-tab:${value}` as EditorTabId;

describe("editor workspace", () => {
  test("opens tabs in the focused group and activates existing tabs", () => {
    const initial = createEditorWorkspace({ groupId: group("one"), tabIds: [tab("thread")] });
    const opened = openEditorTab(initial, tab("file"));
    const activated = activateEditorTab(opened, group("one"), tab("thread"));

    expect(findEditorGroup(activated.root, group("one"))).toEqual({
      _tag: "Group",
      id: group("one"),
      tabIds: [tab("thread"), tab("file")],
      activeTabId: tab("thread"),
    });
    expect(activated.focusedGroupId).toBe(group("one"));
  });

  test("ignores attempts to focus a group that is not in the tree", () => {
    const initial = createEditorWorkspace({ groupId: group("one") });
    expect(focusEditorGroup(initial, group("missing"))).toBe(initial);
  });

  test("focuses one editor group without changing the split layout and restores it", () => {
    const splitWorkspace = splitEditorTab(
      createEditorWorkspace({ groupId: group("left"), tabIds: [tab("thread")] }),
      {
        sourceGroupId: group("left"),
        sourceTabId: tab("thread"),
        targetTabId: tab("file"),
        targetGroupId: group("right"),
        splitId: split("columns"),
        direction: "right",
        mode: "copy",
      },
    );
    const root = splitWorkspace.root;
    const focused = toggleMaximizedEditorGroup(splitWorkspace, group("left"));

    expect(focused.root).toBe(root);
    expect(focused.maximizedGroupId).toBe(group("left"));
    expect(getVisibleEditorWorkspaceRoot(focused)).toBe(
      findEditorGroup(focused.root, group("left")),
    );

    const followed = focusEditorGroup(focused, group("right"));
    expect(followed.maximizedGroupId).toBe(group("right"));
    expect(toggleMaximizedEditorGroup(followed, group("right"))).toEqual({
      ...followed,
      maximizedGroupId: null,
    });
  });

  test.each([
    ["left", "horizontal", group("target")],
    ["right", "horizontal", group("source")],
    ["up", "vertical", group("target")],
    ["down", "vertical", group("source")],
  ] as const)("copies a tab into a %s split", (direction, orientation, firstGroupId) => {
    const initial = createEditorWorkspace({
      groupId: group("source"),
      tabIds: [tab("thread"), tab("file")],
      activeTabId: tab("file"),
    });
    const next = splitEditorTab(initial, {
      sourceGroupId: group("source"),
      sourceTabId: tab("file"),
      targetTabId: tab("file-copy"),
      targetGroupId: group("target"),
      splitId: split("one"),
      direction,
      mode: "copy",
    });

    expect(next.root._tag).toBe("Split");
    if (next.root._tag !== "Split") return;
    expect(next.root.orientation).toBe(orientation);
    expect(next.root.first._tag === "Group" ? next.root.first.id : null).toBe(firstGroupId);
    expect(findEditorGroup(next.root, group("source"))?.tabIds).toEqual([
      tab("thread"),
      tab("file"),
    ]);
    expect(findEditorGroup(next.root, group("target"))?.tabIds).toEqual([tab("file-copy")]);
    expect(next.focusedGroupId).toBe(group("target"));
  });

  test("moves a tab into a split while keeping the source group's nearest tab active", () => {
    const initial = createEditorWorkspace({
      groupId: group("source"),
      tabIds: [tab("thread"), tab("file"), tab("diff")],
      activeTabId: tab("file"),
    });
    const next = splitEditorTab(initial, {
      sourceGroupId: group("source"),
      sourceTabId: tab("file"),
      targetTabId: tab("file"),
      targetGroupId: group("target"),
      splitId: split("one"),
      direction: "right",
      mode: "move",
    });

    expect(findEditorGroup(next.root, group("source"))).toMatchObject({
      tabIds: [tab("thread"), tab("diff")],
      activeTabId: tab("diff"),
    });
    expect(findEditorGroup(next.root, group("target"))).toMatchObject({
      tabIds: [tab("file")],
      activeTabId: tab("file"),
    });
  });

  test("reorders tabs within a group without changing its active tab", () => {
    const initial = createEditorWorkspace({
      groupId: group("one"),
      tabIds: [tab("thread"), tab("file"), tab("diff")],
      activeTabId: tab("thread"),
    });
    const reordered = reorderEditorTab(initial, {
      groupId: group("one"),
      tabId: tab("diff"),
      targetIndex: 1,
    });

    expect(findEditorGroup(reordered.root, group("one"))).toMatchObject({
      tabIds: [tab("thread"), tab("diff"), tab("file")],
      activeTabId: tab("thread"),
    });
    expect(
      reorderEditorTab(reordered, {
        groupId: group("one"),
        tabId: tab("diff"),
        targetIndex: 10,
      }),
    ).toBe(reordered);
  });

  test("moves a tab into an existing group and collapses an empty source", () => {
    const initial = splitEditorTab(
      createEditorWorkspace({ groupId: group("left"), tabIds: [tab("thread")] }),
      {
        sourceGroupId: group("left"),
        sourceTabId: tab("thread"),
        targetTabId: tab("file"),
        targetGroupId: group("right"),
        splitId: split("columns"),
        direction: "right",
        mode: "copy",
      },
    );
    const moved = moveEditorTabToGroup(initial, {
      sourceGroupId: group("left"),
      targetGroupId: group("right"),
      tabId: tab("thread"),
      targetIndex: 0,
    });

    expect(moved.root).toEqual({
      _tag: "Group",
      id: group("right"),
      tabIds: [tab("thread"), tab("file")],
      activeTabId: tab("thread"),
    });
    expect(moved.focusedGroupId).toBe(group("right"));
  });

  test("merges all source tabs into an existing group", () => {
    const initial = splitEditorTab(
      createEditorWorkspace({
        groupId: group("left"),
        tabIds: [tab("thread"), tab("diff")],
        activeTabId: tab("diff"),
      }),
      {
        sourceGroupId: group("left"),
        sourceTabId: tab("diff"),
        targetTabId: tab("file"),
        targetGroupId: group("right"),
        splitId: split("columns"),
        direction: "right",
        mode: "copy",
      },
    );
    const merged = mergeEditorGroups(initial, {
      sourceGroupId: group("right"),
      targetGroupId: group("left"),
    });

    expect(merged.root).toEqual({
      _tag: "Group",
      id: group("left"),
      tabIds: [tab("thread"), tab("diff"), tab("file")],
      activeTabId: tab("file"),
    });
    expect(merged.focusedGroupId).toBe(group("left"));
  });

  test("does not move the only tab out of a group", () => {
    const initial = createEditorWorkspace({ groupId: group("source"), tabIds: [tab("thread")] });
    expect(
      splitEditorTab(initial, {
        sourceGroupId: group("source"),
        sourceTabId: tab("thread"),
        targetTabId: tab("thread"),
        targetGroupId: group("target"),
        splitId: split("one"),
        direction: "right",
        mode: "move",
      }),
    ).toBe(initial);
  });

  test("collapses an empty group after its last tab closes", () => {
    const initial = splitEditorTab(
      createEditorWorkspace({ groupId: group("source"), tabIds: [tab("thread")] }),
      {
        sourceGroupId: group("source"),
        sourceTabId: tab("thread"),
        targetTabId: tab("thread-copy"),
        targetGroupId: group("target"),
        splitId: split("one"),
        direction: "right",
        mode: "copy",
      },
    );
    const next = closeEditorTab(initial, group("target"), tab("thread-copy"));

    expect(next.root).toEqual(findEditorGroup(next.root, group("source")));
    expect(next.focusedGroupId).toBe(group("source"));
  });

  test("keeps one empty root group after its final tab closes", () => {
    const initial = createEditorWorkspace({ groupId: group("one"), tabIds: [tab("thread")] });
    expect(closeEditorTab(initial, group("one"), tab("thread"))).toEqual(
      createEditorWorkspace({ groupId: group("one") }),
    );
  });

  test("supports group-scoped close others and close to right", () => {
    const initial = createEditorWorkspace({
      groupId: group("one"),
      tabIds: [tab("thread"), tab("file"), tab("diff")],
      activeTabId: tab("diff"),
    });
    const closedRight = closeEditorTabsToRight(initial, group("one"), tab("file"));
    expect(findEditorGroup(closedRight.root, group("one"))).toMatchObject({
      tabIds: [tab("thread"), tab("file")],
      activeTabId: tab("thread"),
    });
    const closedOthers = closeOtherEditorTabs(initial, group("one"), tab("file"));
    expect(findEditorGroup(closedOthers.root, group("one"))).toMatchObject({
      tabIds: [tab("file")],
      activeTabId: tab("file"),
    });
  });

  test("close all collapses a split group and clears the only root group", () => {
    const splitWorkspace = splitEditorTab(
      createEditorWorkspace({ groupId: group("source"), tabIds: [tab("thread")] }),
      {
        sourceGroupId: group("source"),
        sourceTabId: tab("thread"),
        targetTabId: tab("copy"),
        targetGroupId: group("target"),
        splitId: split("one"),
        direction: "right",
        mode: "copy",
      },
    );
    expect(getEditorGroups(closeAllEditorTabs(splitWorkspace, group("target")).root)).toHaveLength(
      1,
    );
    expect(
      findEditorGroup(
        closeAllEditorTabs(
          createEditorWorkspace({ groupId: group("only"), tabIds: [tab("thread")] }),
          group("only"),
        ).root,
        group("only"),
      ),
    ).toMatchObject({ tabIds: [], activeTabId: null });
  });

  test("resizes nested splits and clamps unsafe ratios", () => {
    const splitWorkspace = splitEditorTab(
      createEditorWorkspace({ groupId: group("source"), tabIds: [tab("thread")] }),
      {
        sourceGroupId: group("source"),
        sourceTabId: tab("thread"),
        targetTabId: tab("copy"),
        targetGroupId: group("target"),
        splitId: split("one"),
        direction: "down",
        mode: "copy",
      },
    );
    const next = resizeEditorSplit(splitWorkspace, split("one"), 2);

    expect(next.root._tag === "Split" ? next.root.ratio : null).toBe(0.9);
    expect(resizeEditorSplit(next, split("one"), Number.NaN)).toBe(next);
  });

  test("finds the group occupying the workspace's top-right corner", () => {
    const columns = splitEditorTab(
      createEditorWorkspace({ groupId: group("left"), tabIds: [tab("thread")] }),
      {
        sourceGroupId: group("left"),
        sourceTabId: tab("thread"),
        targetTabId: tab("right"),
        targetGroupId: group("right"),
        splitId: split("columns"),
        direction: "right",
        mode: "copy",
      },
    );
    const nested = splitEditorTab(columns, {
      sourceGroupId: group("right"),
      sourceTabId: tab("right"),
      targetTabId: tab("bottom-right"),
      targetGroupId: group("bottom-right"),
      splitId: split("right-rows"),
      direction: "down",
      mode: "copy",
    });

    expect(findTopRightEditorGroup(nested.root).id).toBe(group("right"));
    expect(getTopEditorGroups(nested.root).map((editorGroup) => editorGroup.id)).toEqual([
      group("left"),
      group("right"),
    ]);
  });

  test("finds directional neighbors in nested editor splits", () => {
    const columns = splitEditorTab(
      createEditorWorkspace({ groupId: group("top-left"), tabIds: [tab("thread")] }),
      {
        sourceGroupId: group("top-left"),
        sourceTabId: tab("thread"),
        targetTabId: tab("right"),
        targetGroupId: group("right"),
        splitId: split("columns"),
        direction: "right",
        mode: "copy",
      },
    );
    const nested = splitEditorTab(columns, {
      sourceGroupId: group("top-left"),
      sourceTabId: tab("thread"),
      targetTabId: tab("bottom-left"),
      targetGroupId: group("bottom-left"),
      splitId: split("left-rows"),
      direction: "down",
      mode: "copy",
    });

    expect(findAdjacentEditorGroups(nested, group("top-left"))).toEqual({
      up: null,
      down: group("bottom-left"),
      left: null,
      right: group("right"),
    });
    expect(findAdjacentEditorGroups(nested, group("right"))).toEqual({
      up: null,
      down: null,
      left: group("top-left"),
      right: null,
    });
  });
});
