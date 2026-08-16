import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import {
  parsePersistedGlobalTabsState,
  projectGlobalTabsState,
  transitionGlobalTabs,
  type GlobalTabsState,
  type GlobalTabsTransition,
  type GlobalTabsTransitionResult,
} from "./globalTabs";
import { resolveStorage } from "./lib/storage";

interface GlobalTabsStoreState extends GlobalTabsState {
  readonly transition: (input: GlobalTabsTransition) => GlobalTabsTransitionResult;
}

const GLOBAL_THREAD_TABS_STORAGE_KEY = "t3code:global-thread-tabs:v1";
const GLOBAL_THREAD_TABS_STORAGE_VERSION = 1;

/** Client-local persisted tab ordering, restoration target, and explicitly visited history. */
export const useGlobalTabsStore = create<GlobalTabsStoreState>()(
  persist(
    (set, get) => ({
      tabs: [],
      lastActiveTabKey: null,
      historyTabKeys: [],
      transition: (input: GlobalTabsTransition) => {
        const current = get();
        const result = transitionGlobalTabs(current, input);
        if (result.state !== current) {
          set({
            tabs: result.state.tabs,
            lastActiveTabKey: result.state.lastActiveTabKey,
            historyTabKeys: result.state.historyTabKeys,
          });
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
      partialize: (state) => projectGlobalTabsState(state),
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...parsePersistedGlobalTabsState(persistedState),
      }),
    },
  ),
);
