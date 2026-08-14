import type { DesktopPreviewFavicon, PreviewSessionSnapshot } from "@t3tools/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import {
  buildWorkspaceTabContextMenuItems,
  resolveWorkspaceTabLayoutAction,
  resolveWorkspaceTabSplitAction,
} from "./RightPanelTabs.logic";
import { RightPanelEmptyState, RightPanelTabBar, RightPanelTabs } from "./RightPanelTabs";

const NOOP = () => {};
const NO_ADJACENT_GROUPS = { up: null, down: null, left: null, right: null } as const;

describe("RightPanelTabBar", () => {
  it("renders the current thread as a pinned active workspace tab", () => {
    const markup = renderToStaticMarkup(
      <RightPanelTabBar
        mode="embedded"
        titleBar
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
        desktopByTabId={{}}
        terminalLabelsById={new Map()}
        onActivate={NOOP}
        onCloseSurface={NOOP}
        onCloseOtherSurfaces={NOOP}
        onCloseSurfacesToRight={NOOP}
        onCloseAllSurfaces={NOOP}
        onCopyFilePath={NOOP}
        onTabDragStart={NOOP}
        onTabDragEnd={NOOP}
        onTabDrop={NOOP}
        onTabDropAtEnd={NOOP}
        onAddBrowser={NOOP}
        onAddTerminal={NOOP}
        onAddDiff={NOOP}
        onAddFiles={NOOP}
        onAddPullRequest={NOOP}
        onAddAgents={NOOP}
        browserAvailable
        terminalAvailable
        diffAvailable
        filesAvailable
        pullRequestAvailable={false}
        agentsAvailable
        liveAgentCount={0}
      />,
    );

    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain("New thread");
    expect(markup).toContain('aria-label="Working"');
    expect(markup).toContain("animate-status-pulse");
    expect(markup).toContain('aria-label="Add panel surface"');
    expect(markup).toContain('data-editor-tab="thread"');
    expect(markup).toContain('draggable="true"');
    expect(markup).not.toContain('aria-label="Close New thread"');
  });

  it("renders a reversible Focus View control", () => {
    const markup = renderToStaticMarkup(
      <RightPanelTabBar
        mode="embedded"
        focusView={{ active: true, shortcutLabel: "⌘⇧↵", onToggle: NOOP }}
        layoutControls={<button aria-label="Split editor right" />}
        onCloseGroup={NOOP}
        surfaces={[]}
        activeSurfaceId={null}
        pendingSurfaceIds={new Set()}
        previewSessions={{}}
        desktopByTabId={{}}
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
        onAddPullRequest={NOOP}
        onAddAgents={NOOP}
        browserAvailable
        terminalAvailable
        diffAvailable
        filesAvailable
        pullRequestAvailable={false}
        agentsAvailable
        liveAgentCount={0}
      />,
    );

    expect(markup).toContain('aria-label="Restore workspace layout"');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain("[--control-icon-color:currentColor]");
    expect(markup.indexOf('aria-label="Restore workspace layout"')).toBeLessThan(
      markup.indexOf('aria-label="Split editor right"'),
    );
    expect(markup.indexOf('aria-label="Split editor right"')).toBeLessThan(
      markup.indexOf('aria-label="Close pane"'),
    );
    expect(markup).toContain("[--workspace-topbar-height:--spacing(10)]");
    expect(markup).not.toContain("pr-28");
  });

  it("renders the surface chooser for an empty pane", () => {
    const markup = renderToStaticMarkup(
      <RightPanelEmptyState
        onAddBrowser={NOOP}
        onAddTerminal={NOOP}
        onAddDiff={NOOP}
        onAddFiles={NOOP}
        onAddPullRequest={NOOP}
        onAddAgents={NOOP}
        browserAvailable
        terminalAvailable
        diffAvailable
        filesAvailable
        pullRequestAvailable={false}
        agentsAvailable
        liveAgentCount={0}
      />,
    );

    expect(markup).toContain("Open a surface");
    expect(markup).toContain("Choose what to show in the right panel.");
    expect(markup).toContain("Terminal");
  });

  it("adds copy and move split actions to a surface tab menu", () => {
    expect(
      buildWorkspaceTabContextMenuItems({
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
        adjacentGroups: NO_ADJACENT_GROUPS,
        moveToGroupAvailable: true,
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
          { id: "move-up", label: "Split Up", disabled: false },
          { id: "move-down", label: "Split Down", disabled: false },
          { id: "move-left", label: "Split Left", disabled: false },
          { id: "move-right", label: "Split Right", disabled: false },
        ],
      },
    ]);
  });

  it("puts existing-group moves inside the Split & Move submenu", () => {
    const items = buildWorkspaceTabContextMenuItems({
      target: { _tag: "Thread" },
      surfaceCount: 0,
      surfaceIndex: -1,
      adjacentGroups: { up: null, down: null, left: null, right: "pane:right" },
      moveToGroupAvailable: true,
      copyToSplitAvailable: false,
      moveToSplitAvailable: true,
    });

    expect(items).toEqual([
      { id: "split-right", label: "Split Right", disabled: true },
      { id: "split-down", label: "Split Down", disabled: true },
      {
        id: "split-and-move",
        label: "Split & Move",
        disabled: false,
        children: [
          { id: "move-up", label: "Split Up", disabled: false },
          { id: "move-down", label: "Split Down", disabled: false },
          { id: "move-left", label: "Split Left", disabled: false },
          { id: "move-right", label: "Split Right", disabled: false },
          { id: "move-group-right", label: "Move Right" },
        ],
      },
    ]);
  });

  it("resolves split menu actions into copy and move commands", () => {
    expect(resolveWorkspaceTabSplitAction("split-right")).toEqual({
      mode: "copy",
      direction: "right",
    });
    expect(resolveWorkspaceTabSplitAction("move-up")).toEqual({
      mode: "move",
      direction: "up",
    });
    expect(resolveWorkspaceTabSplitAction("close")).toBeNull();
  });

  it("resolves existing-group move commands", () => {
    expect(resolveWorkspaceTabLayoutAction("move-group-down")).toEqual({
      _tag: "MoveToGroup",
      direction: "down",
    });
    expect(resolveWorkspaceTabLayoutAction("split-right")).toBeNull();
  });
});

const previewSurface = {
  id: "browser:tab-1" as const,
  kind: "preview" as const,
  resourceId: "tab-1",
};
const secondSurface = {
  id: "browser:tab-2" as const,
  kind: "preview" as const,
  resourceId: "tab-2",
};
const sessions: Readonly<Record<string, PreviewSessionSnapshot>> = {
  "tab-1": {
    threadId: "thread-1",
    tabId: "tab-1",
    navStatus: { _tag: "Success", url: "http://24x.xf.local/", title: "Local site" },
    canGoBack: false,
    canGoForward: false,
    updatedAt: "2026-08-09T00:00:00.000Z",
  },
  "tab-2": {
    threadId: "thread-1",
    tabId: "tab-2",
    navStatus: { _tag: "Success", url: "http://24x.xf.local/admin", title: "Admin" },
    canGoBack: false,
    canGoForward: false,
    updatedAt: "2026-08-09T00:00:00.000Z",
  },
};

const favicon = (dataUrl: string, pageUrl: string): DesktopPreviewFavicon => ({
  dataUrl,
  pageUrl,
  capturedAt: 1,
});

function overlay(icon: DesktopPreviewFavicon | null) {
  return {
    hasWebContents: true,
    canGoBack: false,
    canGoForward: false,
    loading: false,
    zoomFactor: 1,
    pictureInPicture: false,
    colorScheme: "system" as const,
    controller: "none" as const,
    favicon: icon,
  };
}

function renderTabs(first: DesktopPreviewFavicon | null, second?: DesktopPreviewFavicon) {
  return renderToStaticMarkup(
    <RightPanelTabs
      mode="inline"
      surfaces={second ? [previewSurface, secondSurface] : [previewSurface]}
      activeSurfaceId={previewSurface.id}
      pendingSurfaceIds={new Set()}
      previewSessions={sessions}
      desktopByTabId={{
        "tab-1": overlay(first),
        ...(second ? { "tab-2": overlay(second) } : {}),
      }}
      terminalLabelsById={new Map()}
      onActivate={() => undefined}
      onCloseSurface={() => undefined}
      onCloseOtherSurfaces={() => undefined}
      onCloseSurfacesToRight={() => undefined}
      onCloseAllSurfaces={() => undefined}
      onCopyFilePath={() => undefined}
      onAddBrowser={() => undefined}
      onAddTerminal={() => undefined}
      onAddPullRequest={() => undefined}
      onAddDiff={() => undefined}
      onAddFiles={() => undefined}
      onAddAgents={() => undefined}
      liveAgentCount={0}
      browserAvailable
      terminalAvailable={false}
      diffAvailable={false}
      filesAvailable={false}
      pullRequestAvailable={false}
      agentsAvailable={false}
    >
      <div>content</div>
    </RightPanelTabs>,
  );
}

describe("RightPanelTabs preview favicon", () => {
  it("prefers a live capture and never asks Google about a private hostname", () => {
    const captured = renderTabs(favicon("data:image/png;base64,AAAA", "http://24x.xf.local/"));
    expect(captured).toContain("data:image/png;base64,AAAA");
    expect(captured).not.toContain("s2/favicons");
    expect(renderTabs(null)).not.toContain("s2/favicons");
  });

  it("keeps route-specific captures isolated between live tabs on one origin", () => {
    const html = renderTabs(
      favicon("data:image/png;base64,AAAA", "http://24x.xf.local/"),
      favicon("data:image/png;base64,BBBB", "http://24x.xf.local/admin"),
    );
    expect(html).toContain("data:image/png;base64,AAAA");
    expect(html).toContain("data:image/png;base64,BBBB");
  });

  it("hides a capture while the server session still describes another origin", () => {
    const html = renderTabs(favicon("data:image/png;base64,AAAA", "https://example.com/"));
    expect(html).not.toContain("data:image/png;base64,AAAA");
  });
});
