import type { ThreadWorkspaceDefaultLayout } from "@t3tools/contracts";
import { create } from "zustand";

import {
  INITIAL_THREAD_WORKSPACE_VIEW,
  reduceThreadWorkspaceView,
  type ThreadWorkspaceViewState,
} from "./components/ChatView.logic";

interface ThreadWorkspaceViewStore {
  readonly view: ThreadWorkspaceViewState;
  readonly appliedDefaultLayout: ThreadWorkspaceDefaultLayout | null;
  readonly applyDefaultLayout: (layout: ThreadWorkspaceDefaultLayout) => void;
  readonly enterWorkspace: () => void;
  readonly exitWorkspace: () => void;
}

/** App-level presentation mode that survives navigation between thread routes. */
export const useThreadWorkspaceViewStore = create<ThreadWorkspaceViewStore>((set) => ({
  view: INITIAL_THREAD_WORKSPACE_VIEW,
  appliedDefaultLayout: null,
  applyDefaultLayout: (layout) =>
    set((state) =>
      state.appliedDefaultLayout === layout
        ? state
        : {
            ...state,
            view: reduceThreadWorkspaceView(state.view, { _tag: "ApplyDefault", layout }),
            appliedDefaultLayout: layout,
          },
    ),
  enterWorkspace: () =>
    set((state) => ({
      ...state,
      view: reduceThreadWorkspaceView(state.view, { _tag: "EnterWorkspace" }),
    })),
  exitWorkspace: () =>
    set((state) => ({
      ...state,
      view: reduceThreadWorkspaceView(state.view, { _tag: "ExitWorkspace" }),
    })),
}));
