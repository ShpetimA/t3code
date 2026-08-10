import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { parsePersistedThreadWorkspaceTabs } from "./threadWorkspaceTabs";
import { resolveStorage } from "./lib/storage";
import {
  parsePersistedThreadWorkspaceSurfaces,
  type RightPanelKind,
  type RightPanelSurface,
} from "./threadWorkspaceSurfaces";
import {
  createThreadWorkspaceState,
  EMPTY_THREAD_WORKSPACE_STATE,
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

const THREAD_WORKSPACE_STORAGE_KEY = "t3code:thread-workspace-state:v2";
const THREAD_WORKSPACE_STORAGE_VERSION = 2;

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
    const tabFields = parsePersistedThreadWorkspaceTabs({
      byThreadKey: { [threadKey]: rawWorkspace },
    }).byThreadKey[threadKey];
    const surfaceFields = parsePersistedThreadWorkspaceSurfaces({
      byThreadKey: { [threadKey]: rawWorkspace },
    }).byThreadKey[threadKey];
    if (!tabFields || !surfaceFields) continue;
    byThreadKey[threadKey] = transitionThreadWorkspaceState(
      { ...tabFields, ...surfaceFields },
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

/** Selects one thread workspace, falling back to the stable initial state. */
export function selectThreadWorkspaceOrDefault(
  byThreadKey: Readonly<Record<string, ThreadWorkspaceState>>,
  ref: ScopedThreadRef | null | undefined,
): ThreadWorkspaceState {
  return selectThreadWorkspace(byThreadKey, ref) ?? EMPTY_THREAD_WORKSPACE_STATE;
}

/** Selects the visible legacy right-panel kind for one thread workspace. */
export function selectActiveRightPanel(
  byThreadKey: Readonly<Record<string, ThreadWorkspaceState>>,
  ref: ScopedThreadRef | null | undefined,
): RightPanelKind | null {
  const state = selectThreadWorkspace(byThreadKey, ref);
  if (!state?.isRightPanelOpen) return null;
  return state.surfaces.find((surface) => surface.id === state.activeSurfaceId)?.kind ?? null;
}

/** Selects the visible legacy right-panel surface for one thread workspace. */
export function selectActiveRightPanelSurface(
  byThreadKey: Readonly<Record<string, ThreadWorkspaceState>>,
  ref: ScopedThreadRef | null | undefined,
): RightPanelSurface | null {
  const state = selectThreadWorkspace(byThreadKey, ref);
  if (!state?.isRightPanelOpen) return null;
  return state.surfaces.find((surface) => surface.id === state.activeSurfaceId) ?? null;
}

/** The single persisted store for thread surfaces and pane placement. */
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
