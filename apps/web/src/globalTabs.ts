import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import {
  EnvironmentId,
  ProjectId,
  ThreadId,
  type PullRequestState,
  type ScopedThreadRef,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";

import { DraftId } from "./composerDraftStore";

/** A settings section represented by the singleton Settings tab. */
export type GlobalSettingsSection =
  | "general"
  | "appearance"
  | "keybindings"
  | "providers"
  | "source-control"
  | "connections"
  | "archived"
  | "diagnostics";

/** A route-backed destination opened in the application-wide tab strip. */
export type GlobalTab =
  | { readonly _tag: "ServerThread"; readonly threadRef: ScopedThreadRef }
  | {
      readonly _tag: "DraftThread";
      readonly draftId: DraftId;
      readonly threadRef: ScopedThreadRef;
    }
  | { readonly _tag: "Settings"; readonly section: GlobalSettingsSection }
  | { readonly _tag: "Usage" }
  | { readonly _tag: "PullRequests" }
  | {
      readonly _tag: "PullRequest";
      readonly environmentId: EnvironmentId;
      readonly projectId: ProjectId;
      readonly repository: string;
      readonly number: number;
      readonly host?: string;
      readonly reviewStatus?: {
        readonly state: PullRequestState;
        readonly isDraft: boolean;
      };
    };

/** The persisted ordering and selected destination of the global application tabs. */
export interface GlobalTabsState {
  readonly tabs: readonly GlobalTab[];
  readonly activeTabKey: string | null;
}

/** The edge of a hovered tab where a dragged global tab will be inserted. */
export type GlobalTabDropPosition = "before" | "after";

/** Navigation requested as a consequence of a tab transition. */
export type GlobalTabNavigation =
  | { readonly _tag: "KeepCurrent" }
  | { readonly _tag: "Activate"; readonly tab: GlobalTab }
  | { readonly _tag: "OpenLanding" };

/** Legal user and route-driven changes to the global tab collection. */
export type GlobalTabsTransition =
  | { readonly _tag: "Open"; readonly tab: GlobalTab }
  | { readonly _tag: "Close"; readonly tabKey: string }
  | {
      readonly _tag: "Reconcile";
      readonly validThreadTabKeys: readonly string[];
    }
  | { readonly _tag: "RestoreActive" }
  | {
      readonly _tag: "UpdatePullRequestStatus";
      readonly tabKey: string;
      readonly state: PullRequestState;
      readonly isDraft: boolean;
    }
  | { readonly _tag: "Reorder"; readonly tabKey: string; readonly targetIndex: number };

/** Result of one global-tab transition. */
export interface GlobalTabsTransitionResult {
  readonly state: GlobalTabsState;
  readonly navigation: GlobalTabNavigation;
}

const PersistedGlobalTab = Schema.Union([
  Schema.TaggedStruct("ServerThread", {
    environmentId: EnvironmentId,
    threadId: ThreadId,
  }),
  Schema.TaggedStruct("DraftThread", {
    draftId: DraftId,
    environmentId: EnvironmentId,
    threadId: ThreadId,
  }),
  Schema.TaggedStruct("Settings", {
    section: Schema.Literals([
      "general",
      "appearance",
      "keybindings",
      "providers",
      "source-control",
      "connections",
      "archived",
      "diagnostics",
    ]),
  }),
  Schema.TaggedStruct("Usage", {}),
  Schema.TaggedStruct("PullRequests", {}),
  Schema.TaggedStruct("PullRequest", {
    environmentId: EnvironmentId,
    projectId: ProjectId,
    repository: Schema.NonEmptyString,
    number: Schema.Int.check(Schema.isGreaterThan(0)),
    host: Schema.optionalKey(Schema.String),
  }),
]);

const PersistedGlobalTabsState = Schema.Struct({
  tabs: Schema.Array(PersistedGlobalTab),
  activeTabKey: Schema.optionalKey(Schema.NullOr(Schema.String)),
});

const decodePersistedGlobalTabsState = Schema.decodeUnknownOption(PersistedGlobalTabsState);

type PersistedGlobalTabsState = typeof PersistedGlobalTabsState.Type;

/** Stable identity shared by route visits that represent the same global destination. */
export function globalTabKey(tab: GlobalTab): string {
  switch (tab._tag) {
    case "ServerThread":
    case "DraftThread":
      return `thread:${scopedThreadKey(tab.threadRef)}`;
    case "Settings":
      return "settings";
    case "Usage":
      return "usage";
    case "PullRequests":
      return "pull-requests";
    case "PullRequest":
      return `pull-request:${tab.environmentId}:${tab.projectId}:${tab.repository.toLowerCase()}#${tab.number}`;
  }
}

/** Resolves a hovered tab edge to the moved tab's final index. */
export function resolveGlobalTabDropTargetIndex(
  sourceIndex: number,
  hoveredIndex: number,
  position: GlobalTabDropPosition,
): number {
  const insertionIndex = hoveredIndex + (position === "after" ? 1 : 0);
  return insertionIndex > sourceIndex ? insertionIndex - 1 : insertionIndex;
}

/** Whether the tab points at a thread whose lifetime is reconciled from thread projections. */
export function isGlobalThreadTab(
  tab: GlobalTab,
): tab is Extract<GlobalTab, { readonly _tag: "ServerThread" | "DraftThread" }> {
  return tab._tag === "ServerThread" || tab._tag === "DraftThread";
}

function sameTab(left: GlobalTab, right: GlobalTab): boolean {
  if (left._tag !== right._tag || globalTabKey(left) !== globalTabKey(right)) {
    return false;
  }
  switch (left._tag) {
    case "ServerThread":
    case "Usage":
    case "PullRequests":
      return true;
    case "DraftThread":
      return right._tag === "DraftThread" && left.draftId === right.draftId;
    case "Settings":
      return right._tag === "Settings" && left.section === right.section;
    case "PullRequest":
      return (
        right._tag === "PullRequest" &&
        left.repository === right.repository &&
        left.host === right.host
      );
  }
}

function globalTabRouteSignature(tab: GlobalTab): string {
  switch (tab._tag) {
    case "ServerThread":
      return JSON.stringify([tab._tag, globalTabKey(tab)]);
    case "DraftThread":
      return JSON.stringify([tab._tag, globalTabKey(tab), tab.draftId]);
    case "Settings":
      return JSON.stringify([tab._tag, tab.section]);
    case "Usage":
    case "PullRequests":
      return JSON.stringify([tab._tag]);
    case "PullRequest":
      return JSON.stringify([tab._tag, globalTabKey(tab), tab.repository, tab.host ?? null]);
  }
}

/** Plans route-driven tab opening once per meaningful route destination. */
export function resolveGlobalTabRouteOpen(
  previousRouteSignature: string | null,
  activeTab: GlobalTab | null,
) {
  const routeSignature = activeTab === null ? null : globalTabRouteSignature(activeTab);
  if (routeSignature === previousRouteSignature || activeTab === null) {
    return { routeSignature, transition: null };
  }
  return {
    routeSignature,
    transition: { _tag: "Open" as const, tab: activeTab },
  };
}

/** Applies deduping, close fallback, reconciliation, and ordering rules for global tabs. */
export function transitionGlobalTabs(
  current: GlobalTabsState,
  input: GlobalTabsTransition,
): GlobalTabsTransitionResult {
  switch (input._tag) {
    case "Open": {
      const tabKey = globalTabKey(input.tab);
      const existingIndex = current.tabs.findIndex((tab) => globalTabKey(tab) === tabKey);
      if (existingIndex < 0) {
        if (
          input.tab._tag === "PullRequest" &&
          !current.tabs.some((tab) => tab._tag === "PullRequests")
        ) {
          return {
            state: {
              tabs: [...current.tabs, { _tag: "PullRequests" }, input.tab],
              activeTabKey: tabKey,
            },
            navigation: { _tag: "KeepCurrent" },
          };
        }
        return {
          state: { tabs: [...current.tabs, input.tab], activeTabKey: tabKey },
          navigation: { _tag: "KeepCurrent" },
        };
      }
      const existing = current.tabs[existingIndex];
      if (existing === undefined || sameTab(existing, input.tab)) {
        return {
          state: current.activeTabKey === tabKey ? current : { ...current, activeTabKey: tabKey },
          navigation: { _tag: "KeepCurrent" },
        };
      }
      const tabs = [...current.tabs];
      tabs[existingIndex] = input.tab;
      return { state: { tabs, activeTabKey: tabKey }, navigation: { _tag: "KeepCurrent" } };
    }
    case "Close": {
      const closingIndex = current.tabs.findIndex((tab) => globalTabKey(tab) === input.tabKey);
      if (closingIndex < 0) {
        return { state: current, navigation: { _tag: "KeepCurrent" } };
      }
      const tabs = current.tabs.filter((tab) => globalTabKey(tab) !== input.tabKey);
      if (current.activeTabKey !== input.tabKey) {
        return {
          state: { tabs, activeTabKey: current.activeTabKey },
          navigation: { _tag: "KeepCurrent" },
        };
      }
      const fallback = tabs[closingIndex] ?? tabs[closingIndex - 1];
      return {
        state: { tabs, activeTabKey: fallback ? globalTabKey(fallback) : null },
        navigation: fallback ? { _tag: "Activate", tab: fallback } : { _tag: "OpenLanding" },
      };
    }
    case "Reconcile": {
      const validThreadTabKeys = new Set(input.validThreadTabKeys);
      const tabs = current.tabs.filter(
        (tab) => !isGlobalThreadTab(tab) || validThreadTabKeys.has(globalTabKey(tab)),
      );
      if (tabs.length === current.tabs.length) {
        return { state: current, navigation: { _tag: "KeepCurrent" } };
      }
      const activeIndex = current.tabs.findIndex(
        (tab) => globalTabKey(tab) === current.activeTabKey,
      );
      if (
        current.activeTabKey === null ||
        tabs.some((tab) => globalTabKey(tab) === current.activeTabKey)
      ) {
        return {
          state: { tabs, activeTabKey: current.activeTabKey },
          navigation: { _tag: "KeepCurrent" },
        };
      }
      const fallback = tabs[activeIndex] ?? tabs[activeIndex - 1];
      return {
        state: { tabs, activeTabKey: fallback ? globalTabKey(fallback) : null },
        navigation: fallback ? { _tag: "Activate", tab: fallback } : { _tag: "OpenLanding" },
      };
    }
    case "RestoreActive": {
      if (current.activeTabKey === null) {
        return { state: current, navigation: { _tag: "KeepCurrent" } };
      }
      const activeTab = current.tabs.find((tab) => globalTabKey(tab) === current.activeTabKey);
      return {
        state: current,
        navigation: activeTab ? { _tag: "Activate", tab: activeTab } : { _tag: "KeepCurrent" },
      };
    }
    case "Reorder": {
      const sourceIndex = current.tabs.findIndex((tab) => globalTabKey(tab) === input.tabKey);
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
      return {
        state: { tabs, activeTabKey: current.activeTabKey },
        navigation: { _tag: "KeepCurrent" },
      };
    }
    case "UpdatePullRequestStatus": {
      const tabIndex = current.tabs.findIndex((tab) => globalTabKey(tab) === input.tabKey);
      const tab = current.tabs[tabIndex];
      if (tab?._tag !== "PullRequest") {
        return { state: current, navigation: { _tag: "KeepCurrent" } };
      }
      if (tab.reviewStatus?.state === input.state && tab.reviewStatus.isDraft === input.isDraft) {
        return { state: current, navigation: { _tag: "KeepCurrent" } };
      }
      const tabs = [...current.tabs];
      tabs[tabIndex] = {
        ...tab,
        reviewStatus: { state: input.state, isDraft: input.isDraft },
      };
      return {
        state: { tabs, activeTabKey: current.activeTabKey },
        navigation: { _tag: "KeepCurrent" },
      };
    }
  }
}

/** Parses the local-storage representation and drops invalid data as one unit. */
export function parsePersistedGlobalTabsState(input: unknown): GlobalTabsState {
  const decoded = decodePersistedGlobalTabsState(input);
  if (decoded._tag === "None") {
    return { tabs: [], activeTabKey: null };
  }

  const tabs: GlobalTab[] = [];
  for (const tab of decoded.value.tabs) {
    let nextTab: GlobalTab;
    switch (tab._tag) {
      case "ServerThread":
        nextTab = {
          _tag: "ServerThread",
          threadRef: scopeThreadRef(tab.environmentId, tab.threadId),
        };
        break;
      case "DraftThread":
        nextTab = {
          _tag: "DraftThread",
          draftId: tab.draftId,
          threadRef: scopeThreadRef(tab.environmentId, tab.threadId),
        };
        break;
      case "Settings":
        nextTab = tab;
        break;
      case "Usage":
        nextTab = tab;
        break;
      case "PullRequests":
        nextTab = tab;
        break;
      case "PullRequest":
        nextTab = tab;
        break;
    }
    if (!tabs.some((existing) => globalTabKey(existing) === globalTabKey(nextTab))) {
      tabs.push(nextTab);
    }
  }
  const persistedActiveTabKey = decoded.value.activeTabKey ?? null;
  const activeTabKey =
    persistedActiveTabKey !== null &&
    tabs.some((tab) => globalTabKey(tab) === persistedActiveTabKey)
      ? persistedActiveTabKey
      : null;
  return { tabs, activeTabKey };
}

/** Projects global tabs into their stable local-storage representation. */
export function projectGlobalTabsState(state: GlobalTabsState): PersistedGlobalTabsState {
  return {
    activeTabKey: state.activeTabKey,
    tabs: state.tabs.map((tab) => {
      switch (tab._tag) {
        case "ServerThread":
          return {
            _tag: "ServerThread" as const,
            environmentId: tab.threadRef.environmentId,
            threadId: tab.threadRef.threadId,
          };
        case "DraftThread":
          return {
            _tag: "DraftThread" as const,
            draftId: tab.draftId,
            environmentId: tab.threadRef.environmentId,
            threadId: tab.threadRef.threadId,
          };
        case "Settings":
          return tab;
        case "Usage":
          return tab;
        case "PullRequests":
          return tab;
        case "PullRequest":
          return {
            _tag: "PullRequest" as const,
            environmentId: tab.environmentId,
            projectId: tab.projectId,
            repository: tab.repository,
            number: tab.number,
            ...(tab.host === undefined ? {} : { host: tab.host }),
          };
      }
    }),
  };
}
