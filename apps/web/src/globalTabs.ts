import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { effectiveSettled, effectiveSnoozed } from "@t3tools/client-runtime/state/thread-settled";
import {
  EnvironmentId,
  ThreadId,
  type OrchestrationThreadShell,
  type ScopedThreadRef,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";

import { DraftId } from "./composerDraftStore";
import { isMacPlatform } from "./lib/utils";

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
  | { readonly _tag: "PullRequests" };

/** The persisted ordering and restoration state of the global application tabs. */
export interface GlobalTabsState {
  readonly tabs: readonly GlobalTab[];
  readonly lastActiveTabKey: string | null;
  /** Tabs explicitly visited by the user, retained independently of thread lifecycle. */
  readonly historyTabKeys: readonly string[];
  /** Required thread tabs explicitly closed while their lifecycle still required them. */
  readonly dismissedRequiredThreadTabKeys: readonly string[];
}

/** Lifecycle-derived visibility and close behavior for one server-thread tab. */
export interface GlobalThreadTabLifecycle {
  readonly isRequired: boolean;
  readonly isSettled: boolean;
  readonly isSnoozed: boolean;
  readonly closePolicy: "direct" | "settle-first";
}

/** Resolves whether a server thread must remain in the global tab strip. */
export function resolveGlobalThreadTabLifecycle(
  thread: OrchestrationThreadShell,
  options: {
    readonly now: string;
    readonly autoSettleAfterDays: number | null;
    readonly supportsSettlement: boolean;
    readonly supportsSnooze: boolean;
  },
): GlobalThreadTabLifecycle {
  const isSnoozed =
    thread.archivedAt === null &&
    options.supportsSnooze &&
    effectiveSnoozed(thread, { now: options.now });
  const isSettled =
    options.supportsSettlement &&
    effectiveSettled(thread, {
      now: options.now,
      autoSettleAfterDays: options.autoSettleAfterDays,
      changeRequestState: null,
    });
  const isRequired =
    thread.archivedAt === null && !isSnoozed && (thread.pinnedAt != null || !isSettled);
  return {
    isRequired,
    isSettled,
    isSnoozed,
    closePolicy: isRequired && options.supportsSettlement ? "settle-first" : "direct",
  };
}

/** The edge of a hovered tab where a dragged global tab will be inserted. */
export type GlobalTabDropPosition = "before" | "after";

interface GlobalTabCloseShortcutEvent {
  readonly key: string;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
}

/** Matches the native browser/window close chord without consuming modified variants. */
export function isGlobalTabCloseShortcut(
  event: GlobalTabCloseShortcutEvent,
  platform: string,
): boolean {
  if (event.key.toLowerCase() !== "w" || event.shiftKey || event.altKey) return false;
  return isMacPlatform(platform)
    ? event.metaKey && !event.ctrlKey
    : event.ctrlKey && !event.metaKey;
}

/** Navigation requested as a consequence of a tab transition. */
export type GlobalTabNavigation =
  | { readonly _tag: "KeepCurrent" }
  | { readonly _tag: "Activate"; readonly tab: GlobalTab }
  | { readonly _tag: "OpenLanding" };

/** Legal user and route-driven changes to the global tab collection. */
export type GlobalTabsTransition =
  | { readonly _tag: "Open"; readonly tab: GlobalTab }
  | {
      readonly _tag: "Close";
      readonly tabKey: string;
      readonly routeActiveTabKey: string | null;
      readonly requiredTabDisposition: "forget" | "dismiss";
    }
  | {
      readonly _tag: "Reconcile";
      readonly validThreadTabKeys: readonly string[];
      readonly requiredThreadTabs: ReadonlyArray<
        Extract<GlobalTab, { readonly _tag: "ServerThread" }>
      >;
      readonly routeActiveTabKey: string | null;
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
]);

const PersistedGlobalTabsState = Schema.Struct({
  tabs: Schema.Array(PersistedGlobalTab),
  lastActiveTabKey: Schema.optionalKey(Schema.NullOr(Schema.String)),
  historyTabKeys: Schema.optionalKey(Schema.Array(Schema.String)),
  dismissedRequiredThreadTabKeys: Schema.optionalKey(Schema.Array(Schema.String)),
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
  }
}

/** Resolves the persisted destination used when restoring from the landing route. */
export function resolveLastActiveGlobalTab(state: GlobalTabsState): GlobalTab | null {
  if (state.lastActiveTabKey === null) return null;
  return state.tabs.find((tab) => globalTabKey(tab) === state.lastActiveTabKey) ?? null;
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

/** Whether two route snapshots describe the same complete tab destination. */
export function sameGlobalTab(left: GlobalTab, right: GlobalTab): boolean {
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
  }
}

/** Applies deduping, close fallback, reconciliation, and ordering rules for global tabs. */
export function transitionGlobalTabs(
  current: GlobalTabsState,
  input: GlobalTabsTransition,
): GlobalTabsTransitionResult {
  switch (input._tag) {
    case "Open": {
      const tabKey = globalTabKey(input.tab);
      const historyTabKeys = current.historyTabKeys.includes(tabKey)
        ? current.historyTabKeys
        : [...current.historyTabKeys, tabKey];
      const dismissedRequiredThreadTabKeys = current.dismissedRequiredThreadTabKeys.includes(tabKey)
        ? current.dismissedRequiredThreadTabKeys.filter(
            (dismissedTabKey) => dismissedTabKey !== tabKey,
          )
        : current.dismissedRequiredThreadTabKeys;
      const existingIndex = current.tabs.findIndex((tab) => globalTabKey(tab) === tabKey);
      if (existingIndex < 0) {
        return {
          state: {
            tabs: [...current.tabs, input.tab],
            lastActiveTabKey: tabKey,
            historyTabKeys,
            dismissedRequiredThreadTabKeys,
          },
          navigation: { _tag: "KeepCurrent" },
        };
      }
      const existing = current.tabs[existingIndex];
      if (existing === undefined || sameGlobalTab(existing, input.tab)) {
        return {
          state:
            current.lastActiveTabKey === tabKey &&
            historyTabKeys === current.historyTabKeys &&
            dismissedRequiredThreadTabKeys === current.dismissedRequiredThreadTabKeys
              ? current
              : {
                  ...current,
                  lastActiveTabKey: tabKey,
                  historyTabKeys,
                  dismissedRequiredThreadTabKeys,
                },
          navigation: { _tag: "KeepCurrent" },
        };
      }
      const tabs = [...current.tabs];
      tabs[existingIndex] = input.tab;
      return {
        state: { tabs, lastActiveTabKey: tabKey, historyTabKeys, dismissedRequiredThreadTabKeys },
        navigation: { _tag: "KeepCurrent" },
      };
    }
    case "Close": {
      const closingIndex = current.tabs.findIndex((tab) => globalTabKey(tab) === input.tabKey);
      if (closingIndex < 0) {
        return { state: current, navigation: { _tag: "KeepCurrent" } };
      }
      const tabs = current.tabs.filter((tab) => globalTabKey(tab) !== input.tabKey);
      const historyTabKeys = current.historyTabKeys.filter((tabKey) => tabKey !== input.tabKey);
      const dismissedRequiredThreadTabKeys =
        input.requiredTabDisposition === "dismiss" &&
        !current.dismissedRequiredThreadTabKeys.includes(input.tabKey)
          ? [...current.dismissedRequiredThreadTabKeys, input.tabKey]
          : current.dismissedRequiredThreadTabKeys;
      const fallback = tabs[closingIndex] ?? tabs[closingIndex - 1];
      const lastActiveTabKey =
        input.routeActiveTabKey === input.tabKey || current.lastActiveTabKey === input.tabKey
          ? fallback
            ? globalTabKey(fallback)
            : null
          : current.lastActiveTabKey;
      if (input.routeActiveTabKey !== input.tabKey) {
        return {
          state: {
            tabs,
            lastActiveTabKey,
            historyTabKeys,
            dismissedRequiredThreadTabKeys,
          },
          navigation: { _tag: "KeepCurrent" },
        };
      }
      return {
        state: {
          tabs,
          lastActiveTabKey,
          historyTabKeys,
          dismissedRequiredThreadTabKeys,
        },
        navigation: fallback ? { _tag: "Activate", tab: fallback } : { _tag: "OpenLanding" },
      };
    }
    case "Reconcile": {
      const validThreadTabKeys = new Set(input.validThreadTabKeys);
      const requiredThreadTabKeys = new Set(input.requiredThreadTabs.map(globalTabKey));
      const historyTabKeys = new Set(current.historyTabKeys);
      const dismissedRequiredThreadTabKeys = current.dismissedRequiredThreadTabKeys.filter(
        (tabKey) => validThreadTabKeys.has(tabKey) && requiredThreadTabKeys.has(tabKey),
      );
      const dismissedRequiredThreadTabKeySet = new Set(dismissedRequiredThreadTabKeys);
      const tabs = current.tabs.filter((tab) => {
        if (!isGlobalThreadTab(tab)) return true;
        const tabKey = globalTabKey(tab);
        if (!validThreadTabKeys.has(tabKey)) return false;
        return (
          tab._tag === "DraftThread" ||
          historyTabKeys.has(tabKey) ||
          requiredThreadTabKeys.has(tabKey)
        );
      });
      let changed =
        tabs.length !== current.tabs.length ||
        dismissedRequiredThreadTabKeys.length !== current.dismissedRequiredThreadTabKeys.length;
      for (const requiredTab of input.requiredThreadTabs) {
        const requiredTabKey = globalTabKey(requiredTab);
        if (
          !validThreadTabKeys.has(requiredTabKey) ||
          dismissedRequiredThreadTabKeySet.has(requiredTabKey)
        ) {
          continue;
        }
        const existingIndex = tabs.findIndex((tab) => globalTabKey(tab) === requiredTabKey);
        if (existingIndex < 0) {
          tabs.push(requiredTab);
          changed = true;
          continue;
        }
        const existing = tabs[existingIndex];
        if (existing !== undefined && !sameGlobalTab(existing, requiredTab)) {
          tabs[existingIndex] = requiredTab;
          changed = true;
        }
      }
      const reconciledTabKeys = new Set(tabs.map(globalTabKey));
      const reconciledHistoryTabKeys = current.historyTabKeys.filter((tabKey) =>
        reconciledTabKeys.has(tabKey),
      );
      if (reconciledHistoryTabKeys.length !== current.historyTabKeys.length) {
        changed = true;
      }
      if (!changed) {
        return { state: current, navigation: { _tag: "KeepCurrent" } };
      }
      const routeActiveIndex = current.tabs.findIndex(
        (tab) => globalTabKey(tab) === input.routeActiveTabKey,
      );
      const lastActiveIndex = current.tabs.findIndex(
        (tab) => globalTabKey(tab) === current.lastActiveTabKey,
      );
      const lastActiveFallback = tabs[lastActiveIndex] ?? tabs[lastActiveIndex - 1];
      const lastActiveTabKey =
        current.lastActiveTabKey === null ||
        tabs.some((tab) => globalTabKey(tab) === current.lastActiveTabKey)
          ? current.lastActiveTabKey
          : lastActiveFallback
            ? globalTabKey(lastActiveFallback)
            : null;
      if (
        input.routeActiveTabKey === null ||
        tabs.some((tab) => globalTabKey(tab) === input.routeActiveTabKey)
      ) {
        return {
          state: {
            tabs,
            lastActiveTabKey,
            historyTabKeys: reconciledHistoryTabKeys,
            dismissedRequiredThreadTabKeys,
          },
          navigation: { _tag: "KeepCurrent" },
        };
      }
      const fallback = tabs[routeActiveIndex] ?? tabs[routeActiveIndex - 1];
      return {
        state: {
          tabs,
          lastActiveTabKey: fallback ? globalTabKey(fallback) : null,
          historyTabKeys: reconciledHistoryTabKeys,
          dismissedRequiredThreadTabKeys,
        },
        navigation: fallback ? { _tag: "Activate", tab: fallback } : { _tag: "OpenLanding" },
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
        state: { ...current, tabs },
        navigation: { _tag: "KeepCurrent" },
      };
    }
  }
}

/** Parses the local-storage representation and drops invalid data as one unit. */
export function parsePersistedGlobalTabsState(input: unknown): GlobalTabsState {
  const decoded = decodePersistedGlobalTabsState(input);
  if (decoded._tag === "None") {
    return {
      tabs: [],
      lastActiveTabKey: null,
      historyTabKeys: [],
      dismissedRequiredThreadTabKeys: [],
    };
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
    }
    if (!tabs.some((existing) => globalTabKey(existing) === globalTabKey(nextTab))) {
      tabs.push(nextTab);
    }
  }
  const persistedLastActiveTabKey = decoded.value.lastActiveTabKey ?? null;
  const lastActiveTabKey =
    persistedLastActiveTabKey !== null &&
    tabs.some((tab) => globalTabKey(tab) === persistedLastActiveTabKey)
      ? persistedLastActiveTabKey
      : null;
  const tabKeys = new Set(tabs.map(globalTabKey));
  const historyTabKeys = [
    ...new Set(decoded.value.historyTabKeys ?? tabs.map(globalTabKey)),
  ].filter((tabKey) => tabKeys.has(tabKey));
  const dismissedRequiredThreadTabKeys = [
    ...new Set(decoded.value.dismissedRequiredThreadTabKeys ?? []),
  ];
  return { tabs, lastActiveTabKey, historyTabKeys, dismissedRequiredThreadTabKeys };
}

/** Projects global tabs into their stable local-storage representation. */
export function projectGlobalTabsState(state: GlobalTabsState): PersistedGlobalTabsState {
  return {
    lastActiveTabKey: state.lastActiveTabKey,
    historyTabKeys: state.historyTabKeys,
    dismissedRequiredThreadTabKeys: state.dismissedRequiredThreadTabKeys,
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
      }
    }),
  };
}
