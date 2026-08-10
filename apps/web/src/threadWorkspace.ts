import { findPane, type PaneTree } from "./splitPaneTree";
import { DEFAULT_THREAD_TERMINAL_HEIGHT } from "./types";
import {
  createThreadWorkspaceTabFields,
  findSurfaceTabs,
  transitionThreadWorkspaceTabs,
  type ThreadWorkspaceLayoutTransition,
  type ThreadWorkspaceTab,
  type ThreadWorkspaceTabFields,
} from "./threadWorkspaceTabs";
import {
  EMPTY_THREAD_WORKSPACE_SURFACE_FIELDS,
  transitionThreadWorkspaceSurfaces,
  type RightPanelSurface,
  type RightPanelSurfacePresentation,
  type ThreadWorkspaceSurfaceFields,
} from "./threadWorkspaceSurfaces";

export type { ThreadWorkspaceLayoutTransition } from "./threadWorkspaceTabs";
export { findSurfaceTabs, findThreadWorkspaceTabGroup } from "./threadWorkspaceTabs";
export type {
  RightPanelKind,
  RightPanelSurface,
  RightPanelSurfacePresentation,
} from "./threadWorkspaceSurfaces";

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
  | { readonly _tag: "ShowBottomPanel" }
  | { readonly _tag: "CloseBottomPanel" }
  | { readonly _tag: "ToggleBottomPanel" }
  | { readonly _tag: "ResizeBottomPanel"; readonly height: number }
  | { readonly _tag: "ReconcileSurfaces" }
  | ThreadWorkspaceLayoutTransition;

/** The complete thread-owned surface catalog, pane placement, and shell-layout state. */
export interface ThreadWorkspaceState {
  readonly paneTree: PaneTree;
  readonly tabsById: Readonly<Record<string, ThreadWorkspaceTab>>;
  readonly nextId: number;
  readonly isRightPanelOpen: boolean;
  readonly activeSurfaceId: string | null;
  readonly surfaces: readonly RightPanelSurface[];
  readonly bottomPanelOpen: boolean;
  readonly bottomPanelHeight: number;
}

/** Observable outcome of one thread-workspace transition. */
export interface ThreadWorkspaceTransitionResult {
  readonly state: ThreadWorkspaceState;
  readonly removedSurfaces: readonly RightPanelSurface[];
  readonly selectedSurface: RightPanelSurface | null;
}

/** Stable empty state for selectors before a thread has persisted workspace state. */
export const EMPTY_THREAD_WORKSPACE_STATE: ThreadWorkspaceState = {
  ...createThreadWorkspaceTabFields(),
  ...EMPTY_THREAD_WORKSPACE_SURFACE_FIELDS,
  bottomPanelOpen: false,
  bottomPanelHeight: DEFAULT_THREAD_TERMINAL_HEIGHT,
};

/** Creates a thread workspace with its always-on thread tab. */
export function createThreadWorkspaceState(): ThreadWorkspaceState {
  return EMPTY_THREAD_WORKSPACE_STATE;
}

/** Applies surface and pane rules together as one pure state transition. */
export function transitionThreadWorkspaceState(
  current: ThreadWorkspaceState,
  input: ThreadWorkspaceTransition,
): ThreadWorkspaceTransitionResult {
  let tabFields: ThreadWorkspaceTabFields = current;
  let surfaceFields: ThreadWorkspaceSurfaceFields = current;
  let bottomPanelOpen = current.bottomPanelOpen;
  let bottomPanelHeight = current.bottomPanelHeight;

  switch (input._tag) {
    case "OpenSurface": {
      const opened = openThreadWorkspaceSurface(surfaceFields, input.surface, input.presentation);
      surfaceFields = opened.surfaceFields;
      for (const previousSurfaceId of opened.previousSurfaceIds) {
        tabFields = transitionThreadWorkspaceTabs(tabFields, {
          _tag: "ReplaceSurfaceTabs",
          previousSurfaceId,
          nextSurfaceId: opened.surfaceId,
        });
      }
      tabFields = transitionThreadWorkspaceTabs(tabFields, {
        _tag: "OpenSurfaceTab",
        surfaceId: opened.surfaceId,
      });
      break;
    }
    case "ActivateSurface":
      surfaceFields = transitionThreadWorkspaceSurfaces(surfaceFields, {
        _tag: input.presentation === "preserve-panel" ? "SelectSurface" : "ActivateSurface",
        surfaceId: input.surfaceId,
      });
      tabFields = transitionThreadWorkspaceTabs(tabFields, {
        _tag: "ActivateSurfaceTab",
        surfaceId: input.surfaceId,
      });
      break;
    case "ActivateThread":
    case "ActivateTab":
    case "FocusPane":
    case "TogglePaneMaximized":
    case "ResizeSplit":
    case "SplitPane":
    case "SplitTab":
    case "ReorderTab":
    case "MoveTabToPane":
    case "MoveTabToSplit":
    case "SwapPanes":
    case "CloseSurfaceTab":
    case "CloseOtherSurfaceTabs":
    case "CloseSurfaceTabsToRight":
    case "CloseAllSurfaceTabs":
    case "CloseEmptyPane": {
      const beforeTabs = tabFields;
      tabFields = transitionThreadWorkspaceTabs(tabFields, input);
      for (const surface of surfaceFields.surfaces) {
        if (
          findSurfaceTabs(beforeTabs, surface.id).length > 0 &&
          findSurfaceTabs(tabFields, surface.id).length === 0
        ) {
          surfaceFields = transitionThreadWorkspaceSurfaces(surfaceFields, {
            _tag: "CloseSurface",
            surfaceId: surface.id,
          });
        }
      }
      surfaceFields = selectFocusedWorkspaceSurface(tabFields, surfaceFields);
      break;
    }
    case "CloseSurface":
      surfaceFields = transitionThreadWorkspaceSurfaces(surfaceFields, input);
      break;
    case "CloseOtherSurfaces":
      surfaceFields = transitionThreadWorkspaceSurfaces(surfaceFields, input);
      break;
    case "CloseSurfacesToRight":
      surfaceFields = transitionThreadWorkspaceSurfaces(surfaceFields, input);
      break;
    case "CloseAllSurfaces":
      surfaceFields = transitionThreadWorkspaceSurfaces(surfaceFields, input);
      break;
    case "ToggleSurface": {
      surfaceFields = transitionThreadWorkspaceSurfaces(surfaceFields, {
        _tag: "ToggleKind",
        kind: input.kind,
      });
      if (surfaceFields.isRightPanelOpen && surfaceFields.activeSurfaceId) {
        tabFields = transitionThreadWorkspaceTabs(tabFields, {
          _tag: "ActivateSurfaceTab",
          surfaceId: surfaceFields.activeSurfaceId,
        });
      }
      break;
    }
    case "ReconcileBrowserSurfaces": {
      const placeholder = surfaceFields.surfaces.find(
        (surface) => surface.kind === "preview" && surface.resourceId === null,
      );
      const previousSurfaceIds = new Set(surfaceFields.surfaces.map((surface) => surface.id));
      surfaceFields = transitionThreadWorkspaceSurfaces(surfaceFields, input);
      const firstNewBrowser = surfaceFields.surfaces.find(
        (surface) =>
          surface.kind === "preview" &&
          surface.resourceId !== null &&
          !previousSurfaceIds.has(surface.id),
      );
      if (placeholder && firstNewBrowser) {
        tabFields = transitionThreadWorkspaceTabs(tabFields, {
          _tag: "ReplaceSurfaceTabs",
          previousSurfaceId: placeholder.id,
          nextSurfaceId: firstNewBrowser.id,
        });
      }
      break;
    }
    case "ReconcileFileSurfaces":
      surfaceFields = transitionThreadWorkspaceSurfaces(surfaceFields, input);
      break;
    case "SplitTerminal":
      surfaceFields = transitionThreadWorkspaceSurfaces(surfaceFields, input);
      break;
    case "ActivateTerminal":
      surfaceFields = transitionThreadWorkspaceSurfaces(surfaceFields, input);
      break;
    case "CloseTerminal":
      surfaceFields = transitionThreadWorkspaceSurfaces(surfaceFields, input);
      break;
    case "ShowRightPanel":
      surfaceFields = transitionThreadWorkspaceSurfaces(surfaceFields, { _tag: "ShowPanel" });
      break;
    case "CloseRightPanel":
      surfaceFields = transitionThreadWorkspaceSurfaces(surfaceFields, { _tag: "ClosePanel" });
      break;
    case "ToggleRightPanel":
      surfaceFields = transitionThreadWorkspaceSurfaces(surfaceFields, {
        _tag: "TogglePanelVisibility",
      });
      break;
    case "ShowBottomPanel":
      bottomPanelOpen = true;
      break;
    case "CloseBottomPanel":
      bottomPanelOpen = false;
      break;
    case "ToggleBottomPanel":
      bottomPanelOpen = !bottomPanelOpen;
      break;
    case "ResizeBottomPanel":
      if (Number.isFinite(input.height) && input.height > 0) {
        bottomPanelHeight = input.height;
      }
      break;
    case "ReconcileSurfaces":
      break;
  }

  tabFields = transitionThreadWorkspaceTabs(tabFields, {
    _tag: "ReconcileSurfaceTabs",
    surfaceIds: surfaceFields.surfaces.map((surface) => surface.id),
  });
  const remainingSurfaceIds = new Set(surfaceFields.surfaces.map((surface) => surface.id));
  const removedSurfaces = current.surfaces.filter(
    (surface) => !remainingSurfaceIds.has(surface.id),
  );
  const state =
    tabFields === current &&
    surfaceFields === current &&
    bottomPanelOpen === current.bottomPanelOpen &&
    bottomPanelHeight === current.bottomPanelHeight
      ? current
      : {
          paneTree: tabFields.paneTree,
          tabsById: tabFields.tabsById,
          nextId: tabFields.nextId,
          isRightPanelOpen: surfaceFields.isRightPanelOpen,
          activeSurfaceId: surfaceFields.activeSurfaceId,
          surfaces: surfaceFields.surfaces,
          bottomPanelOpen,
          bottomPanelHeight,
        };
  return {
    state,
    removedSurfaces,
    selectedSurface:
      surfaceFields.surfaces.find((surface) => surface.id === surfaceFields.activeSurfaceId) ?? null,
  };
}

function openThreadWorkspaceSurface(
  current: ThreadWorkspaceSurfaceFields,
  request: ThreadWorkspaceSurfaceRequest,
  presentation: RightPanelSurfacePresentation | undefined,
): {
  readonly surfaceFields: ThreadWorkspaceSurfaceFields;
  readonly surfaceId: string;
  readonly previousSurfaceIds: readonly string[];
} {
  switch (request._tag) {
    case "Diff":
      return {
        surfaceFields: transitionThreadWorkspaceSurfaces(current, {
          _tag: "OpenKind",
          kind: "diff",
          ...(presentation ? { presentation } : {}),
        }),
        surfaceId: "diff",
        previousSurfaceIds: [],
      };
    case "Files":
      return {
        surfaceFields: transitionThreadWorkspaceSurfaces(current, {
          _tag: "OpenKind",
          kind: "files",
          ...(presentation ? { presentation } : {}),
        }),
        surfaceId: "files",
        previousSurfaceIds: [],
      };
    case "Agents":
      return {
        surfaceFields: transitionThreadWorkspaceSurfaces(current, {
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
        surfaceFields: transitionThreadWorkspaceSurfaces(current, {
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
        surfaceFields: transitionThreadWorkspaceSurfaces(current, {
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
        surfaceFields: transitionThreadWorkspaceSurfaces(current, {
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
  workspace: ThreadWorkspaceTabFields,
  surfaceFields: ThreadWorkspaceSurfaceFields,
): ThreadWorkspaceSurfaceFields {
  const focusedGroup = findPane(
    workspace.paneTree.root,
    workspace.paneTree.focusedPaneId,
  );
  const activeTab = focusedGroup?.activeTabId
    ? workspace.tabsById[focusedGroup.activeTabId]
    : null;
  return activeTab?._tag === "Surface"
    ? transitionThreadWorkspaceSurfaces(surfaceFields, {
        _tag: "SelectSurface",
        surfaceId: activeTab.surfaceId,
      })
    : surfaceFields;
}
