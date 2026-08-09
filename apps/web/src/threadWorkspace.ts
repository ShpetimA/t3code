import type { ScopedThreadRef } from "@t3tools/contracts";

import { findEditorGroup } from "./editorWorkspace";
import {
  findSurfaceTabs,
  selectThreadEditorWorkspace,
  useEditorWorkspaceStore,
  type ThreadEditorWorkspace,
  type ThreadEditorWorkspaceTransition,
} from "./editorWorkspaceStore";
import {
  selectThreadRightPanelState,
  useRightPanelStore,
  type RightPanelSurface,
  type RightPanelSurfacePresentation,
  type ThreadRightPanelState,
} from "./rightPanelStore";

export type ThreadWorkspaceSurfaceRequest =
  | { readonly _tag: "Diff" }
  | { readonly _tag: "Files" }
  | { readonly _tag: "Agents" }
  | { readonly _tag: "Browser"; readonly tabId: string | null }
  | { readonly _tag: "File"; readonly relativePath: string; readonly line?: number }
  | { readonly _tag: "Terminal"; readonly terminalId: string };

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
  | { readonly _tag: "ReconcileSurfaces" };

export interface ThreadWorkspaceTransitionResult {
  readonly editorWorkspace: ThreadEditorWorkspace | null;
  readonly rightPanel: ThreadRightPanelState;
  readonly removedSurfaces: readonly RightPanelSurface[];
  readonly selectedSurface: RightPanelSurface | null;
}

/**
 * Owns operations that must keep the surface catalog and editor placements in sync.
 * Resource owners can use `removedSurfaces` to perform their own async cleanup.
 */
export function transitionThreadWorkspace(
  ref: ScopedThreadRef,
  input: ThreadWorkspaceTransition,
): ThreadWorkspaceTransitionResult {
  const beforePanel = currentRightPanel(ref);
  const beforeEditor = currentEditorWorkspace(ref);
  const rightPanelStore = useRightPanelStore.getState();
  const editorWorkspaceStore = useEditorWorkspaceStore.getState();

  switch (input._tag) {
    case "OpenSurface": {
      const surfaceId = openRightPanelSurface(ref, input.surface, input.presentation);
      editorWorkspaceStore.transition(ref, { _tag: "OpenSurface", surfaceId });
      break;
    }
    case "ActivateSurface":
      if (input.presentation === "preserve-panel") {
        rightPanelStore.selectSurface(ref, input.surfaceId);
      } else {
        rightPanelStore.activateSurface(ref, input.surfaceId);
      }
      editorWorkspaceStore.transition(ref, {
        _tag: "ActivateSurface",
        surfaceId: input.surfaceId,
      });
      break;
    case "ApplyEditorTransition": {
      editorWorkspaceStore.transition(ref, input.transition);
      const afterEditor = currentEditorWorkspace(ref);
      if (beforeEditor && afterEditor) {
        for (const surface of beforePanel.surfaces) {
          if (
            findSurfaceTabs(beforeEditor, surface.id).length > 0 &&
            findSurfaceTabs(afterEditor, surface.id).length === 0
          ) {
            rightPanelStore.closeSurface(ref, surface.id);
          }
        }
      }
      selectFocusedWorkspaceSurface(ref);
      break;
    }
    case "CloseSurface":
      rightPanelStore.closeSurface(ref, input.surfaceId);
      break;
    case "CloseOtherSurfaces":
      rightPanelStore.closeOtherSurfaces(ref, input.surfaceId);
      break;
    case "CloseSurfacesToRight":
      rightPanelStore.closeSurfacesToRight(ref, input.surfaceId);
      break;
    case "CloseAllSurfaces":
      rightPanelStore.closeAllSurfaces(ref);
      break;
    case "ToggleSurface":
      rightPanelStore.toggle(ref, input.kind);
      if (currentRightPanel(ref).isOpen) {
        const activeSurfaceId = currentRightPanel(ref).activeSurfaceId;
        if (activeSurfaceId) {
          editorWorkspaceStore.transition(ref, {
            _tag: "ActivateSurface",
            surfaceId: activeSurfaceId,
          });
        }
      }
      break;
    case "ReconcileBrowserSurfaces":
      rightPanelStore.reconcileBrowserSurfaces(ref, input.tabIds);
      break;
    case "ReconcileFileSurfaces":
      rightPanelStore.reconcileFileSurfaces(ref, input.workspaceAvailable);
      break;
    case "SplitTerminal":
      rightPanelStore.splitTerminal(ref, input.surfaceId, input.terminalId, input.direction);
      break;
    case "ActivateTerminal":
      rightPanelStore.activateTerminal(ref, input.surfaceId, input.terminalId);
      break;
    case "CloseTerminal":
      rightPanelStore.closeTerminal(ref, input.surfaceId, input.terminalId);
      break;
    case "ReconcileSurfaces":
      break;
  }

  reconcileEditorSurfaces(ref);
  const rightPanel = currentRightPanel(ref);
  const editorWorkspace = currentEditorWorkspace(ref);
  const remainingSurfaceIds = new Set(rightPanel.surfaces.map((surface) => surface.id));
  const removedSurfaces = beforePanel.surfaces.filter(
    (surface) => !remainingSurfaceIds.has(surface.id),
  );
  return {
    editorWorkspace,
    rightPanel,
    removedSurfaces,
    selectedSurface:
      rightPanel.surfaces.find((surface) => surface.id === rightPanel.activeSurfaceId) ?? null,
  };
}

function openRightPanelSurface(
  ref: ScopedThreadRef,
  request: ThreadWorkspaceSurfaceRequest,
  presentation: RightPanelSurfacePresentation | undefined,
): string {
  const store = useRightPanelStore.getState();
  switch (request._tag) {
    case "Diff":
      store.open(ref, "diff", presentation);
      return "diff";
    case "Files":
      store.open(ref, "files", presentation);
      return "files";
    case "Agents":
      store.open(ref, "agents", presentation);
      return "agents";
    case "Browser":
      store.openBrowser(ref, request.tabId, presentation);
      return request.tabId ? `browser:${request.tabId}` : "browser:new";
    case "File":
      store.openFile(ref, request.relativePath, request.line, presentation);
      return `file:${request.relativePath}`;
    case "Terminal":
      store.openTerminal(ref, request.terminalId, presentation);
      return `terminal:${request.terminalId}`;
  }
}

function reconcileEditorSurfaces(ref: ScopedThreadRef): void {
  const surfaceIds = currentRightPanel(ref).surfaces.map((surface) => surface.id);
  useEditorWorkspaceStore.getState().transition(ref, { _tag: "ReconcileSurfaces", surfaceIds });
}

function selectFocusedWorkspaceSurface(ref: ScopedThreadRef): void {
  const current = currentEditorWorkspace(ref);
  if (!current) return;
  const focusedGroup = findEditorGroup(current.workspace.root, current.workspace.focusedGroupId);
  const activeTab = focusedGroup?.activeTabId ? current.tabsById[focusedGroup.activeTabId] : null;
  if (activeTab?._tag === "Surface") {
    useRightPanelStore.getState().selectSurface(ref, activeTab.surfaceId);
  }
}

function currentEditorWorkspace(ref: ScopedThreadRef): ThreadEditorWorkspace | null {
  return selectThreadEditorWorkspace(useEditorWorkspaceStore.getState().byThreadKey, ref);
}

function currentRightPanel(ref: ScopedThreadRef): ThreadRightPanelState {
  return selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, ref);
}
