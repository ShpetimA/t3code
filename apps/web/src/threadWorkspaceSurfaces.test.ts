import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { type EnvironmentId, ThreadId } from "@t3tools/contracts";
import { beforeEach, describe, expect, it } from "vite-plus/test";

import {
  EMPTY_THREAD_WORKSPACE_SURFACE_FIELDS,
  parsePersistedThreadWorkspaceSurfaces,
  transitionThreadWorkspaceSurfaces,
  type RightPanelKind,
  type RightPanelSurfacePresentation,
  type ThreadWorkspaceSurfaceFields,
  type ThreadWorkspaceSurfaceTransition,
} from "./threadWorkspaceSurfaces";

const refA = scopeThreadRef("env-1" as EnvironmentId, ThreadId.make("thread-A"));
const refB = scopeThreadRef("env-1" as EnvironmentId, ThreadId.make("thread-B"));

let byThreadKey: Record<string, ThreadWorkspaceSurfaceFields> = {};

function apply(ref: typeof refA, transition: ThreadWorkspaceSurfaceTransition): void {
  const threadKey = `${ref.environmentId}:${ref.threadId}`;
  const current = byThreadKey[threadKey] ?? EMPTY_THREAD_WORKSPACE_SURFACE_FIELDS;
  const next = transitionThreadWorkspaceSurfaces(current, transition);
  if (!next.isRightPanelOpen && next.activeSurfaceId === null && next.surfaces.length === 0) {
    const { [threadKey]: _removed, ...rest } = byThreadKey;
    byThreadKey = rest;
    return;
  }
  byThreadKey = {
    ...byThreadKey,
    [threadKey]: next,
  };
}

const surfaceHarness = {
  setState: (state: { readonly byThreadKey: Record<string, ThreadWorkspaceSurfaceFields> }) => {
    byThreadKey = state.byThreadKey;
  },
  getState: () => ({
    byThreadKey,
    open: (
      ref: typeof refA,
      kind: Exclude<RightPanelKind, "file" | "terminal" | "pull-request">,
      presentation?: RightPanelSurfacePresentation,
    ) => apply(ref, { _tag: "OpenKind", kind, ...(presentation ? { presentation } : {}) }),
    openBrowser: (
      ref: typeof refA,
      tabId: string | null,
      presentation?: RightPanelSurfacePresentation,
    ) => apply(ref, { _tag: "OpenBrowser", tabId, ...(presentation ? { presentation } : {}) }),
    openFile: (
      ref: typeof refA,
      relativePath: string,
      line?: number,
      presentation?: RightPanelSurfacePresentation,
    ) =>
      apply(ref, {
        _tag: "OpenFile",
        relativePath,
        ...(line !== undefined ? { line } : {}),
        ...(presentation ? { presentation } : {}),
      }),
    openTerminal: (
      ref: typeof refA,
      terminalId: string,
      presentation?: RightPanelSurfacePresentation,
    ) =>
      apply(ref, {
        _tag: "OpenTerminal",
        terminalId,
        ...(presentation ? { presentation } : {}),
      }),
    openPullRequest: (
      ref: typeof refA,
      target: { projectId: string; repository: string; number: number },
    ) => apply(ref, { _tag: "OpenPullRequest", ...target }),
    splitTerminal: (
      ref: typeof refA,
      surfaceId: string,
      terminalId: string,
      direction?: "horizontal" | "vertical",
    ) =>
      apply(ref, {
        _tag: "SplitTerminal",
        surfaceId,
        terminalId,
        ...(direction ? { direction } : {}),
      }),
    activateTerminal: (ref: typeof refA, surfaceId: string, terminalId: string) =>
      apply(ref, { _tag: "ActivateTerminal", surfaceId, terminalId }),
    closeTerminal: (ref: typeof refA, surfaceId: string, terminalId: string) =>
      apply(ref, { _tag: "CloseTerminal", surfaceId, terminalId }),
    selectSurface: (ref: typeof refA, surfaceId: string) =>
      apply(ref, { _tag: "SelectSurface", surfaceId }),
    closeSurface: (ref: typeof refA, surfaceId: string) =>
      apply(ref, { _tag: "CloseSurface", surfaceId }),
    closeOtherSurfaces: (ref: typeof refA, surfaceId: string) =>
      apply(ref, { _tag: "CloseOtherSurfaces", surfaceId }),
    closeSurfacesToRight: (ref: typeof refA, surfaceId: string) =>
      apply(ref, { _tag: "CloseSurfacesToRight", surfaceId }),
    closeAllSurfaces: (ref: typeof refA) => apply(ref, { _tag: "CloseAllSurfaces" }),
    reconcileBrowserSurfaces: (ref: typeof refA, tabIds: readonly string[]) =>
      apply(ref, { _tag: "ReconcileBrowserSurfaces", tabIds }),
    reconcileFileSurfaces: (ref: typeof refA, workspaceAvailable: boolean) =>
      apply(ref, { _tag: "ReconcileFileSurfaces", workspaceAvailable }),
    close: (ref: typeof refA) => apply(ref, { _tag: "ClosePanel" }),
    toggleVisibility: (ref: typeof refA) => apply(ref, { _tag: "TogglePanelVisibility" }),
    toggle: (
      ref: typeof refA,
      kind: Exclude<RightPanelKind, "file" | "terminal" | "pull-request">,
    ) => apply(ref, { _tag: "ToggleKind", kind }),
    removeThread: (ref: typeof refA) => {
      const threadKey = `${ref.environmentId}:${ref.threadId}`;
      const { [threadKey]: _removed, ...rest } = byThreadKey;
      byThreadKey = rest;
    },
  }),
};

function selectSurfaceFields(
  currentByThreadKey: Record<string, ThreadWorkspaceSurfaceFields>,
  ref: typeof refA,
): ThreadWorkspaceSurfaceFields {
  return (
    currentByThreadKey[`${ref.environmentId}:${ref.threadId}`] ??
    EMPTY_THREAD_WORKSPACE_SURFACE_FIELDS
  );
}

function selectActiveRightPanel(
  currentByThreadKey: Record<string, ThreadWorkspaceSurfaceFields>,
  ref: typeof refA,
): RightPanelKind | null {
  const state = selectSurfaceFields(currentByThreadKey, ref);
  if (!state.isRightPanelOpen) return null;
  return state.surfaces.find((surface) => surface.id === state.activeSurfaceId)?.kind ?? null;
}

function selectActiveRightPanelSurface(
  currentByThreadKey: Record<string, ThreadWorkspaceSurfaceFields>,
  ref: typeof refA,
) {
  const state = selectSurfaceFields(currentByThreadKey, ref);
  if (!state.isRightPanelOpen) return null;
  return state.surfaces.find((surface) => surface.id === state.activeSurfaceId) ?? null;
}

beforeEach(() => {
  surfaceHarness.setState({ byThreadKey: {} });
});

describe("thread workspace surface state", () => {
  it("drops the legacy singleton terminal surface during migration", () => {
    expect(
      parsePersistedThreadWorkspaceSurfaces({
        byThreadKey: {
          "env-1:thread-A": {
            activeSurfaceId: "terminal",
            surfaces: [
              { id: "browser:tab-a", kind: "preview", resourceId: "tab-a" },
              { id: "terminal", kind: "terminal" },
            ],
          },
        },
      }),
    ).toEqual({
      byThreadKey: {
        "env-1:thread-A": {
          isRightPanelOpen: false,
          activeSurfaceId: null,
          surfaces: [{ id: "browser:tab-a", kind: "preview", resourceId: "tab-a" }],
        },
      },
    });
  });

  it("upgrades saved single-session terminal surfaces to split-capable surfaces", () => {
    expect(
      parsePersistedThreadWorkspaceSurfaces({
        byThreadKey: {
          "env-1:thread-A": {
            isRightPanelOpen: true,
            activeSurfaceId: "terminal:term-1",
            surfaces: [{ id: "terminal:term-1", kind: "terminal", resourceId: "term-1" }],
          },
        },
      }),
    ).toEqual({
      byThreadKey: {
        "env-1:thread-A": {
          isRightPanelOpen: true,
          activeSurfaceId: "terminal:term-1",
          surfaces: [
            {
              id: "terminal:term-1",
              kind: "terminal",
              resourceId: "term-1",
              terminalIds: ["term-1"],
              activeTerminalId: "term-1",
            },
          ],
        },
      },
    });
  });

  it("upgrades saved file surfaces with neutral reveal state", () => {
    expect(
      parsePersistedThreadWorkspaceSurfaces({
        byThreadKey: {
          "env-1:thread-A": {
            isRightPanelOpen: true,
            activeSurfaceId: "file:src/index.ts",
            surfaces: [{ id: "file:src/index.ts", kind: "file", relativePath: "src/index.ts" }],
          },
        },
      }),
    ).toEqual({
      byThreadKey: {
        "env-1:thread-A": {
          isRightPanelOpen: true,
          activeSurfaceId: "file:src/index.ts",
          surfaces: [
            {
              id: "file:src/index.ts",
              kind: "file",
              relativePath: "src/index.ts",
              revealLine: null,
              revealRequestId: 0,
            },
          ],
        },
      },
    });
  });

  it("drops persisted plan surfaces and does not reopen an empty panel", () => {
    expect(
      parsePersistedThreadWorkspaceSurfaces({
        byThreadKey: {
          "env-1:thread-A": {
            isRightPanelOpen: true,
            activeSurfaceId: "plan",
            surfaces: [{ id: "plan", kind: "plan" }],
          },
          "env-1:thread-B": {
            isRightPanelOpen: true,
            activeSurfaceId: "plan",
            surfaces: [
              { id: "plan", kind: "plan" },
              { id: "diff", kind: "diff" },
            ],
          },
        },
      }),
    ).toEqual({
      byThreadKey: {
        "env-1:thread-A": {
          isRightPanelOpen: false,
          activeSurfaceId: null,
          surfaces: [],
        },
        "env-1:thread-B": {
          isRightPanelOpen: true,
          activeSurfaceId: "diff",
          surfaces: [{ id: "diff", kind: "diff" }],
        },
      },
    });
  });

  it("open sets the active panel for a thread", () => {
    surfaceHarness.getState().open(refA, "preview");
    expect(selectActiveRightPanel(surfaceHarness.getState().byThreadKey, refA)).toBe("preview");
    expect(selectActiveRightPanel(surfaceHarness.getState().byThreadKey, refB)).toBeNull();
  });

  it("opening a different kind keeps both surfaces and activates the new one", () => {
    surfaceHarness.getState().open(refA, "agents");
    surfaceHarness.getState().open(refA, "preview");
    expect(selectActiveRightPanel(surfaceHarness.getState().byThreadKey, refA)).toBe("preview");
    expect(selectSurfaceFields(surfaceHarness.getState().byThreadKey, refA).surfaces).toHaveLength(
      2,
    );
  });

  it("reopening an inactive singleton activates its existing surface", () => {
    surfaceHarness.getState().open(refA, "diff");
    surfaceHarness.getState().open(refA, "agents");
    surfaceHarness.getState().open(refA, "diff");

    expect(selectSurfaceFields(surfaceHarness.getState().byThreadKey, refA)).toEqual({
      isRightPanelOpen: true,
      activeSurfaceId: "diff",
      surfaces: [
        { id: "diff", kind: "diff" },
        { id: "agents", kind: "agents" },
      ],
    });
  });

  it("selects a workspace surface without reopening the narrow panel", () => {
    surfaceHarness.getState().open(refA, "diff");
    surfaceHarness.getState().open(refA, "agents");
    surfaceHarness.getState().close(refA);

    surfaceHarness.getState().selectSurface(refA, "diff");

    expect(selectSurfaceFields(surfaceHarness.getState().byThreadKey, refA)).toEqual({
      isRightPanelOpen: false,
      activeSurfaceId: "diff",
      surfaces: [
        { id: "diff", kind: "diff" },
        { id: "agents", kind: "agents" },
      ],
    });
  });

  it("opens workspace surfaces without changing narrow panel visibility", () => {
    surfaceHarness.getState().open(refA, "diff", "preserve-panel");
    surfaceHarness.getState().openFile(refA, "src/index.ts", undefined, "preserve-panel");

    expect(selectSurfaceFields(surfaceHarness.getState().byThreadKey, refA)).toEqual({
      isRightPanelOpen: false,
      activeSurfaceId: "file:src/index.ts",
      surfaces: [
        { id: "diff", kind: "diff" },
        {
          id: "file:src/index.ts",
          kind: "file",
          relativePath: "src/index.ts",
          revealLine: null,
          revealRequestId: 1,
        },
      ],
    });
  });

  it("keeps files as a singleton surface", () => {
    surfaceHarness.getState().open(refA, "files");
    surfaceHarness.getState().open(refA, "files");
    expect(selectSurfaceFields(surfaceHarness.getState().byThreadKey, refA)).toEqual({
      isRightPanelOpen: true,
      activeSurfaceId: "files",
      surfaces: [{ id: "files", kind: "files" }],
    });
  });

  it("replaces the standalone explorer with peer file surfaces", () => {
    surfaceHarness.getState().open(refA, "files");
    surfaceHarness.getState().openFile(refA, "src/index.ts");
    surfaceHarness.getState().openFile(refA, "src/index.ts");
    surfaceHarness.getState().openFile(refA, "README.md");

    expect(selectSurfaceFields(surfaceHarness.getState().byThreadKey, refA)).toEqual({
      isRightPanelOpen: true,
      activeSurfaceId: "file:README.md",
      surfaces: [
        {
          id: "file:src/index.ts",
          kind: "file",
          relativePath: "src/index.ts",
          revealLine: null,
          revealRequestId: 2,
        },
        {
          id: "file:README.md",
          kind: "file",
          relativePath: "README.md",
          revealLine: null,
          revealRequestId: 1,
        },
      ],
    });
  });

  it("updates line reveal requests when reopening a file surface", () => {
    surfaceHarness.getState().openFile(refA, "src/index.ts", 42);
    surfaceHarness.getState().openFile(refA, "src/index.ts", 87);

    expect(selectSurfaceFields(surfaceHarness.getState().byThreadKey, refA)).toEqual({
      isRightPanelOpen: true,
      activeSurfaceId: "file:src/index.ts",
      surfaces: [
        {
          id: "file:src/index.ts",
          kind: "file",
          relativePath: "src/index.ts",
          revealLine: 87,
          revealRequestId: 2,
        },
      ],
    });

    surfaceHarness.getState().openFile(refA, "src/index.ts");

    expect(selectSurfaceFields(surfaceHarness.getState().byThreadKey, refA)).toEqual({
      isRightPanelOpen: true,
      activeSurfaceId: "file:src/index.ts",
      surfaces: [
        {
          id: "file:src/index.ts",
          kind: "file",
          relativePath: "src/index.ts",
          revealLine: null,
          revealRequestId: 3,
        },
      ],
    });
  });

  it("removes persisted file surfaces when their workspace no longer exists", () => {
    surfaceHarness.getState().openFile(refA, "src/index.ts");
    surfaceHarness.getState().open(refA, "agents");
    surfaceHarness.getState().openFile(refA, "README.md");

    surfaceHarness.getState().reconcileFileSurfaces(refA, false);

    expect(selectSurfaceFields(surfaceHarness.getState().byThreadKey, refA)).toEqual({
      isRightPanelOpen: true,
      activeSurfaceId: "agents",
      surfaces: [{ id: "agents", kind: "agents" }],
    });

    surfaceHarness.getState().openFile(refB, "conductor.json");
    surfaceHarness.getState().reconcileFileSurfaces(refB, false);
    expect(selectSurfaceFields(surfaceHarness.getState().byThreadKey, refB)).toEqual({
      isRightPanelOpen: false,
      activeSurfaceId: null,
      surfaces: [],
    });
  });

  it("close hides the panel without clearing its selected surface", () => {
    surfaceHarness.getState().open(refA, "agents");
    surfaceHarness.getState().close(refA);
    expect(selectActiveRightPanel(surfaceHarness.getState().byThreadKey, refA)).toBeNull();
    expect(selectSurfaceFields(surfaceHarness.getState().byThreadKey, refA)).toEqual({
      isRightPanelOpen: false,
      activeSurfaceId: "agents",
      surfaces: [{ id: "agents", kind: "agents" }],
    });
  });

  it("toggles empty panel visibility without creating a surface", () => {
    surfaceHarness.getState().toggleVisibility(refA);
    expect(selectSurfaceFields(surfaceHarness.getState().byThreadKey, refA)).toEqual({
      isRightPanelOpen: true,
      activeSurfaceId: null,
      surfaces: [],
    });

    surfaceHarness.getState().toggleVisibility(refA);
    expect(surfaceHarness.getState().byThreadKey).toEqual({});
  });

  it("toggle hides the panel without discarding the active surface", () => {
    surfaceHarness.getState().toggle(refA, "diff");
    expect(selectActiveRightPanel(surfaceHarness.getState().byThreadKey, refA)).toBe("diff");
    surfaceHarness.getState().toggle(refA, "diff");
    expect(selectActiveRightPanel(surfaceHarness.getState().byThreadKey, refA)).toBeNull();
    expect(selectSurfaceFields(surfaceHarness.getState().byThreadKey, refA)).toEqual({
      isRightPanelOpen: false,
      activeSurfaceId: "diff",
      surfaces: [{ id: "diff", kind: "diff" }],
    });
  });

  it("toggle to a different kind switches active", () => {
    surfaceHarness.getState().toggle(refA, "preview");
    surfaceHarness.getState().toggle(refA, "agents");
    expect(selectActiveRightPanel(surfaceHarness.getState().byThreadKey, refA)).toBe("agents");
  });

  it("removeThread clears persisted state", () => {
    surfaceHarness.getState().open(refA, "agents");
    surfaceHarness.getState().removeThread(refA);
    expect(selectActiveRightPanel(surfaceHarness.getState().byThreadKey, refA)).toBeNull();
  });

  it("close on never-opened thread is a no-op", () => {
    surfaceHarness.getState().close(refA);
    expect(surfaceHarness.getState().byThreadKey).toEqual({});
  });

  it("tracks one surface per browser session", () => {
    surfaceHarness.getState().openBrowser(refA, "tab-a");
    surfaceHarness.getState().openBrowser(refA, "tab-b");

    const state = selectSurfaceFields(surfaceHarness.getState().byThreadKey, refA);
    expect(state.surfaces.map((surface) => surface.id)).toEqual(["browser:tab-a", "browser:tab-b"]);
    expect(selectActiveRightPanelSurface(surfaceHarness.getState().byThreadKey, refA)).toEqual({
      id: "browser:tab-b",
      kind: "preview",
      resourceId: "tab-b",
    });
  });

  it("tracks pull requests as distinct reference-keyed surfaces", () => {
    surfaceHarness.getState().openPullRequest(refA, {
      projectId: "project-a",
      repository: "owner/repo",
      number: 12,
    });
    surfaceHarness.getState().openPullRequest(refA, {
      projectId: "project-a",
      repository: "owner/repo",
      number: 13,
    });

    expect(selectSurfaceFields(surfaceHarness.getState().byThreadKey, refA)).toMatchObject({
      isRightPanelOpen: true,
      activeSurfaceId: "pull-request:project-a:owner%2Frepo:13",
      surfaces: [
        {
          id: "pull-request:project-a:owner%2Frepo:12",
          kind: "pull-request",
          number: 12,
        },
        {
          id: "pull-request:project-a:owner%2Frepo:13",
          kind: "pull-request",
          number: 13,
        },
      ],
    });
  });

  it("tracks one surface per terminal session", () => {
    surfaceHarness.getState().openTerminal(refA, "term-1");
    surfaceHarness.getState().openTerminal(refA, "term-2");

    const state = selectSurfaceFields(surfaceHarness.getState().byThreadKey, refA);
    expect(state.surfaces).toEqual([
      {
        id: "terminal:term-1",
        kind: "terminal",
        resourceId: "term-1",
        terminalIds: ["term-1"],
        activeTerminalId: "term-1",
      },
      {
        id: "terminal:term-2",
        kind: "terminal",
        resourceId: "term-2",
        terminalIds: ["term-2"],
        activeTerminalId: "term-2",
      },
    ]);
    expect(state.activeSurfaceId).toBe("terminal:term-2");
  });

  it("tracks split panes and the active pane within a terminal surface", () => {
    surfaceHarness.getState().openTerminal(refA, "term-1");
    surfaceHarness.getState().splitTerminal(refA, "terminal:term-1", "term-2");

    expect(selectActiveRightPanelSurface(surfaceHarness.getState().byThreadKey, refA)).toEqual({
      id: "terminal:term-1",
      kind: "terminal",
      resourceId: "term-1",
      terminalIds: ["term-1", "term-2"],
      activeTerminalId: "term-2",
    });

    surfaceHarness.getState().activateTerminal(refA, "terminal:term-1", "term-1");
    surfaceHarness.getState().closeTerminal(refA, "terminal:term-1", "term-1");
    expect(selectActiveRightPanelSurface(surfaceHarness.getState().byThreadKey, refA)).toEqual({
      id: "terminal:term-1",
      kind: "terminal",
      resourceId: "term-1",
      terminalIds: ["term-2"],
      activeTerminalId: "term-2",
    });
  });

  it("tracks vertical layout for a terminal surface", () => {
    surfaceHarness.getState().openTerminal(refA, "term-1");
    surfaceHarness.getState().splitTerminal(refA, "terminal:term-1", "term-2", "vertical");

    expect(selectActiveRightPanelSurface(surfaceHarness.getState().byThreadKey, refA)).toEqual({
      id: "terminal:term-1",
      kind: "terminal",
      resourceId: "term-1",
      terminalIds: ["term-1", "term-2"],
      activeTerminalId: "term-2",
      splitDirection: "vertical",
    });
  });

  it("closing the final terminal pane removes its surface and closes the panel", () => {
    surfaceHarness.getState().openTerminal(refA, "term-1");
    surfaceHarness.getState().closeTerminal(refA, "terminal:term-1", "term-1");

    expect(selectSurfaceFields(surfaceHarness.getState().byThreadKey, refA)).toEqual({
      isRightPanelOpen: false,
      activeSurfaceId: null,
      surfaces: [],
    });
  });

  it("closing the active surface activates a neighboring surface", () => {
    surfaceHarness.getState().openBrowser(refA, "tab-a");
    surfaceHarness.getState().openTerminal(refA, "term-1");
    surfaceHarness.getState().closeSurface(refA, "terminal:term-1");

    expect(selectActiveRightPanelSurface(surfaceHarness.getState().byThreadKey, refA)?.id).toBe(
      "browser:tab-a",
    );
  });

  it("closing the final surface closes the panel", () => {
    surfaceHarness.getState().openTerminal(refA, "term-1");
    surfaceHarness.getState().closeSurface(refA, "terminal:term-1");

    expect(selectSurfaceFields(surfaceHarness.getState().byThreadKey, refA)).toEqual({
      isRightPanelOpen: false,
      activeSurfaceId: null,
      surfaces: [],
    });
  });

  it("closing other surfaces keeps the selected surface active", () => {
    surfaceHarness.getState().openBrowser(refA, "tab-a");
    surfaceHarness.getState().openFile(refA, "src/index.ts");
    surfaceHarness.getState().openTerminal(refA, "term-1");

    surfaceHarness.getState().closeOtherSurfaces(refA, "file:src/index.ts");

    expect(selectSurfaceFields(surfaceHarness.getState().byThreadKey, refA)).toEqual({
      isRightPanelOpen: true,
      activeSurfaceId: "file:src/index.ts",
      surfaces: [
        {
          id: "file:src/index.ts",
          kind: "file",
          relativePath: "src/index.ts",
          revealLine: null,
          revealRequestId: 1,
        },
      ],
    });
  });

  it("closing surfaces to the right activates the selected surface when active was removed", () => {
    surfaceHarness.getState().openBrowser(refA, "tab-a");
    surfaceHarness.getState().openFile(refA, "src/index.ts");
    surfaceHarness.getState().openTerminal(refA, "term-1");

    surfaceHarness.getState().closeSurfacesToRight(refA, "browser:tab-a");

    expect(selectSurfaceFields(surfaceHarness.getState().byThreadKey, refA)).toEqual({
      isRightPanelOpen: true,
      activeSurfaceId: "browser:tab-a",
      surfaces: [{ id: "browser:tab-a", kind: "preview", resourceId: "tab-a" }],
    });
  });

  it("closing all surfaces closes the panel", () => {
    surfaceHarness.getState().openBrowser(refA, "tab-a");
    surfaceHarness.getState().openFile(refA, "src/index.ts");

    surfaceHarness.getState().closeAllSurfaces(refA);

    expect(selectSurfaceFields(surfaceHarness.getState().byThreadKey, refA)).toEqual({
      isRightPanelOpen: false,
      activeSurfaceId: null,
      surfaces: [],
    });
  });

  it("reconciles browser surfaces without deleting other surface kinds", () => {
    surfaceHarness.getState().openTerminal(refA, "term-1");
    surfaceHarness.getState().openBrowser(refA, "tab-a");
    surfaceHarness.getState().openBrowser(refA, "tab-b");
    surfaceHarness.getState().reconcileBrowserSurfaces(refA, ["tab-b", "tab-c"]);

    expect(
      selectSurfaceFields(surfaceHarness.getState().byThreadKey, refA).surfaces.map(
        (surface) => surface.id,
      ),
    ).toEqual(["terminal:term-1", "browser:tab-b", "browser:tab-c"]);
  });
});
