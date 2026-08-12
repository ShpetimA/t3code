import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vite-plus/test";

import {
  calculatePaneTreeLayout,
  createPaneTree,
  splitPaneTab,
  toggleMaximizedPane,
  type PaneId,
  type PaneSplitId,
  type PaneTabId,
} from "~/splitPaneTree";

import { SplitPaneGrid } from "./SplitPaneGrid";
import {
  calculatePaneSplitRatio,
  resolvePaneDropZone,
  resolveKeyboardResizeDelta,
} from "./SplitPaneGrid.logic";

const group = (value: string) => `pane:${value}` as PaneId;
const split = (value: string) => `pane-split:${value}` as PaneSplitId;
const tab = (value: string) => `workspace-tab:${value}` as PaneTabId;
const NOOP = () => {};

describe("SplitPaneGrid", () => {
  test("renders nested groups and accessible resize handles", () => {
    const firstSplit = splitPaneTab(
      createPaneTree({ paneId: group("one"), tabIds: [tab("thread")] }),
      {
        sourcePaneId: group("one"),
        sourceTabId: tab("thread"),
        targetTabId: tab("file-copy"),
        targetPaneId: group("two"),
        splitId: split("columns"),
        direction: "right",
        mode: "copy",
      },
    );
    const nested = splitPaneTab(firstSplit, {
      sourcePaneId: group("two"),
      sourceTabId: tab("file-copy"),
      targetTabId: tab("diff-copy"),
      targetPaneId: group("three"),
      splitId: split("rows"),
      direction: "down",
      mode: "copy",
    });

    const markup = renderToStaticMarkup(
      <SplitPaneGrid
        tree={nested}
        renderPane={(editorGroup) => <span>{editorGroup.id}</span>}
        onFocusPane={NOOP}
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
    expect(calculatePaneSplitRatio(350, 100, 500)).toBe(0.5);
    expect(calculatePaneSplitRatio(0, 100, 500)).toBe(0.1);
    expect(calculatePaneSplitRatio(1_000, 100, 500)).toBe(0.9);
    expect(calculatePaneSplitRatio(100, 100, 0)).toBeNull();
  });

  test("projects nested split geometry into one stable group layer", () => {
    const columns = splitPaneTab(
      createPaneTree({ paneId: group("one"), tabIds: [tab("thread")] }),
      {
        sourcePaneId: group("one"),
        sourceTabId: tab("thread"),
        targetTabId: tab("file"),
        targetPaneId: group("two"),
        splitId: split("columns"),
        direction: "right",
        mode: "copy",
      },
    );
    const nested = splitPaneTab(columns, {
      sourcePaneId: group("two"),
      sourceTabId: tab("file"),
      targetTabId: tab("diff"),
      targetPaneId: group("three"),
      splitId: split("rows"),
      direction: "down",
      mode: "copy",
    });

    const layout = calculatePaneTreeLayout(nested.root);

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
    const splitWorkspace = splitPaneTab(
      createPaneTree({ paneId: group("one"), tabIds: [tab("thread")] }),
      {
        sourcePaneId: group("one"),
        sourceTabId: tab("thread"),
        targetTabId: tab("file"),
        targetPaneId: group("two"),
        splitId: split("columns"),
        direction: "right",
        mode: "copy",
      },
    );
    const focused = toggleMaximizedPane(splitWorkspace, group("one"));
    const markup = renderToStaticMarkup(
      <SplitPaneGrid
        tree={focused}
        renderPane={(editorGroup) => <span>{editorGroup.id}</span>}
        onFocusPane={NOOP}
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
    expect(resolvePaneDropZone({ clientX: 500, clientY: 350, bounds })).toBe("center");
    expect(resolvePaneDropZone({ clientX: 110, clientY: 350, bounds })).toBe("left");
    expect(resolvePaneDropZone({ clientX: 890, clientY: 350, bounds })).toBe("right");
    expect(resolvePaneDropZone({ clientX: 500, clientY: 60, bounds })).toBe("up");
    expect(resolvePaneDropZone({ clientX: 500, clientY: 640, bounds })).toBe("down");
    expect(
      resolvePaneDropZone({
        clientX: 500,
        clientY: 350,
        bounds: { ...bounds, width: 0 },
      }),
    ).toBeNull();
  });
});
