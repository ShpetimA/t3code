import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import {
  createEditorWorkspace,
  splitEditorTab,
  toggleMaximizedEditorGroup,
  type EditorGroupId,
  type EditorSplitId,
  type EditorTabId,
} from "~/editorWorkspace";

import { EditorWorkspaceGrid } from "./EditorWorkspaceGrid";
import {
  calculateEditorWorkspaceLayout,
  calculateEditorSplitRatio,
  resolveEditorGroupDropZone,
  resolveKeyboardResizeDelta,
} from "./EditorWorkspaceGrid.logic";

const group = (value: string) => `editor-group:${value}` as EditorGroupId;
const split = (value: string) => `editor-split:${value}` as EditorSplitId;
const tab = (value: string) => `editor-tab:${value}` as EditorTabId;
const NOOP = () => {};

describe("EditorWorkspaceGrid", () => {
  test("renders nested groups and accessible resize handles", () => {
    const firstSplit = splitEditorTab(
      createEditorWorkspace({ groupId: group("one"), tabIds: [tab("thread")] }),
      {
        sourceGroupId: group("one"),
        sourceTabId: tab("thread"),
        targetTabId: tab("file-copy"),
        targetGroupId: group("two"),
        splitId: split("columns"),
        direction: "right",
        mode: "copy",
      },
    );
    const nested = splitEditorTab(firstSplit, {
      sourceGroupId: group("two"),
      sourceTabId: tab("file-copy"),
      targetTabId: tab("diff-copy"),
      targetGroupId: group("three"),
      splitId: split("rows"),
      direction: "down",
      mode: "copy",
    });

    const markup = renderToStaticMarkup(
      <EditorWorkspaceGrid
        workspace={nested}
        renderGroup={(editorGroup) => <span>{editorGroup.id}</span>}
        onFocusGroup={NOOP}
        onResizeSplit={NOOP}
      />,
    );

    expect(markup).toContain('data-editor-split-orientation="horizontal"');
    expect(markup).toContain('data-editor-split-orientation="vertical"');
    expect(markup).toContain('aria-label="Resize editor columns"');
    expect(markup).toContain('aria-label="Resize editor rows"');
    expect(markup).toContain('data-editor-group-focused="true"');
    expect(markup).toContain("absolute isolate flex");
    expect(markup).toContain(group("three"));
  });

  test("calculates clamped ratios from pointer geometry", () => {
    expect(calculateEditorSplitRatio(350, 100, 500)).toBe(0.5);
    expect(calculateEditorSplitRatio(0, 100, 500)).toBe(0.1);
    expect(calculateEditorSplitRatio(1_000, 100, 500)).toBe(0.9);
    expect(calculateEditorSplitRatio(100, 100, 0)).toBeNull();
  });

  test("projects nested split geometry into one stable group layer", () => {
    const columns = splitEditorTab(
      createEditorWorkspace({ groupId: group("one"), tabIds: [tab("thread")] }),
      {
        sourceGroupId: group("one"),
        sourceTabId: tab("thread"),
        targetTabId: tab("file"),
        targetGroupId: group("two"),
        splitId: split("columns"),
        direction: "right",
        mode: "copy",
      },
    );
    const nested = splitEditorTab(columns, {
      sourceGroupId: group("two"),
      sourceTabId: tab("file"),
      targetTabId: tab("diff"),
      targetGroupId: group("three"),
      splitId: split("rows"),
      direction: "down",
      mode: "copy",
    });

    const layout = calculateEditorWorkspaceLayout(nested.root);

    expect(layout.groups.map(({ group: editorGroup }) => editorGroup.id)).toEqual([
      group("one"),
      group("two"),
      group("three"),
    ]);
    expect(layout.groups.map(({ bounds }) => bounds)).toEqual([
      { top: 0, right: 0.5, bottom: 1, left: 0 },
      { top: 0, right: 1, bottom: 0.5, left: 0.5 },
      { top: 0.5, right: 1, bottom: 1, left: 0.5 },
    ]);
    expect(layout.splits.map(({ split: editorSplit }) => editorSplit.id)).toEqual([
      split("columns"),
      split("rows"),
    ]);
  });

  test("renders only the focused group while preserving the split workspace", () => {
    const splitWorkspace = splitEditorTab(
      createEditorWorkspace({ groupId: group("one"), tabIds: [tab("thread")] }),
      {
        sourceGroupId: group("one"),
        sourceTabId: tab("thread"),
        targetTabId: tab("file"),
        targetGroupId: group("two"),
        splitId: split("columns"),
        direction: "right",
        mode: "copy",
      },
    );
    const focused = toggleMaximizedEditorGroup(splitWorkspace, group("one"));
    const markup = renderToStaticMarkup(
      <EditorWorkspaceGrid
        workspace={focused}
        renderGroup={(editorGroup) => <span>{editorGroup.id}</span>}
        onFocusGroup={NOOP}
        onResizeSplit={NOOP}
      />,
    );

    expect(focused.root._tag).toBe("Split");
    expect(markup).toContain('data-editor-focus-view="true"');
    expect(markup).toContain(group("one"));
    expect(markup).not.toContain(group("two"));
    expect(markup).not.toContain('role="separator"');
  });

  test("maps keyboard arrows to the split axis", () => {
    expect(resolveKeyboardResizeDelta("ArrowLeft", "horizontal")).toBe(-0.05);
    expect(resolveKeyboardResizeDelta("ArrowRight", "horizontal")).toBe(0.05);
    expect(resolveKeyboardResizeDelta("ArrowDown", "horizontal")).toBeNull();
    expect(resolveKeyboardResizeDelta("ArrowUp", "vertical")).toBe(-0.05);
    expect(resolveKeyboardResizeDelta("ArrowDown", "vertical")).toBe(0.05);
    expect(resolveKeyboardResizeDelta("ArrowRight", "vertical")).toBeNull();
  });

  test("maps pane pointer positions to center and edge drop previews", () => {
    const bounds = { left: 100, top: 50, width: 800, height: 600 };
    expect(resolveEditorGroupDropZone({ clientX: 500, clientY: 350, bounds })).toBe("center");
    expect(resolveEditorGroupDropZone({ clientX: 110, clientY: 350, bounds })).toBe("left");
    expect(resolveEditorGroupDropZone({ clientX: 890, clientY: 350, bounds })).toBe("right");
    expect(resolveEditorGroupDropZone({ clientX: 500, clientY: 60, bounds })).toBe("up");
    expect(resolveEditorGroupDropZone({ clientX: 500, clientY: 640, bounds })).toBe("down");
    expect(
      resolveEditorGroupDropZone({
        clientX: 500,
        clientY: 350,
        bounds: { ...bounds, width: 0 },
      }),
    ).toBeNull();
  });
});
