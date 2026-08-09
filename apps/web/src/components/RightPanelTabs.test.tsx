import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import {
  buildEditorTabContextMenuItems,
  resolveEditorTabSplitAction,
} from "./RightPanelTabs.logic";
import { RightPanelTabBar } from "./RightPanelTabs";

const NOOP = () => {};

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
        copyToSplitAvailable: true,
        moveToSplitAvailable: true,
      }),
    ).toEqual([
      { id: "copy-path", label: "Copy path" },
      { id: "close", label: "Close" },
      { id: "close-others", label: "Close others", disabled: false },
      { id: "close-to-right", label: "Close to the right", disabled: false },
      { id: "close-all", label: "Close all", disabled: false },
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

  it("keeps the pinned thread menu limited to layout actions", () => {
    const items = buildEditorTabContextMenuItems({
      target: { _tag: "Thread" },
      surfaceCount: 0,
      surfaceIndex: -1,
      copyToSplitAvailable: false,
      moveToSplitAvailable: true,
    });

    expect(items.map((item) => item.id)).toEqual(["split-right", "split-down", "split-and-move"]);
    expect(items[2]?.disabled).toBe(false);
    expect(items[0]?.disabled).toBe(true);
    expect(items[1]?.disabled).toBe(true);
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
});
