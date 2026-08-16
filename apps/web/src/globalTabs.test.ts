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
  resolveLastActiveGlobalTab,
  resolveGlobalThreadTabLifecycle,
  sameGlobalTab,
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

function newTab(): Extract<GlobalTab, { readonly _tag: "NewTab" }> {
  return { _tag: "NewTab" };
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
): GlobalTabsState {
  return {
    tabs,
    lastActiveTabKey: activeTab === null ? null : globalTabKey(activeTab),
    historyTabKeys: historyTabs.map(globalTabKey),
  };
}

function open(state: GlobalTabsState, tab: GlobalTab): GlobalTabsState {
  return transitionGlobalTabs(state, { _tag: "Open", tab }).state;
}

describe("global tabs", () => {
  it("compares semantic route identity instead of object identity", () => {
    const server = serverTab("one");
    const draft = draftTab("one");

    expect(sameGlobalTab(server, serverTab("one"))).toBe(true);
    expect(sameGlobalTab(server, draft)).toBe(false);
    expect(sameGlobalTab(draft, { ...draft, draftId: DraftId.make("draft-other") })).toBe(false);
    expect(
      sameGlobalTab(
        { _tag: "Settings", section: "general" },
        { _tag: "Settings", section: "appearance" },
      ),
    ).toBe(false);
  });

  it("requires unsettled threads and settles them before close", () => {
    expect(
      resolveGlobalThreadTabLifecycle(threadShell({ activityAt: "2026-08-13T11:00:00.000Z" }), {
        now,
        autoSettleAfterDays: 3,
        supportsSettlement: true,
        supportsSnooze: true,
      }),
    ).toEqual({
      isRequired: true,
      isSettled: false,
      isSnoozed: false,
      closePolicy: "settle-first",
    });
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
    ).toEqual({ isRequired: false, isSettled: true, isSnoozed: false, closePolicy: "direct" });
    expect(
      resolveGlobalThreadTabLifecycle(
        threadShell({ activityAt: "2026-08-09T11:00:00.000Z" }),
        options,
      ),
    ).toEqual({ isRequired: false, isSettled: true, isSnoozed: false, closePolicy: "direct" });
    expect(
      resolveGlobalThreadTabLifecycle(
        threadShell({
          activityAt: "2026-08-13T11:00:00.000Z",
          snoozedUntil: "2026-08-14T12:00:00.000Z",
        }),
        options,
      ),
    ).toEqual({ isRequired: false, isSettled: false, isSnoozed: true, closePolicy: "direct" });
    expect(
      resolveGlobalThreadTabLifecycle(
        threadShell({
          activityAt: "2026-08-13T11:00:00.000Z",
          archivedAt: "2026-08-13T11:30:00.000Z",
        }),
        options,
      ),
    ).toEqual({ isRequired: false, isSettled: false, isSnoozed: false, closePolicy: "direct" });
  });

  it("keeps old-server threads visible but directly closable", () => {
    expect(
      resolveGlobalThreadTabLifecycle(threadShell({ activityAt: "2026-08-13T11:00:00.000Z" }), {
        now,
        autoSettleAfterDays: 3,
        supportsSettlement: false,
        supportsSnooze: false,
      }),
    ).toEqual({ isRequired: true, isSettled: false, isSnoozed: false, closePolicy: "direct" });
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
    expect(state.lastActiveTabKey).toBe(globalTabKey(first));
  });

  it("opens the launcher as a real tab", () => {
    const launcher = newTab();
    const state = open(globalTabsState(), launcher);

    expect(state).toEqual(globalTabsState([launcher], launcher));
  });

  it("replaces the active launcher with a newly opened destination", () => {
    const launcher = newTab();
    const first = serverTab("one");
    const destination = serverTab("two");
    const state = open(globalTabsState([first, launcher], launcher), destination);

    expect(state).toEqual(globalTabsState([first, destination], destination));
  });

  it("removes the active launcher when selecting an existing destination", () => {
    const launcher = newTab();
    const first = serverTab("one");
    const second = serverTab("two");
    const state = open(globalTabsState([first, launcher, second], launcher), second);

    expect(state).toEqual(globalTabsState([first, second], second));
  });

  it("replaces a promoted draft in place using its reserved thread ref", () => {
    const draft = draftTab("one");
    const sibling = serverTab("two");
    const promoted = serverTab("one");
    const state = open(open(open(globalTabsState(), draft), sibling), promoted);
    expect(state.tabs).toEqual([promoted, sibling]);
    expect(state.lastActiveTabKey).toBe(globalTabKey(promoted));
  });

  it("selects an existing tab without moving it", () => {
    const first = serverTab("one");
    const second = serverTab("two");
    const state = open(globalTabsState([first, second], first), second);

    expect(state.tabs).toEqual([first, second]);
    expect(state.lastActiveTabKey).toBe(globalTabKey(second));
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
    });
    expect(closeMiddle.navigation).toEqual({ _tag: "Activate", tab: third });
    expect(closeMiddle.state.lastActiveTabKey).toBe(globalTabKey(third));

    const closeLast = transitionGlobalTabs(closeMiddle.state, {
      _tag: "Close",
      tabKey: globalTabKey(third),
      routeActiveTabKey: globalTabKey(third),
    });
    expect(closeLast.navigation).toEqual({ _tag: "Activate", tab: first });
    expect(closeLast.state.lastActiveTabKey).toBe(globalTabKey(first));
  });

  it("clears the persisted selection when closing the final tab", () => {
    const only = serverTab("one");
    const result = transitionGlobalTabs(globalTabsState([only], only), {
      _tag: "Close",
      tabKey: globalTabKey(only),
      routeActiveTabKey: globalTabKey(only),
    });

    expect(result.state).toEqual(globalTabsState());
    expect(result.navigation).toEqual({ _tag: "OpenLanding" });
  });

  it("keeps navigation in place when closing a background tab", () => {
    const first = serverTab("one");
    const second = serverTab("two");
    const result = transitionGlobalTabs(globalTabsState([first, second], second), {
      _tag: "Close",
      tabKey: globalTabKey(first),
      routeActiveTabKey: globalTabKey(second),
    });
    expect(result.navigation).toEqual({ _tag: "KeepCurrent" });
    expect(result.state.tabs).toEqual([second]);
    expect(result.state.lastActiveTabKey).toBe(globalTabKey(second));
  });

  it("uses the visible route when persisted selection is briefly stale", () => {
    const first = serverTab("one");
    const second = serverTab("two");
    const third = serverTab("three");
    const result = transitionGlobalTabs(globalTabsState([first, second, third], first), {
      _tag: "Close",
      tabKey: globalTabKey(second),
      routeActiveTabKey: globalTabKey(second),
    });

    expect(result.state.tabs).toEqual([first, third]);
    expect(result.state.lastActiveTabKey).toBe(globalTabKey(third));
    expect(result.navigation).toEqual({ _tag: "Activate", tab: third });
  });

  it("keeps user-opened thread tabs when lifecycle reconciliation omits them", () => {
    const first = serverTab("one");
    const second = serverTab("two");
    const third = serverTab("three");
    const result = transitionGlobalTabs(globalTabsState([first, second, third], second), {
      _tag: "Reconcile",
      validThreadTabKeys: [globalTabKey(first), globalTabKey(third)],
      requiredThreadTabs: [],
      routeActiveTabKey: globalTabKey(second),
    });
    expect(result.state).toEqual(globalTabsState([first, second, third], second));
    expect(result.navigation).toEqual({ _tag: "KeepCurrent" });
  });

  it("parses persisted tabs and their restoration destination", () => {
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
        lastActiveTabKey: globalTabKey(tab),
      }),
    ).toEqual(globalTabsState([tab], tab));
  });

  it("keeps older persisted tab lists and rejects invalid active destinations", () => {
    const persistedTab = {
      _tag: "ServerThread",
      environmentId,
      threadId: ThreadId.make("one"),
    };
    expect(
      parsePersistedGlobalTabsState({
        tabs: [persistedTab],
        dismissedRequiredThreadTabKeys: [globalTabKey(serverTab("one"))],
      }),
    ).toEqual({
      tabs: [serverTab("one")],
      lastActiveTabKey: null,
      historyTabKeys: [globalTabKey(serverTab("one"))],
    });
    expect(
      parsePersistedGlobalTabsState({ tabs: [persistedTab], lastActiveTabKey: "thread:missing" }),
    ).toEqual({
      tabs: [serverTab("one")],
      lastActiveTabKey: null,
      historyTabKeys: [globalTabKey(serverTab("one"))],
    });
    expect(parsePersistedGlobalTabsState({ tabs: [{ _tag: "Unknown" }] })).toEqual({
      tabs: [],
      lastActiveTabKey: null,
      historyTabKeys: [],
    });
  });

  it("round-trips the local-storage projection", () => {
    const state = globalTabsState([draftTab("one"), newTab(), serverTab("two")]);
    expect(parsePersistedGlobalTabsState(projectGlobalTabsState(state))).toEqual(state);
  });

  it("restores the persisted active destination after startup reconciliation", () => {
    const first = serverTab("one");
    const settings: GlobalTab = { _tag: "Settings", section: "appearance" };
    const reconciled = transitionGlobalTabs(globalTabsState([first, settings], settings), {
      _tag: "Reconcile",
      validThreadTabKeys: [globalTabKey(first)],
      requiredThreadTabs: [],
      routeActiveTabKey: null,
    });
    expect(resolveLastActiveGlobalTab(reconciled.state)).toEqual(settings);
  });

  it("keeps singleton tabs in place while their route state changes", () => {
    const thread = serverTab("one");
    const general: GlobalTab = { _tag: "Settings", section: "general" };
    const appearance: GlobalTab = { _tag: "Settings", section: "appearance" };
    const state = open(open(open(globalTabsState(), thread), general), appearance);

    expect(state.tabs).toEqual([thread, appearance]);
    expect(state.lastActiveTabKey).toBe(globalTabKey(appearance));
  });

  it("keeps opened thread and application destinations through reconciliation", () => {
    const thread = serverTab("one");
    const settings: GlobalTab = { _tag: "Settings", section: "general" };
    const usage: GlobalTab = { _tag: "Usage" };
    const pullRequests: GlobalTab = { _tag: "PullRequests" };
    const result = transitionGlobalTabs(
      globalTabsState([thread, settings, usage, pullRequests], settings),
      {
        _tag: "Reconcile",
        validThreadTabKeys: [],
        requiredThreadTabs: [],
        routeActiveTabKey: globalTabKey(settings),
      },
    );

    expect(result.state.tabs).toEqual([thread, settings, usage, pullRequests]);
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
      routeActiveTabKey: globalTabKey(settings),
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
      routeActiveTabKey: globalTabKey(settings),
    });
    expect(afterRequiredThreadSettles.state).toEqual(globalTabsState([opened, settings], settings));
  });

  it("restores a required thread after its tab is closed", () => {
    const required = serverTab("required");
    const settings: GlobalTab = { _tag: "Settings", section: "general" };
    const closed = transitionGlobalTabs(globalTabsState([required, settings], settings), {
      _tag: "Close",
      tabKey: globalTabKey(required),
      routeActiveTabKey: globalTabKey(settings),
    });
    const stillRequired = transitionGlobalTabs(closed.state, {
      _tag: "Reconcile",
      validThreadTabKeys: [globalTabKey(required)],
      requiredThreadTabs: [required],
      routeActiveTabKey: globalTabKey(settings),
    });

    expect(stillRequired.state).toEqual(
      globalTabsState([settings, required], settings, [settings]),
    );
    expect(stillRequired.navigation).toEqual({ _tag: "KeepCurrent" });
  });

  it("promotes a required server thread in the draft tab's existing position", () => {
    const draft = draftTab("one");
    const promoted = serverTab("one");
    const sibling = serverTab("two");
    const result = transitionGlobalTabs(globalTabsState([draft, sibling], sibling), {
      _tag: "Reconcile",
      validThreadTabKeys: [globalTabKey(promoted), globalTabKey(sibling)],
      requiredThreadTabs: [promoted],
      routeActiveTabKey: globalTabKey(sibling),
    });

    expect(result.state.tabs).toEqual([promoted, sibling]);
    expect(result.state.lastActiveTabKey).toBe(globalTabKey(sibling));
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
