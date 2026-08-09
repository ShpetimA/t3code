import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import {
  createEditorWorkspace,
  splitEditorTab,
  type EditorGroupId,
  type EditorSplitId,
  type EditorTabId,
} from "~/editorWorkspace";

import { EditorWorkspaceGrid } from "./EditorWorkspaceGrid";
import { calculateEditorSplitRatio, resolveKeyboardResizeDelta } from "./EditorWorkspaceGrid.logic";

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
    expect(markup).toContain(group("three"));
  });

  test("calculates clamped ratios from pointer geometry", () => {
    expect(calculateEditorSplitRatio(350, 100, 500)).toBe(0.5);
    expect(calculateEditorSplitRatio(0, 100, 500)).toBe(0.1);
    expect(calculateEditorSplitRatio(1_000, 100, 500)).toBe(0.9);
    expect(calculateEditorSplitRatio(100, 100, 0)).toBeNull();
  });

  test("maps keyboard arrows to the split axis", () => {
    expect(resolveKeyboardResizeDelta("ArrowLeft", "horizontal")).toBe(-0.05);
    expect(resolveKeyboardResizeDelta("ArrowRight", "horizontal")).toBe(0.05);
    expect(resolveKeyboardResizeDelta("ArrowDown", "horizontal")).toBeNull();
    expect(resolveKeyboardResizeDelta("ArrowUp", "vertical")).toBe(-0.05);
    expect(resolveKeyboardResizeDelta("ArrowDown", "vertical")).toBe(0.05);
    expect(resolveKeyboardResizeDelta("ArrowRight", "vertical")).toBeNull();
  });
});
