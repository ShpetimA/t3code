import { findEditorGroup } from "./editorWorkspace";
import {
  createThreadEditorWorkspace,
  findSurfaceTabs,
  transitionThreadEditorWorkspace,
  type ThreadEditorWorkspace,
  type ThreadEditorWorkspaceTransition,
} from "./threadEditorWorkspace";
import {
  EMPTY_THREAD_RIGHT_PANEL_STATE,
  transitionThreadRightPanel,
  type RightPanelSurface,
  type RightPanelSurfacePresentation,
  type ThreadRightPanelState,
} from "./threadWorkspaceSurface";

/** Identifies a surface resource that should exist in a thread workspace. */
export type ThreadWorkspaceSurfaceRequest =
  | { readonly _tag: "Diff" }
  | { readonly _tag: "Files" }
  | { readonly _tag: "Agents" }
  | { readonly _tag: "Browser"; readonly tabId: string | null }
  | { readonly _tag: "File"; readonly relativePath: string; readonly line?: number }
  | { readonly _tag: "Terminal"; readonly terminalId: string };

/** Describes one atomic thread-workspace operation. */
export type ThreadWorkspaceTransition =
  | {
      readonly _tag: "OpenSurface";
      readonly surface: ThreadWorkspaceSurfaceRequest;
      readonly presentation?: RightPanelSurfacePresentation;
    }
  | {
      readonly _tag: "ActivateSurface";
      readonly surfaceId: string;
      readonly presentation?: RightPanelSurfacePresentation;
    }
  | { readonly _tag: "ApplyEditorTransition"; readonly transition: ThreadEditorWorkspaceTransition }
  | { readonly _tag: "CloseSurface"; readonly surfaceId: string }
  | { readonly _tag: "CloseOtherSurfaces"; readonly surfaceId: string }
  | { readonly _tag: "CloseSurfacesToRight"; readonly surfaceId: string }
  | { readonly _tag: "CloseAllSurfaces" }
  | { readonly _tag: "ToggleSurface"; readonly kind: "diff" | "files" | "agents" | "preview" }
  | { readonly _tag: "ReconcileBrowserSurfaces"; readonly tabIds: readonly string[] }
  | { readonly _tag: "ReconcileFileSurfaces"; readonly workspaceAvailable: boolean }
  | {
      readonly _tag: "SplitTerminal";
      readonly surfaceId: string;
      readonly terminalId: string;
      readonly direction: "horizontal" | "vertical";
    }
  | { readonly _tag: "ActivateTerminal"; readonly surfaceId: string; readonly terminalId: string }
  | { readonly _tag: "CloseTerminal"; readonly surfaceId: string; readonly terminalId: string }
  | { readonly _tag: "ShowRightPanel" }
  | { readonly _tag: "CloseRightPanel" }
  | { readonly _tag: "ToggleRightPanel" }
  | { readonly _tag: "ReconcileSurfaces" };

/** The complete thread-owned surface catalog, editor placement, and presentation state. */
export interface ThreadWorkspaceState {
  readonly editorWorkspace: ThreadEditorWorkspace;
  readonly rightPanel: ThreadRightPanelState;
}

/** Observable outcome of one thread-workspace transition. */
export interface ThreadWorkspaceTransitionResult {
  readonly state: ThreadWorkspaceState;
  readonly editorWorkspace: ThreadEditorWorkspace;
  readonly rightPanel: ThreadRightPanelState;
  readonly removedSurfaces: readonly RightPanelSurface[];
  readonly selectedSurface: RightPanelSurface | null;
}

/** Creates a thread workspace with its always-on thread tab. */
export function createThreadWorkspaceState(): ThreadWorkspaceState {
  return {
    editorWorkspace: createThreadEditorWorkspace(),
    rightPanel: EMPTY_THREAD_RIGHT_PANEL_STATE,
  };
}

/** Applies surface and editor rules together as one pure state transition. */
export function transitionThreadWorkspaceState(
  current: ThreadWorkspaceState,
  input: ThreadWorkspaceTransition,
): ThreadWorkspaceTransitionResult {
  let editorWorkspace = current.editorWorkspace;
  let rightPanel = current.rightPanel;

  switch (input._tag) {
    case "OpenSurface": {
      const opened = openThreadWorkspaceSurface(rightPanel, input.surface, input.presentation);
      rightPanel = opened.rightPanel;
      for (const previousSurfaceId of opened.previousSurfaceIds) {
        editorWorkspace = transitionThreadEditorWorkspace(editorWorkspace, {
          _tag: "ReplaceSurface",
          previousSurfaceId,
          nextSurfaceId: opened.surfaceId,
        });
      }
      editorWorkspace = transitionThreadEditorWorkspace(editorWorkspace, {
        _tag: "OpenSurface",
        surfaceId: opened.surfaceId,
      });
      break;
    }
    case "ActivateSurface":
      rightPanel = transitionThreadRightPanel(rightPanel, {
        _tag: input.presentation === "preserve-panel" ? "SelectSurface" : "ActivateSurface",
        surfaceId: input.surfaceId,
      });
      editorWorkspace = transitionThreadEditorWorkspace(editorWorkspace, {
        _tag: "ActivateSurface",
        surfaceId: input.surfaceId,
      });
      break;
    case "ApplyEditorTransition": {
      const beforeEditor = editorWorkspace;
      editorWorkspace = transitionThreadEditorWorkspace(editorWorkspace, input.transition);
      for (const surface of rightPanel.surfaces) {
        if (
          findSurfaceTabs(beforeEditor, surface.id).length > 0 &&
          findSurfaceTabs(editorWorkspace, surface.id).length === 0
        ) {
          rightPanel = transitionThreadRightPanel(rightPanel, {
            _tag: "CloseSurface",
            surfaceId: surface.id,
          });
        }
      }
      rightPanel = selectFocusedWorkspaceSurface(editorWorkspace, rightPanel);
      break;
    }
    case "CloseSurface":
      rightPanel = transitionThreadRightPanel(rightPanel, input);
      break;
    case "CloseOtherSurfaces":
      rightPanel = transitionThreadRightPanel(rightPanel, input);
      break;
    case "CloseSurfacesToRight":
      rightPanel = transitionThreadRightPanel(rightPanel, input);
      break;
    case "CloseAllSurfaces":
      rightPanel = transitionThreadRightPanel(rightPanel, input);
      break;
    case "ToggleSurface": {
      rightPanel = transitionThreadRightPanel(rightPanel, {
        _tag: "ToggleKind",
        kind: input.kind,
      });
      if (rightPanel.isOpen && rightPanel.activeSurfaceId) {
        editorWorkspace = transitionThreadEditorWorkspace(editorWorkspace, {
          _tag: "ActivateSurface",
          surfaceId: rightPanel.activeSurfaceId,
        });
      }
      break;
    }
    case "ReconcileBrowserSurfaces": {
      const placeholder = rightPanel.surfaces.find(
        (surface) => surface.kind === "preview" && surface.resourceId === null,
      );
      const previousSurfaceIds = new Set(rightPanel.surfaces.map((surface) => surface.id));
      rightPanel = transitionThreadRightPanel(rightPanel, input);
      const firstNewBrowser = rightPanel.surfaces.find(
        (surface) =>
          surface.kind === "preview" &&
          surface.resourceId !== null &&
          !previousSurfaceIds.has(surface.id),
      );
      if (placeholder && firstNewBrowser) {
        editorWorkspace = transitionThreadEditorWorkspace(editorWorkspace, {
          _tag: "ReplaceSurface",
          previousSurfaceId: placeholder.id,
          nextSurfaceId: firstNewBrowser.id,
        });
      }
      break;
    }
    case "ReconcileFileSurfaces":
      rightPanel = transitionThreadRightPanel(rightPanel, input);
      break;
    case "SplitTerminal":
      rightPanel = transitionThreadRightPanel(rightPanel, input);
      break;
    case "ActivateTerminal":
      rightPanel = transitionThreadRightPanel(rightPanel, input);
      break;
    case "CloseTerminal":
      rightPanel = transitionThreadRightPanel(rightPanel, input);
      break;
    case "ShowRightPanel":
      rightPanel = transitionThreadRightPanel(rightPanel, { _tag: "ShowPanel" });
      break;
    case "CloseRightPanel":
      rightPanel = transitionThreadRightPanel(rightPanel, { _tag: "ClosePanel" });
      break;
    case "ToggleRightPanel":
      rightPanel = transitionThreadRightPanel(rightPanel, { _tag: "TogglePanelVisibility" });
      break;
    case "ReconcileSurfaces":
      break;
  }

  editorWorkspace = transitionThreadEditorWorkspace(editorWorkspace, {
    _tag: "ReconcileSurfaces",
    surfaceIds: rightPanel.surfaces.map((surface) => surface.id),
  });
  const remainingSurfaceIds = new Set(rightPanel.surfaces.map((surface) => surface.id));
  const removedSurfaces = current.rightPanel.surfaces.filter(
    (surface) => !remainingSurfaceIds.has(surface.id),
  );
  const state =
    editorWorkspace === current.editorWorkspace && rightPanel === current.rightPanel
      ? current
      : { editorWorkspace, rightPanel };
  return {
    state,
    editorWorkspace,
    rightPanel,
    removedSurfaces,
    selectedSurface:
      rightPanel.surfaces.find((surface) => surface.id === rightPanel.activeSurfaceId) ?? null,
  };
}

function openThreadWorkspaceSurface(
  current: ThreadRightPanelState,
  request: ThreadWorkspaceSurfaceRequest,
  presentation: RightPanelSurfacePresentation | undefined,
): {
  readonly rightPanel: ThreadRightPanelState;
  readonly surfaceId: string;
  readonly previousSurfaceIds: readonly string[];
} {
  switch (request._tag) {
    case "Diff":
      return {
        rightPanel: transitionThreadRightPanel(current, {
          _tag: "OpenKind",
          kind: "diff",
          ...(presentation ? { presentation } : {}),
        }),
        surfaceId: "diff",
        previousSurfaceIds: [],
      };
    case "Files":
      return {
        rightPanel: transitionThreadRightPanel(current, {
          _tag: "OpenKind",
          kind: "files",
          ...(presentation ? { presentation } : {}),
        }),
        surfaceId: "files",
        previousSurfaceIds: [],
      };
    case "Agents":
      return {
        rightPanel: transitionThreadRightPanel(current, {
          _tag: "OpenKind",
          kind: "agents",
          ...(presentation ? { presentation } : {}),
        }),
        surfaceId: "agents",
        previousSurfaceIds: [],
      };
    case "Browser": {
      const placeholder = current.surfaces.find(
        (surface) => surface.kind === "preview" && surface.resourceId === null,
      );
      return {
        rightPanel: transitionThreadRightPanel(current, {
          _tag: "OpenBrowser",
          tabId: request.tabId,
          ...(presentation ? { presentation } : {}),
        }),
        surfaceId: request.tabId ? `browser:${request.tabId}` : "browser:new",
        previousSurfaceIds: request.tabId && placeholder ? [placeholder.id] : [],
      };
    }
    case "File":
      return {
        rightPanel: transitionThreadRightPanel(current, {
          _tag: "OpenFile",
          relativePath: request.relativePath,
          ...(request.line !== undefined ? { line: request.line } : {}),
          ...(presentation ? { presentation } : {}),
        }),
        surfaceId: `file:${request.relativePath}`,
        previousSurfaceIds: current.surfaces.some((surface) => surface.kind === "files")
          ? ["files"]
          : [],
      };
    case "Terminal":
      return {
        rightPanel: transitionThreadRightPanel(current, {
          _tag: "OpenTerminal",
          terminalId: request.terminalId,
          ...(presentation ? { presentation } : {}),
        }),
        surfaceId: `terminal:${request.terminalId}`,
        previousSurfaceIds: [],
      };
  }
}

function selectFocusedWorkspaceSurface(
  editorWorkspace: ThreadEditorWorkspace,
  rightPanel: ThreadRightPanelState,
): ThreadRightPanelState {
  const focusedGroup = findEditorGroup(
    editorWorkspace.workspace.root,
    editorWorkspace.workspace.focusedGroupId,
  );
  const activeTab = focusedGroup?.activeTabId
    ? editorWorkspace.tabsById[focusedGroup.activeTabId]
    : null;
  return activeTab?._tag === "Surface"
    ? transitionThreadRightPanel(rightPanel, {
        _tag: "SelectSurface",
        surfaceId: activeTab.surfaceId,
      })
    : rightPanel;
}
