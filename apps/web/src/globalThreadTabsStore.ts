import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import {
  parsePersistedGlobalThreadTabsState,
  projectGlobalThreadTabsState,
  transitionGlobalThreadTabs,
  type GlobalThreadTabsState,
  type GlobalThreadTabsTransition,
  type GlobalThreadTabsTransitionResult,
} from "./globalThreadTabs";
import { resolveStorage } from "./lib/storage";

interface GlobalThreadTabsStoreState extends GlobalThreadTabsState {
  readonly transition: (input: GlobalThreadTabsTransition) => GlobalThreadTabsTransitionResult;
}

const GLOBAL_THREAD_TABS_STORAGE_KEY = "t3code:global-thread-tabs:v1";
const GLOBAL_THREAD_TABS_STORAGE_VERSION = 1;

/** Client-local persisted collection of explicitly opened global thread tabs. */
export const useGlobalThreadTabsStore = create<GlobalThreadTabsStoreState>()(
  persist(
    (set, get) => ({
      tabs: [],
      transition: (input: GlobalThreadTabsTransition) => {
        const current = get();
        const result = transitionGlobalThreadTabs(current, input);
        if (result.state !== current) {
          set({ tabs: result.state.tabs });
        }
        return result;
      },
    }),
    {
      name: GLOBAL_THREAD_TABS_STORAGE_KEY,
      version: GLOBAL_THREAD_TABS_STORAGE_VERSION,
      storage: createJSONStorage(() =>
        resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
      ),
      partialize: (state) => projectGlobalThreadTabsState(state),
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...parsePersistedGlobalThreadTabsState(persistedState),
      }),
    },
  ),
);

/** Applies one transition through the global thread-tab store. */
export function transitionGlobalThreadTabsStore(
  input: GlobalThreadTabsTransition,
): GlobalThreadTabsTransitionResult {
  return useGlobalThreadTabsStore.getState().transition(input);
}
