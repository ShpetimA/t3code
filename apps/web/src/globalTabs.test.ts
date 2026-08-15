import {
  EnvironmentId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  TurnId,
  type OrchestrationThreadShell,
} from "@t3tools/contracts";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { describe, expect, it } from "vite-plus/test";

import { DraftId } from "./composerDraftStore";
import {
  globalTabKey,
  isGlobalTabCloseShortcut,
  parsePersistedGlobalTabsState,
  projectGlobalTabsState,
  resolveGlobalTabDropTargetIndex,
  resolveGlobalTabRouteOpen,
  resolveGlobalThreadTabLifecycle,
  transitionGlobalTabs,
  type GlobalTab,
  type GlobalTabsState,
} from "./globalTabs";

const environmentId = EnvironmentId.make("environment-1");
const now = "2026-08-13T12:00:00.000Z";

function serverTab(id: string): Extract<GlobalTab, { readonly _tag: "ServerThread" }> {
  return {
    _tag: "ServerThread",
    threadRef: scopeThreadRef(environmentId, ThreadId.make(id)),
  };
}

function draftTab(id: string): Extract<GlobalTab, { readonly _tag: "DraftThread" }> {
  return {
    _tag: "DraftThread",
    draftId: DraftId.make(`draft-${id}`),
    threadRef: scopeThreadRef(environmentId, ThreadId.make(id)),
  };
}

function threadShell(input: {
  readonly activityAt: string;
  readonly archivedAt?: string | null;
  readonly pinnedAt?: string | null;
  readonly settledOverride?: "settled" | "active" | null;
  readonly snoozedUntil?: string | null;
}): OrchestrationThreadShell {
  const threadId = ThreadId.make("thread-lifecycle");
  return {
    id: threadId,
    projectId: ProjectId.make("project-1"),
    title: "Lifecycle thread",
    modelSelection: {
      instanceId: ProviderInstanceId.make("codex"),
      model: "gpt-5.6",
    },
    runtimeMode: "full-access",
    interactionMode: "default",
    branch: null,
    worktreePath: null,
    latestTurn: {
      turnId: TurnId.make("turn-1"),
      state: "completed",
      requestedAt: input.activityAt,
      startedAt: null,
      completedAt: input.activityAt,
      assistantMessageId: null,
    },
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: input.activityAt,
    archivedAt: input.archivedAt ?? null,
    settledOverride: input.settledOverride ?? null,
    settledAt: input.settledOverride === "settled" ? now : null,
    snoozedAt: input.snoozedUntil === undefined ? null : input.activityAt,
    snoozedUntil: input.snoozedUntil ?? null,
    pinnedAt: input.pinnedAt ?? null,
    pinOrderKey: null,
    titleRegeneration: null,
    session: null,
    latestUserMessageAt: input.activityAt,
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    hasActionableProposedPlan: false,
    backgroundLiveness: null,
    planProgress: null,
  };
}

function globalTabsState(
  tabs: readonly GlobalTab[] = [],
  activeTab: GlobalTab | null = tabs.at(-1) ?? null,
  historyTabs: readonly GlobalTab[] = tabs,
  dismissedRequiredTabs: readonly GlobalTab[] = [],
): GlobalTabsState {
  return {
    tabs,
    activeTabKey: activeTab === null ? null : globalTabKey(activeTab),
    historyTabKeys: historyTabs.map(globalTabKey),
    dismissedRequiredThreadTabKeys: dismissedRequiredTabs.map(globalTabKey),
  };
}

function open(state: GlobalTabsState, tab: GlobalTab): GlobalTabsState {
  return transitionGlobalTabs(state, { _tag: "Open", tab }).state;
}

describe("global tabs", () => {
  it("requires unsettled threads and settles them before close", () => {
    expect(
      resolveGlobalThreadTabLifecycle(threadShell({ activityAt: "2026-08-13T11:00:00.000Z" }), {
        now,
        autoSettleAfterDays: 3,
        supportsSettlement: true,
        supportsSnooze: true,
      }),
    ).toEqual({ isRequired: true, isSettled: false, closePolicy: "settle-first" });
  });

  it("makes settled, snoozed, and archived thread history directly closable", () => {
    const options = {
      now,
      autoSettleAfterDays: 3,
      supportsSettlement: true,
      supportsSnooze: true,
    } as const;

    expect(
      resolveGlobalThreadTabLifecycle(
        threadShell({ activityAt: "2026-08-13T11:00:00.000Z", settledOverride: "settled" }),
        options,
      ),
    ).toEqual({ isRequired: false, isSettled: true, closePolicy: "direct" });
    expect(
      resolveGlobalThreadTabLifecycle(
        threadShell({ activityAt: "2026-08-09T11:00:00.000Z" }),
        options,
      ),
    ).toEqual({ isRequired: false, isSettled: true, closePolicy: "direct" });
    expect(
      resolveGlobalThreadTabLifecycle(
        threadShell({
          activityAt: "2026-08-13T11:00:00.000Z",
          snoozedUntil: "2026-08-14T12:00:00.000Z",
        }),
        options,
      ),
    ).toEqual({ isRequired: false, isSettled: false, closePolicy: "direct" });
    expect(
      resolveGlobalThreadTabLifecycle(
        threadShell({
          activityAt: "2026-08-13T11:00:00.000Z",
          archivedAt: "2026-08-13T11:30:00.000Z",
        }),
        options,
      ),
    ).toEqual({ isRequired: false, isSettled: false, closePolicy: "direct" });
  });

  it("keeps old-server threads visible but directly closable", () => {
    expect(
      resolveGlobalThreadTabLifecycle(threadShell({ activityAt: "2026-08-13T11:00:00.000Z" }), {
        now,
        autoSettleAfterDays: 3,
        supportsSettlement: false,
        supportsSnooze: false,
      }),
    ).toEqual({ isRequired: true, isSettled: false, closePolicy: "direct" });
  });

  it("recognizes the platform close-tab shortcut", () => {
    const shortcut = {
      key: "w",
      metaKey: true,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
    };

    expect(isGlobalTabCloseShortcut(shortcut, "MacIntel")).toBe(true);
    expect(isGlobalTabCloseShortcut(shortcut, "Linux x86_64")).toBe(false);
    expect(
      isGlobalTabCloseShortcut({ ...shortcut, metaKey: false, ctrlKey: true }, "Linux x86_64"),
    ).toBe(true);
    expect(isGlobalTabCloseShortcut({ ...shortcut, shiftKey: true }, "MacIntel")).toBe(false);
  });

  it("opens a route once and preserves its original position", () => {
    const first = serverTab("one");
    const state = open(open(globalTabsState(), first), first);
    expect(state.tabs).toEqual([first]);
    expect(state.activeTabKey).toBe(globalTabKey(first));
  });

  it("replaces a promoted draft in place using its reserved thread ref", () => {
    const draft = draftTab("one");
    const sibling = serverTab("two");
    const promoted = serverTab("one");
    const state = open(open(open(globalTabsState(), draft), sibling), promoted);
    expect(state.tabs).toEqual([promoted, sibling]);
    expect(state.activeTabKey).toBe(globalTabKey(promoted));
  });

  it("selects an existing tab without moving it", () => {
    const first = serverTab("one");
    const second = serverTab("two");
    const state = open(globalTabsState([first, second], first), second);

    expect(state.tabs).toEqual([first, second]);
    expect(state.activeTabKey).toBe(globalTabKey(second));
  });

  it("closes the active tab to the right, then to the left", () => {
    const first = serverTab("one");
    const second = serverTab("two");
    const third = serverTab("three");
    const current = globalTabsState([first, second, third], second);

    const closeMiddle = transitionGlobalTabs(current, {
      _tag: "Close",
      tabKey: globalTabKey(second),
      routeActiveTabKey: globalTabKey(second),
      requiredTabDisposition: "forget",
    });
    expect(closeMiddle.navigation).toEqual({ _tag: "Activate", tab: third });
    expect(closeMiddle.state.activeTabKey).toBe(globalTabKey(third));

    const closeLast = transitionGlobalTabs(closeMiddle.state, {
      _tag: "Close",
      tabKey: globalTabKey(third),
      routeActiveTabKey: globalTabKey(third),
      requiredTabDisposition: "forget",
    });
    expect(closeLast.navigation).toEqual({ _tag: "Activate", tab: first });
    expect(closeLast.state.activeTabKey).toBe(globalTabKey(first));
  });

  it("clears the persisted selection when closing the final tab", () => {
    const only = serverTab("one");
    const result = transitionGlobalTabs(globalTabsState([only], only), {
      _tag: "Close",
      tabKey: globalTabKey(only),
      routeActiveTabKey: globalTabKey(only),
      requiredTabDisposition: "forget",
    });

    expect(result.state).toEqual(globalTabsState());
    expect(result.navigation).toEqual({ _tag: "OpenLanding" });
  });

  it("does not reopen a closed active tab while its fallback route is pending", () => {
    const first = serverTab("one");
    const second = serverTab("two");
    const observedSecond = resolveGlobalTabRouteOpen(null, second);
    const closedSecond = transitionGlobalTabs(globalTabsState([first, second], second), {
      _tag: "Close",
      tabKey: globalTabKey(second),
      routeActiveTabKey: globalTabKey(second),
      requiredTabDisposition: "forget",
    });

    const pendingOldRoute = resolveGlobalTabRouteOpen(observedSecond.routeSignature, second);
    const afterPendingRender =
      pendingOldRoute.transition === null
        ? closedSecond.state
        : transitionGlobalTabs(closedSecond.state, pendingOldRoute.transition).state;
    const committedFallback = resolveGlobalTabRouteOpen(pendingOldRoute.routeSignature, first);
    const finalState =
      committedFallback.transition === null
        ? afterPendingRender
        : transitionGlobalTabs(afterPendingRender, committedFallback.transition).state;

    expect(finalState.tabs).toEqual([first]);
    expect(closedSecond.navigation).toEqual({ _tag: "Activate", tab: first });
  });

  it("keeps navigation in place when closing a background tab", () => {
    const first = serverTab("one");
    const second = serverTab("two");
    const result = transitionGlobalTabs(globalTabsState([first, second], second), {
      _tag: "Close",
      tabKey: globalTabKey(first),
      routeActiveTabKey: globalTabKey(second),
      requiredTabDisposition: "forget",
    });
    expect(result.navigation).toEqual({ _tag: "KeepCurrent" });
    expect(result.state.tabs).toEqual([second]);
    expect(result.state.activeTabKey).toBe(globalTabKey(second));
  });

  it("uses the visible route when persisted selection is briefly stale", () => {
    const first = serverTab("one");
    const second = serverTab("two");
    const third = serverTab("three");
    const result = transitionGlobalTabs(globalTabsState([first, second, third], first), {
      _tag: "Close",
      tabKey: globalTabKey(second),
      routeActiveTabKey: globalTabKey(second),
      requiredTabDisposition: "forget",
    });

    expect(result.state.tabs).toEqual([first, third]);
    expect(result.state.activeTabKey).toBe(globalTabKey(third));
    expect(result.navigation).toEqual({ _tag: "Activate", tab: third });
  });

  it("reconciles archived or deleted tabs and replaces an invalid active route", () => {
    const first = serverTab("one");
    const second = serverTab("two");
    const third = serverTab("three");
    const result = transitionGlobalTabs(globalTabsState([first, second, third], second), {
      _tag: "Reconcile",
      validThreadTabKeys: [globalTabKey(first), globalTabKey(third)],
      requiredThreadTabs: [],
    });
    expect(result.state.tabs).toEqual([first, third]);
    expect(result.state.activeTabKey).toBe(globalTabKey(third));
    expect(result.navigation).toEqual({ _tag: "Activate", tab: third });
  });

  it("parses persisted tabs and their active destination", () => {
    const tab = serverTab("one");
    expect(
      parsePersistedGlobalTabsState({
        tabs: [
          {
            _tag: "ServerThread",
            environmentId,
            threadId: ThreadId.make("one"),
          },
        ],
        activeTabKey: globalTabKey(tab),
      }),
    ).toEqual(globalTabsState([tab], tab));
  });

  it("keeps older persisted tab lists and rejects invalid active destinations", () => {
    const persistedTab = {
      _tag: "ServerThread",
      environmentId,
      threadId: ThreadId.make("one"),
    };
    expect(parsePersistedGlobalTabsState({ tabs: [persistedTab] })).toEqual({
      tabs: [serverTab("one")],
      activeTabKey: null,
      historyTabKeys: [globalTabKey(serverTab("one"))],
      dismissedRequiredThreadTabKeys: [],
    });
    expect(
      parsePersistedGlobalTabsState({ tabs: [persistedTab], activeTabKey: "thread:missing" }),
    ).toEqual({
      tabs: [serverTab("one")],
      activeTabKey: null,
      historyTabKeys: [globalTabKey(serverTab("one"))],
      dismissedRequiredThreadTabKeys: [],
    });
    expect(parsePersistedGlobalTabsState({ tabs: [{ _tag: "Unknown" }] })).toEqual({
      tabs: [],
      activeTabKey: null,
      historyTabKeys: [],
      dismissedRequiredThreadTabKeys: [],
    });
  });

  it("round-trips the local-storage projection", () => {
    const state = globalTabsState([draftTab("one"), serverTab("two")]);
    expect(parsePersistedGlobalTabsState(projectGlobalTabsState(state))).toEqual(state);
  });

  it("restores the persisted active destination after startup reconciliation", () => {
    const first = serverTab("one");
    const settings: GlobalTab = { _tag: "Settings", section: "appearance" };
    const reconciled = transitionGlobalTabs(globalTabsState([first, settings], settings), {
      _tag: "Reconcile",
      validThreadTabKeys: [globalTabKey(first)],
      requiredThreadTabs: [],
    });
    const restored = transitionGlobalTabs(reconciled.state, { _tag: "RestoreActive" });

    expect(restored.navigation).toEqual({ _tag: "Activate", tab: settings });
  });

  it("keeps singleton tabs in place while their route state changes", () => {
    const thread = serverTab("one");
    const general: GlobalTab = { _tag: "Settings", section: "general" };
    const appearance: GlobalTab = { _tag: "Settings", section: "appearance" };
    const state = open(open(open(globalTabsState(), thread), general), appearance);

    expect(state.tabs).toEqual([thread, appearance]);
    expect(state.activeTabKey).toBe(globalTabKey(appearance));
  });

  it("reconciles missing threads without pruning application destinations", () => {
    const thread = serverTab("one");
    const settings: GlobalTab = { _tag: "Settings", section: "general" };
    const usage: GlobalTab = { _tag: "Usage" };
    const pullRequests: GlobalTab = { _tag: "PullRequests" };
    const result = transitionGlobalTabs(
      globalTabsState([thread, settings, usage, pullRequests], settings),
      { _tag: "Reconcile", validThreadTabKeys: [], requiredThreadTabs: [] },
    );

    expect(result.state.tabs).toEqual([settings, usage, pullRequests]);
    expect(result.navigation).toEqual({ _tag: "KeepCurrent" });
  });

  it("adds required unsettled threads without activating or reordering open history", () => {
    const opened = serverTab("opened");
    const required = serverTab("required");
    const settings: GlobalTab = { _tag: "Settings", section: "general" };
    const result = transitionGlobalTabs(globalTabsState([opened, settings], settings), {
      _tag: "Reconcile",
      validThreadTabKeys: [globalTabKey(opened), globalTabKey(required)],
      requiredThreadTabs: [required],
    });

    expect(result.state).toEqual(
      globalTabsState([opened, settings, required], settings, [opened, settings]),
    );
    expect(parsePersistedGlobalTabsState(projectGlobalTabsState(result.state))).toEqual(
      result.state,
    );
    expect(result.navigation).toEqual({ _tag: "KeepCurrent" });

    const afterRequiredThreadSettles = transitionGlobalTabs(result.state, {
      _tag: "Reconcile",
      validThreadTabKeys: [globalTabKey(opened), globalTabKey(required)],
      requiredThreadTabs: [],
    });
    expect(afterRequiredThreadSettles.state).toEqual(globalTabsState([opened, settings], settings));
  });

  it("keeps a dismissed required thread closed until its lifecycle no longer requires it", () => {
    const required = serverTab("required");
    const settings: GlobalTab = { _tag: "Settings", section: "general" };
    const closed = transitionGlobalTabs(globalTabsState([required, settings], settings), {
      _tag: "Close",
      tabKey: globalTabKey(required),
      routeActiveTabKey: globalTabKey(settings),
      requiredTabDisposition: "dismiss",
    });
    const stillRequired = transitionGlobalTabs(closed.state, {
      _tag: "Reconcile",
      validThreadTabKeys: [globalTabKey(required)],
      requiredThreadTabs: [required],
    });

    expect(stillRequired.state).toEqual(
      globalTabsState([settings], settings, [settings], [required]),
    );
    expect(parsePersistedGlobalTabsState(projectGlobalTabsState(stillRequired.state))).toEqual(
      stillRequired.state,
    );

    const noLongerRequired = transitionGlobalTabs(stillRequired.state, {
      _tag: "Reconcile",
      validThreadTabKeys: [globalTabKey(required)],
      requiredThreadTabs: [],
    });
    const requiredAgain = transitionGlobalTabs(noLongerRequired.state, {
      _tag: "Reconcile",
      validThreadTabKeys: [globalTabKey(required)],
      requiredThreadTabs: [required],
    });

    expect(noLongerRequired.state.dismissedRequiredThreadTabKeys).toEqual([]);
    expect(requiredAgain.state).toEqual(
      globalTabsState([settings, required], settings, [settings]),
    );
  });

  it("promotes a required server thread in the draft tab's existing position", () => {
    const draft = draftTab("one");
    const promoted = serverTab("one");
    const sibling = serverTab("two");
    const result = transitionGlobalTabs(globalTabsState([draft, sibling], sibling), {
      _tag: "Reconcile",
      validThreadTabKeys: [globalTabKey(promoted), globalTabKey(sibling)],
      requiredThreadTabs: [promoted],
    });

    expect(result.state.tabs).toEqual([promoted, sibling]);
    expect(result.state.activeTabKey).toBe(globalTabKey(sibling));
  });

  it("persists usage as one singleton tab", () => {
    const usage: GlobalTab = { _tag: "Usage" };
    const state = open(open(globalTabsState(), usage), usage);

    expect(state.tabs).toEqual([usage]);
    expect(parsePersistedGlobalTabsState(projectGlobalTabsState(state))).toEqual(state);
  });

  it("reorders at the indicated edge of a hovered tab", () => {
    const first = serverTab("one");
    const second = serverTab("two");
    const third = serverTab("three");
    const current = globalTabsState([first, second, third]);

    const beforeThird = transitionGlobalTabs(current, {
      _tag: "Reorder",
      tabKey: globalTabKey(first),
      targetIndex: resolveGlobalTabDropTargetIndex(0, 2, "before"),
    });
    const afterFirst = transitionGlobalTabs(current, {
      _tag: "Reorder",
      tabKey: globalTabKey(third),
      targetIndex: resolveGlobalTabDropTargetIndex(2, 0, "after"),
    });

    expect(beforeThird.state.tabs).toEqual([second, first, third]);
    expect(afterFirst.state.tabs).toEqual([first, third, second]);
  });
});
