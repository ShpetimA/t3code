import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import {
  parsePersistedEditorWorkspaceState,
  type ThreadEditorWorkspaceTransition,
} from "./threadEditorWorkspace";
import { resolveStorage } from "./lib/storage";
import {
  EMPTY_THREAD_RIGHT_PANEL_STATE,
  migratePersistedRightPanelState,
  type RightPanelKind,
  type RightPanelSurface,
  type ThreadRightPanelState,
} from "./threadWorkspaceSurface";
import {
  createThreadWorkspaceState,
  transitionThreadWorkspaceState,
  type ThreadWorkspaceState,
  type ThreadWorkspaceTransition,
  type ThreadWorkspaceTransitionResult,
} from "./threadWorkspace";

interface ThreadWorkspaceStoreState {
  readonly byThreadKey: Readonly<Record<string, ThreadWorkspaceState>>;
  readonly transition: (
    ref: ScopedThreadRef,
    input: ThreadWorkspaceTransition,
  ) => ThreadWorkspaceTransitionResult;
  readonly removeThread: (ref: ScopedThreadRef) => void;
}

const THREAD_WORKSPACE_STORAGE_KEY = "t3code:thread-workspace-state:v1";
const THREAD_WORKSPACE_STORAGE_VERSION = 1;

/** Parses persisted aggregate workspace state at the local-storage boundary. */
export function parsePersistedThreadWorkspaceState(input: unknown): {
  readonly byThreadKey: Readonly<Record<string, ThreadWorkspaceState>>;
} {
  if (!input || typeof input !== "object" || !("byThreadKey" in input)) {
    return { byThreadKey: {} };
  }
  const rawByThreadKey = input.byThreadKey;
  if (!rawByThreadKey || typeof rawByThreadKey !== "object") {
    return { byThreadKey: {} };
  }

  const byThreadKey: Record<string, ThreadWorkspaceState> = {};
  for (const [threadKey, rawWorkspace] of Object.entries(rawByThreadKey)) {
    if (
      !rawWorkspace ||
      typeof rawWorkspace !== "object" ||
      !("editorWorkspace" in rawWorkspace) ||
      !("rightPanel" in rawWorkspace)
    ) {
      continue;
    }
    const editorWorkspace = parsePersistedEditorWorkspaceState({
      byThreadKey: { [threadKey]: rawWorkspace.editorWorkspace },
    }).byThreadKey[threadKey];
    const rightPanel = migratePersistedRightPanelState({
      byThreadKey: { [threadKey]: rawWorkspace.rightPanel },
    }).byThreadKey[threadKey];
    if (!editorWorkspace || !rightPanel) continue;
    byThreadKey[threadKey] = transitionThreadWorkspaceState(
      { editorWorkspace, rightPanel },
      { _tag: "ReconcileSurfaces" },
    ).state;
  }
  return { byThreadKey };
}

/** Selects one thread's complete workspace aggregate. */
export function selectThreadWorkspace(
  byThreadKey: Readonly<Record<string, ThreadWorkspaceState>>,
  ref: ScopedThreadRef | null | undefined,
): ThreadWorkspaceState | null {
  return ref ? (byThreadKey[scopedThreadKey(ref)] ?? null) : null;
}

/** Selects the editor placement portion of one thread workspace. */
export function selectThreadEditorWorkspace(
  byThreadKey: Readonly<Record<string, ThreadWorkspaceState>>,
  ref: ScopedThreadRef | null | undefined,
): ThreadWorkspaceState["editorWorkspace"] | null {
  return selectThreadWorkspace(byThreadKey, ref)?.editorWorkspace ?? null;
}

/** Selects the surface catalog and right-panel presentation for one thread workspace. */
export function selectThreadRightPanelState(
  byThreadKey: Readonly<Record<string, ThreadWorkspaceState>>,
  ref: ScopedThreadRef | null | undefined,
): ThreadRightPanelState {
  return selectThreadWorkspace(byThreadKey, ref)?.rightPanel ?? EMPTY_THREAD_RIGHT_PANEL_STATE;
}

/** Selects the visible legacy right-panel kind for one thread workspace. */
export function selectActiveRightPanel(
  byThreadKey: Readonly<Record<string, ThreadWorkspaceState>>,
  ref: ScopedThreadRef | null | undefined,
): RightPanelKind | null {
  const state = selectThreadRightPanelState(byThreadKey, ref);
  if (!state.isOpen) return null;
  return state.surfaces.find((surface) => surface.id === state.activeSurfaceId)?.kind ?? null;
}

/** Selects the visible legacy right-panel surface for one thread workspace. */
export function selectActiveRightPanelSurface(
  byThreadKey: Readonly<Record<string, ThreadWorkspaceState>>,
  ref: ScopedThreadRef | null | undefined,
): RightPanelSurface | null {
  const state = selectThreadRightPanelState(byThreadKey, ref);
  if (!state.isOpen) return null;
  return state.surfaces.find((surface) => surface.id === state.activeSurfaceId) ?? null;
}

/** The single persisted store for thread surfaces and editor placement. */
export const useThreadWorkspaceStore = create<ThreadWorkspaceStoreState>()(
  persist(
    (set, get) => ({
      byThreadKey: {},
      transition: (ref, input) => {
        const threadKey = scopedThreadKey(ref);
        const existing = get().byThreadKey[threadKey];
        const current = existing ?? createThreadWorkspaceState();
        const result = transitionThreadWorkspaceState(current, input);
        if (existing && result.state === existing) return result;
        set((state) => ({
          byThreadKey: { ...state.byThreadKey, [threadKey]: result.state },
        }));
        return result;
      },
      removeThread: (ref) =>
        set((state) => {
          const threadKey = scopedThreadKey(ref);
          if (!(threadKey in state.byThreadKey)) return state;
          const { [threadKey]: _removed, ...byThreadKey } = state.byThreadKey;
          return { byThreadKey };
        }),
    }),
    {
      name: THREAD_WORKSPACE_STORAGE_KEY,
      version: THREAD_WORKSPACE_STORAGE_VERSION,
      storage: createJSONStorage(() =>
        resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
      ),
      partialize: (state) => ({ byThreadKey: state.byThreadKey }),
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...parsePersistedThreadWorkspaceState(persistedState),
      }),
    },
  ),
);

/** Applies one atomic transition to the persisted thread-workspace store. */
export function transitionThreadWorkspace(
  ref: ScopedThreadRef,
  input: ThreadWorkspaceTransition,
): ThreadWorkspaceTransitionResult {
  return useThreadWorkspaceStore.getState().transition(ref, input);
}

/** Applies one editor-layout action through the owning thread-workspace transition. */
export function transitionThreadEditorWorkspace(
  ref: ScopedThreadRef,
  transition: ThreadEditorWorkspaceTransition,
): ThreadWorkspaceTransitionResult {
  return transitionThreadWorkspace(ref, { _tag: "ApplyEditorTransition", transition });
}
