import type { ScopedThreadRef } from "@t3tools/contracts";
import { beforeEach, describe, expect, test } from "vite-plus/test";

import { findThreadWorkspaceTabGroup, findSurfaceTabs } from "./threadWorkspace";
import { getPanes } from "./splitPaneTree";
import {
  selectThreadWorkspaceOrDefault,
  transitionThreadWorkspace,
  useThreadWorkspaceStore,
} from "./threadWorkspaceStore";

const THREAD_REF = {
  environmentId: "env-test",
  threadId: "thread-test",
} as ScopedThreadRef;
const OTHER_THREAD_REF = {
  environmentId: "env-test",
  threadId: "thread-other",
} as ScopedThreadRef;

beforeEach(() => {
  useThreadWorkspaceStore.setState({ byThreadKey: {} });
});

describe("thread workspace lifecycle", () => {
  test("keeps bottom-panel visibility and height scoped to one thread workspace", () => {
    transitionThreadWorkspace(THREAD_REF, { _tag: "ShowBottomPanel" });
    transitionThreadWorkspace(THREAD_REF, { _tag: "ResizeBottomPanel", height: 360 });

    const byThreadKey = useThreadWorkspaceStore.getState().byThreadKey;
    expect(selectThreadWorkspaceOrDefault(byThreadKey, THREAD_REF)).toMatchObject({
      bottomPanelOpen: true,
      bottomPanelHeight: 360,
    });
    expect(selectThreadWorkspaceOrDefault(byThreadKey, OTHER_THREAD_REF)).toMatchObject({
      bottomPanelOpen: false,
      bottomPanelHeight: 280,
    });
  });

  test("opens a surface catalog entry and placement together", () => {
    const result = transitionThreadWorkspace(THREAD_REF, {
      _tag: "OpenSurface",
      surface: { _tag: "Files" },
      presentation: "preserve-panel",
    });

    expect(result.state.surfaces).toEqual([{ id: "files", kind: "files" }]);
    expect(findSurfaceTabs(result.state, "files")).toHaveLength(1);
  });

  test("deduplicates a pull request tab within its thread workspace", () => {
    const request = {
      _tag: "OpenSurface",
      surface: {
        _tag: "PullRequest",
        projectId: "project-test",
        repository: "owner/repository",
        number: 42,
      },
    } as const;

    transitionThreadWorkspace(THREAD_REF, request);
    const reopened = transitionThreadWorkspace(THREAD_REF, request).state;
    const pullRequest = reopened.surfaces[0];

    expect(reopened.surfaces).toHaveLength(1);
    expect(pullRequest).toBeDefined();
    if (!pullRequest) return;
    expect(findSurfaceTabs(reopened, pullRequest.id)).toHaveLength(1);
    expect(
      selectThreadWorkspaceOrDefault(
        useThreadWorkspaceStore.getState().byThreadKey,
        OTHER_THREAD_REF,
      ).surfaces,
    ).toEqual([]);
  });

  test("reveals agents in a new pane beside the thread", () => {
    const result = transitionThreadWorkspace(THREAD_REF, {
      _tag: "RevealAgentsBesideThread",
    });
    const agentTab = findSurfaceTabs(result.state, "agents")[0];
    const threadTab = Object.values(result.state.tabsById).find((tab) => tab._tag === "Thread");

    expect(agentTab).toBeDefined();
    expect(threadTab).toBeDefined();
    if (!agentTab || !threadTab) return;

    const agentPaneId = findThreadWorkspaceTabGroup(result.state, agentTab.id);
    const threadPaneId = findThreadWorkspaceTabGroup(result.state, threadTab.id);
    expect(agentPaneId).not.toBe(threadPaneId);
    expect(result.state.paneTree.root).toMatchObject({
      _tag: "Split",
      orientation: "horizontal",
      first: { id: threadPaneId },
      second: { id: agentPaneId },
    });
    expect(result.state.paneTree).toMatchObject({
      focusedPaneId: agentPaneId,
      maximizedPaneId: null,
    });
  });

  test("uses the thread's existing right pane for a new Agents tab", () => {
    const initial = selectThreadWorkspaceOrDefault(
      useThreadWorkspaceStore.getState().byThreadKey,
      THREAD_REF,
    );
    const threadPaneId = initial.paneTree.focusedPaneId;
    const split = transitionThreadWorkspace(THREAD_REF, {
      _tag: "SplitPane",
      paneId: threadPaneId,
      direction: "right",
    }).state;
    const rightPaneId = split.paneTree.focusedPaneId;
    transitionThreadWorkspace(THREAD_REF, {
      _tag: "OpenSurface",
      surface: { _tag: "Files" },
    });
    transitionThreadWorkspace(THREAD_REF, { _tag: "ActivateThread" });

    const revealed = transitionThreadWorkspace(THREAD_REF, {
      _tag: "RevealAgentsBesideThread",
    }).state;
    const agentTab = findSurfaceTabs(revealed, "agents")[0];

    expect(agentTab).toBeDefined();
    if (!agentTab) return;
    expect(getPanes(revealed.paneTree.root)).toHaveLength(2);
    expect(findThreadWorkspaceTabGroup(revealed, agentTab.id)).toBe(rightPaneId);
    expect(revealed.paneTree).toMatchObject({
      focusedPaneId: rightPaneId,
      maximizedPaneId: null,
    });
  });

  test("moves an Agents tab out of the thread pane when View needs side-by-side context", () => {
    const opened = transitionThreadWorkspace(THREAD_REF, {
      _tag: "OpenSurface",
      surface: { _tag: "Agents" },
    }).state;
    const agentTab = findSurfaceTabs(opened, "agents")[0];

    expect(agentTab).toBeDefined();
    if (!agentTab) return;
    const threadPaneId = findThreadWorkspaceTabGroup(opened, agentTab.id);
    expect(threadPaneId).not.toBeNull();
    if (!threadPaneId) return;
    transitionThreadWorkspace(THREAD_REF, {
      _tag: "TogglePaneMaximized",
      paneId: threadPaneId,
    });

    const revealed = transitionThreadWorkspace(THREAD_REF, {
      _tag: "RevealAgentsBesideThread",
    }).state;

    expect(findSurfaceTabs(revealed, "agents")).toHaveLength(1);
    expect(findThreadWorkspaceTabGroup(revealed, agentTab.id)).not.toBe(threadPaneId);
    expect(getPanes(revealed.paneTree.root)).toHaveLength(2);
    expect(revealed.paneTree.maximizedPaneId).toBeNull();
  });

  test("focuses an existing Agents pane without duplicating it", () => {
    const firstReveal = transitionThreadWorkspace(THREAD_REF, {
      _tag: "RevealAgentsBesideThread",
    }).state;
    const agentTab = findSurfaceTabs(firstReveal, "agents")[0];
    const threadTab = Object.values(firstReveal.tabsById).find((tab) => tab._tag === "Thread");

    expect(agentTab).toBeDefined();
    expect(threadTab).toBeDefined();
    if (!agentTab || !threadTab) return;
    const agentPaneId = findThreadWorkspaceTabGroup(firstReveal, agentTab.id);
    const threadPaneId = findThreadWorkspaceTabGroup(firstReveal, threadTab.id);
    expect(agentPaneId).not.toBeNull();
    expect(threadPaneId).not.toBeNull();
    if (!agentPaneId || !threadPaneId) return;
    transitionThreadWorkspace(THREAD_REF, {
      _tag: "TogglePaneMaximized",
      paneId: threadPaneId,
    });

    const revealedAgain = transitionThreadWorkspace(THREAD_REF, {
      _tag: "RevealAgentsBesideThread",
    }).state;

    expect(findSurfaceTabs(revealedAgain, "agents")).toHaveLength(1);
    expect(getPanes(revealedAgain.paneTree.root)).toHaveLength(2);
    expect(revealedAgain.paneTree).toMatchObject({
      focusedPaneId: agentPaneId,
      maximizedPaneId: null,
    });
  });

  test("keeps a resource until its last copied placement closes", () => {
    const opened = transitionThreadWorkspace(THREAD_REF, {
      _tag: "OpenSurface",
      surface: { _tag: "Files" },
    }).state;
    const tab = findSurfaceTabs(opened, "files")[0]!;
    const paneId = findThreadWorkspaceTabGroup(opened, tab.id)!;
    transitionThreadWorkspace(THREAD_REF, {
      _tag: "SplitTab",
      paneId,
      tabId: tab.id,
      direction: "right",
      mode: "copy",
    });
    const copied = transitionThreadWorkspace(THREAD_REF, {
      _tag: "CloseSurfaceTab",
      paneId,
      tabId: tab.id,
    });

    expect(copied.removedSurfaces).toEqual([]);
    const remaining = findSurfaceTabs(copied.state, "files");
    expect(remaining).toHaveLength(1);
    const lastGroupId = findThreadWorkspaceTabGroup(copied.state, remaining[0]!.id)!;
    const closed = transitionThreadWorkspace(THREAD_REF, {
      _tag: "CloseSurfaceTab",
      paneId: lastGroupId,
      tabId: remaining[0]!.id,
    });

    expect(closed.removedSurfaces).toEqual([{ id: "files", kind: "files" }]);
    expect(closed.state.surfaces).toEqual([]);
  });

  test("reconciles panel closes across every pane", () => {
    const opened = transitionThreadWorkspace(THREAD_REF, {
      _tag: "OpenSurface",
      surface: { _tag: "Diff" },
    }).state;
    const tab = findSurfaceTabs(opened, "diff")[0]!;
    transitionThreadWorkspace(THREAD_REF, {
      _tag: "SplitTab",
      paneId: findThreadWorkspaceTabGroup(opened, tab.id)!,
      tabId: tab.id,
      direction: "down",
      mode: "copy",
    });

    const closed = transitionThreadWorkspace(THREAD_REF, {
      _tag: "CloseSurface",
      surfaceId: "diff",
    });

    expect(closed.removedSurfaces).toEqual([{ id: "diff", kind: "diff" }]);
    expect(findSurfaceTabs(closed.state, "diff")).toEqual([]);
  });

  test("replaces explorer placements explicitly when a file opens", () => {
    const opened = transitionThreadWorkspace(THREAD_REF, {
      _tag: "OpenSurface",
      surface: { _tag: "Files" },
    }).state;
    const filesTab = findSurfaceTabs(opened, "files")[0]!;
    const copied = transitionThreadWorkspace(THREAD_REF, {
      _tag: "SplitTab",
      paneId: findThreadWorkspaceTabGroup(opened, filesTab.id)!,
      tabId: filesTab.id,
      direction: "right",
      mode: "copy",
    }).state;
    const previousTabIds = findSurfaceTabs(copied, "files").map((tab) => tab.id);

    const fileOpened = transitionThreadWorkspace(THREAD_REF, {
      _tag: "OpenSurface",
      surface: { _tag: "File", relativePath: "src/app.ts" },
    }).state;

    expect(findSurfaceTabs(fileOpened, "files")).toEqual([]);
    expect(findSurfaceTabs(fileOpened, "file:src/app.ts").map((tab) => tab.id)).toEqual(
      previousTabIds,
    );
  });

  test("replaces a browser placeholder with the opened session", () => {
    const placeholder = transitionThreadWorkspace(THREAD_REF, {
      _tag: "OpenSurface",
      surface: { _tag: "Browser", tabId: null },
    }).state;
    const placeholderTabId = findSurfaceTabs(placeholder, "browser:new")[0]!.id;

    const opened = transitionThreadWorkspace(THREAD_REF, {
      _tag: "OpenSurface",
      surface: { _tag: "Browser", tabId: "tab-1" },
    }).state;

    expect(findSurfaceTabs(opened, "browser:new")).toEqual([]);
    expect(findSurfaceTabs(opened, "browser:tab-1")[0]?.id).toBe(placeholderTabId);
  });
});
