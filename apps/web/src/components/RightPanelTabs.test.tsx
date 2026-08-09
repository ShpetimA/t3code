import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import {
  buildEditorTabContextMenuItems,
  resolveEditorTabLayoutAction,
  resolveEditorTabSplitAction,
} from "./RightPanelTabs.logic";
import { RightPanelTabBar } from "./RightPanelTabs";

const NOOP = () => {};
const NO_ADJACENT_GROUPS = { up: null, down: null, left: null, right: null } as const;

describe("RightPanelTabBar", () => {
  it("renders the current thread as a pinned active tab in the maximized workspace", () => {
    const markup = renderToStaticMarkup(
      <RightPanelTabBar
        mode="inline"
        maximized
        threadTab={{
          title: "New thread",
          active: true,
          status: {
            label: "Working",
            colorClass: "text-sky-600",
            dotClass: "bg-sky-500",
            pulse: true,
          },
          onActivate: NOOP,
        }}
        surfaces={[]}
        activeSurfaceId={null}
        pendingSurfaceIds={new Set()}
        previewSessions={{}}
        terminalLabelsById={new Map()}
        onActivate={NOOP}
        onCloseSurface={NOOP}
        onCloseOtherSurfaces={NOOP}
        onCloseSurfacesToRight={NOOP}
        onCloseAllSurfaces={NOOP}
        onCopyFilePath={NOOP}
        onAddBrowser={NOOP}
        onAddTerminal={NOOP}
        onAddDiff={NOOP}
        onAddFiles={NOOP}
        onAddAgents={NOOP}
        browserAvailable
        diffAvailable
        filesAvailable
        liveAgentCount={0}
      />,
    );

    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain("New thread");
    expect(markup).toContain('aria-label="Working"');
    expect(markup).toContain("animate-status-pulse");
    expect(markup).toContain('aria-label="Add panel surface"');
    expect(markup).not.toContain('aria-label="Close New thread"');
  });

  it("renders a reversible Focus View control", () => {
    const markup = renderToStaticMarkup(
      <RightPanelTabBar
        mode="embedded"
        focusView={{ active: true, shortcutLabel: "⌘⇧↵", onToggle: NOOP }}
        surfaces={[]}
        activeSurfaceId={null}
        pendingSurfaceIds={new Set()}
        previewSessions={{}}
        terminalLabelsById={new Map()}
        onActivate={NOOP}
        onCloseSurface={NOOP}
        onCloseOtherSurfaces={NOOP}
        onCloseSurfacesToRight={NOOP}
        onCloseAllSurfaces={NOOP}
        onCopyFilePath={NOOP}
        onAddBrowser={NOOP}
        onAddTerminal={NOOP}
        onAddDiff={NOOP}
        onAddFiles={NOOP}
        onAddAgents={NOOP}
        browserAvailable
        diffAvailable
        filesAvailable
        liveAgentCount={0}
      />,
    );

    expect(markup).toContain('aria-label="Restore editor layout"');
    expect(markup).toContain('aria-pressed="true"');
  });

  it("adds copy and move split actions to a surface tab menu", () => {
    expect(
      buildEditorTabContextMenuItems({
        target: {
          _tag: "Surface",
          surface: {
            id: "file:src/app.ts",
            kind: "file",
            relativePath: "src/app.ts",
            revealLine: null,
            revealRequestId: 0,
          },
        },
        surfaceCount: 3,
        surfaceIndex: 1,
        tabCount: 4,
        tabIndex: 2,
        adjacentGroups: NO_ADJACENT_GROUPS,
        reorderAvailable: true,
        moveToGroupAvailable: true,
        mergeGroupAvailable: true,
        copyToSplitAvailable: true,
        moveToSplitAvailable: true,
      }),
    ).toEqual([
      { id: "copy-path", label: "Copy path" },
      { id: "close", label: "Close" },
      { id: "close-others", label: "Close others", disabled: false },
      { id: "close-to-right", label: "Close to the right", disabled: false },
      { id: "close-all", label: "Close all", disabled: false },
      { id: "move-tab-left", label: "Move Left", disabled: false },
      { id: "move-tab-right", label: "Move Right", disabled: false },
      { id: "split-right", label: "Split Right", disabled: false },
      { id: "split-down", label: "Split Down", disabled: false },
      {
        id: "split-and-move",
        label: "Split & Move",
        disabled: false,
        children: [
          { id: "move-up", label: "Split Up" },
          { id: "move-down", label: "Split Down" },
          { id: "move-left", label: "Split Left" },
          { id: "move-right", label: "Split Right" },
        ],
      },
    ]);
  });

  it("keeps the pinned thread fixed while allowing existing-group moves and merges", () => {
    const items = buildEditorTabContextMenuItems({
      target: { _tag: "Thread" },
      surfaceCount: 0,
      surfaceIndex: -1,
      tabCount: 1,
      tabIndex: -1,
      adjacentGroups: { up: null, down: null, left: null, right: "editor-group:right" },
      reorderAvailable: false,
      moveToGroupAvailable: true,
      mergeGroupAvailable: true,
      copyToSplitAvailable: false,
      moveToSplitAvailable: true,
    });

    expect(items).toEqual([
      {
        id: "move-to-group",
        label: "Move into Group",
        children: [{ id: "move-group-right", label: "Right" }],
      },
      { id: "split-right", label: "Split Right", disabled: true },
      { id: "split-down", label: "Split Down", disabled: true },
      {
        id: "split-and-move",
        label: "Split & Move",
        disabled: false,
        children: [
          { id: "move-up", label: "Split Up" },
          { id: "move-down", label: "Split Down" },
          { id: "move-left", label: "Split Left" },
          { id: "move-right", label: "Split Right" },
        ],
      },
      {
        id: "merge-group",
        label: "Merge Group With",
        children: [{ id: "merge-group-right", label: "Right" }],
      },
    ]);
  });

  it("resolves split menu actions into copy and move commands", () => {
    expect(resolveEditorTabSplitAction("split-right")).toEqual({
      mode: "copy",
      direction: "right",
    });
    expect(resolveEditorTabSplitAction("move-up")).toEqual({
      mode: "move",
      direction: "up",
    });
    expect(resolveEditorTabSplitAction("close")).toBeNull();
  });

  it("resolves reorder, move-to-group, and merge-group commands", () => {
    expect(resolveEditorTabLayoutAction("move-tab-left")).toEqual({
      _tag: "Reorder",
      direction: "left",
    });
    expect(resolveEditorTabLayoutAction("move-group-down")).toEqual({
      _tag: "MoveToGroup",
      direction: "down",
    });
    expect(resolveEditorTabLayoutAction("merge-group-right")).toEqual({
      _tag: "MergeGroup",
      direction: "right",
    });
    expect(resolveEditorTabLayoutAction("split-right")).toBeNull();
  });
});
