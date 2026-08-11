import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ThreadId, type ScopedThreadRef } from "@t3tools/contracts";
import * as Schema from "effect/Schema";

import { DraftId } from "./composerDraftStore";

/** A server-backed or pre-send draft thread opened in the global tab strip. */
export type GlobalThreadTab =
  | { readonly _tag: "ServerThread"; readonly threadRef: ScopedThreadRef }
  | {
      readonly _tag: "DraftThread";
      readonly draftId: DraftId;
      readonly threadRef: ScopedThreadRef;
    };

/** The persisted ordering of global thread tabs. The active tab is the URL. */
export interface GlobalThreadTabsState {
  readonly tabs: readonly GlobalThreadTab[];
}

/** Navigation requested as a consequence of a tab transition. */
export type GlobalThreadTabNavigation =
  | { readonly _tag: "KeepCurrent" }
  | { readonly _tag: "Activate"; readonly tab: GlobalThreadTab }
  | { readonly _tag: "OpenLanding" };

/** Legal user and route-driven changes to the global tab collection. */
export type GlobalThreadTabsTransition =
  | { readonly _tag: "Open"; readonly tab: GlobalThreadTab }
  | { readonly _tag: "Close"; readonly tabKey: string; readonly activeTabKey: string | null }
  | {
      readonly _tag: "Reconcile";
      readonly validTabKeys: readonly string[];
      readonly activeTabKey: string | null;
    }
  | { readonly _tag: "Reorder"; readonly tabKey: string; readonly targetIndex: number };

/** Result of one global-tab transition. */
export interface GlobalThreadTabsTransitionResult {
  readonly state: GlobalThreadTabsState;
  readonly navigation: GlobalThreadTabNavigation;
}

const PersistedGlobalThreadTab = Schema.Union([
  Schema.TaggedStruct("ServerThread", {
    environmentId: EnvironmentId,
    threadId: ThreadId,
  }),
  Schema.TaggedStruct("DraftThread", {
    draftId: DraftId,
    environmentId: EnvironmentId,
    threadId: ThreadId,
  }),
]);

const PersistedGlobalThreadTabsState = Schema.Struct({
  tabs: Schema.Array(PersistedGlobalThreadTab),
});

const decodePersistedGlobalThreadTabsState = Schema.decodeUnknownOption(
  PersistedGlobalThreadTabsState,
);

type PersistedGlobalThreadTabsState = typeof PersistedGlobalThreadTabsState.Type;

/** Stable identity shared by a draft and the server thread it promotes into. */
export function globalThreadTabKey(tab: GlobalThreadTab): string {
  return scopedThreadKey(tab.threadRef);
}

function sameTab(left: GlobalThreadTab, right: GlobalThreadTab): boolean {
  if (left._tag !== right._tag || globalThreadTabKey(left) !== globalThreadTabKey(right)) {
    return false;
  }
  return (
    left._tag === "ServerThread" || (right._tag === "DraftThread" && left.draftId === right.draftId)
  );
}

/** Applies deduping, close fallback, and ordering rules for global thread tabs. */
export function transitionGlobalThreadTabs(
  current: GlobalThreadTabsState,
  input: GlobalThreadTabsTransition,
): GlobalThreadTabsTransitionResult {
  switch (input._tag) {
    case "Open": {
      const tabKey = globalThreadTabKey(input.tab);
      const existingIndex = current.tabs.findIndex((tab) => globalThreadTabKey(tab) === tabKey);
      if (existingIndex < 0) {
        return {
          state: { tabs: [...current.tabs, input.tab] },
          navigation: { _tag: "KeepCurrent" },
        };
      }
      const existing = current.tabs[existingIndex];
      if (existing === undefined || sameTab(existing, input.tab)) {
        return { state: current, navigation: { _tag: "KeepCurrent" } };
      }
      const tabs = [...current.tabs];
      tabs[existingIndex] = input.tab;
      return { state: { tabs }, navigation: { _tag: "KeepCurrent" } };
    }
    case "Close": {
      const closingIndex = current.tabs.findIndex(
        (tab) => globalThreadTabKey(tab) === input.tabKey,
      );
      if (closingIndex < 0) {
        return { state: current, navigation: { _tag: "KeepCurrent" } };
      }
      const tabs = current.tabs.filter((tab) => globalThreadTabKey(tab) !== input.tabKey);
      if (input.activeTabKey !== input.tabKey) {
        return { state: { tabs }, navigation: { _tag: "KeepCurrent" } };
      }
      const fallback = tabs[closingIndex] ?? tabs[closingIndex - 1];
      return {
        state: { tabs },
        navigation: fallback ? { _tag: "Activate", tab: fallback } : { _tag: "OpenLanding" },
      };
    }
    case "Reconcile": {
      const validTabKeys = new Set(input.validTabKeys);
      const tabs = current.tabs.filter((tab) => validTabKeys.has(globalThreadTabKey(tab)));
      if (tabs.length === current.tabs.length) {
        return { state: current, navigation: { _tag: "KeepCurrent" } };
      }
      const activeIndex = current.tabs.findIndex(
        (tab) => globalThreadTabKey(tab) === input.activeTabKey,
      );
      if (input.activeTabKey === null || validTabKeys.has(input.activeTabKey)) {
        return { state: { tabs }, navigation: { _tag: "KeepCurrent" } };
      }
      const fallback = tabs[activeIndex] ?? tabs[activeIndex - 1];
      return {
        state: { tabs },
        navigation: fallback ? { _tag: "Activate", tab: fallback } : { _tag: "OpenLanding" },
      };
    }
    case "Reorder": {
      const sourceIndex = current.tabs.findIndex((tab) => globalThreadTabKey(tab) === input.tabKey);
      if (sourceIndex < 0 || current.tabs.length < 2) {
        return { state: current, navigation: { _tag: "KeepCurrent" } };
      }
      const targetIndex = Math.max(0, Math.min(input.targetIndex, current.tabs.length - 1));
      if (sourceIndex === targetIndex) {
        return { state: current, navigation: { _tag: "KeepCurrent" } };
      }
      const tabs = [...current.tabs];
      const [moved] = tabs.splice(sourceIndex, 1);
      if (moved === undefined) {
        return { state: current, navigation: { _tag: "KeepCurrent" } };
      }
      tabs.splice(targetIndex, 0, moved);
      return { state: { tabs }, navigation: { _tag: "KeepCurrent" } };
    }
  }
}

/** Parses the local-storage representation and drops invalid data as one unit. */
export function parsePersistedGlobalThreadTabsState(input: unknown): GlobalThreadTabsState {
  const decoded = decodePersistedGlobalThreadTabsState(input);
  if (decoded._tag === "None") {
    return { tabs: [] };
  }

  const tabs: GlobalThreadTab[] = [];
  for (const tab of decoded.value.tabs) {
    const threadRef = scopeThreadRef(tab.environmentId, tab.threadId);
    const nextTab: GlobalThreadTab =
      tab._tag === "ServerThread"
        ? { _tag: "ServerThread", threadRef }
        : { _tag: "DraftThread", draftId: tab.draftId, threadRef };
    if (!tabs.some((existing) => globalThreadTabKey(existing) === globalThreadTabKey(nextTab))) {
      tabs.push(nextTab);
    }
  }
  return { tabs };
}

/** Projects global tabs into their stable local-storage representation. */
export function projectGlobalThreadTabsState(
  state: GlobalThreadTabsState,
): PersistedGlobalThreadTabsState {
  return {
    tabs: state.tabs.map((tab) => {
      if (tab._tag === "ServerThread") {
        return {
          _tag: "ServerThread",
          environmentId: tab.threadRef.environmentId,
          threadId: tab.threadRef.threadId,
        };
      }
      return {
        _tag: "DraftThread",
        draftId: tab.draftId,
        environmentId: tab.threadRef.environmentId,
        threadId: tab.threadRef.threadId,
      };
    }),
  };
}
