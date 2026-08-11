import { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { describe, expect, it } from "vite-plus/test";

import { DraftId } from "./composerDraftStore";
import {
  globalTabKey,
  parsePersistedGlobalTabsState,
  projectGlobalTabsState,
  resolveGlobalTabRouteOpen,
  transitionGlobalTabs,
  type GlobalTab,
  type GlobalTabsState,
} from "./globalTabs";

const environmentId = EnvironmentId.make("environment-1");

function serverTab(id: string): GlobalTab {
  return {
    _tag: "ServerThread",
    threadRef: scopeThreadRef(environmentId, ThreadId.make(id)),
  };
}

function draftTab(id: string): GlobalTab {
  return {
    _tag: "DraftThread",
    draftId: DraftId.make(`draft-${id}`),
    threadRef: scopeThreadRef(environmentId, ThreadId.make(id)),
  };
}

function open(state: GlobalTabsState, tab: GlobalTab): GlobalTabsState {
  return transitionGlobalTabs(state, { _tag: "Open", tab }).state;
}

describe("global tabs", () => {
  it("opens a route once and preserves its original position", () => {
    const first = serverTab("one");
    const state = open(open({ tabs: [] }, first), first);
    expect(state.tabs).toEqual([first]);
  });

  it("replaces a promoted draft in place using its reserved thread ref", () => {
    const draft = draftTab("one");
    const sibling = serverTab("two");
    const promoted = serverTab("one");
    const state = open(open(open({ tabs: [] }, draft), sibling), promoted);
    expect(state.tabs).toEqual([promoted, sibling]);
  });

  it("closes the active tab to the right, then to the left", () => {
    const first = serverTab("one");
    const second = serverTab("two");
    const third = serverTab("three");
    const current = { tabs: [first, second, third] };

    const closeMiddle = transitionGlobalTabs(current, {
      _tag: "Close",
      tabKey: globalTabKey(second),
      activeTabKey: globalTabKey(second),
    });
    expect(closeMiddle.navigation).toEqual({ _tag: "Activate", tab: third });

    const closeLast = transitionGlobalTabs(closeMiddle.state, {
      _tag: "Close",
      tabKey: globalTabKey(third),
      activeTabKey: globalTabKey(third),
    });
    expect(closeLast.navigation).toEqual({ _tag: "Activate", tab: first });
  });

  it("does not reopen a closed active tab while its fallback route is pending", () => {
    const first = serverTab("one");
    const second = serverTab("two");
    const observedSecond = resolveGlobalTabRouteOpen(null, second);
    const closedSecond = transitionGlobalTabs(
      { tabs: [first, second] },
      {
        _tag: "Close",
        tabKey: globalTabKey(second),
        activeTabKey: globalTabKey(second),
      },
    );

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
    const result = transitionGlobalTabs(
      { tabs: [first, second] },
      {
        _tag: "Close",
        tabKey: globalTabKey(first),
        activeTabKey: globalTabKey(second),
      },
    );
    expect(result.navigation).toEqual({ _tag: "KeepCurrent" });
    expect(result.state.tabs).toEqual([second]);
  });

  it("reconciles archived or deleted tabs and replaces an invalid active route", () => {
    const first = serverTab("one");
    const second = serverTab("two");
    const third = serverTab("three");
    const result = transitionGlobalTabs(
      { tabs: [first, second, third] },
      {
        _tag: "Reconcile",
        validThreadTabKeys: [globalTabKey(first), globalTabKey(third)],
        activeTabKey: globalTabKey(second),
      },
    );
    expect(result.state.tabs).toEqual([first, third]);
    expect(result.navigation).toEqual({ _tag: "Activate", tab: third });
  });

  it("parses persisted tabs and rejects an invalid aggregate", () => {
    expect(
      parsePersistedGlobalTabsState({
        tabs: [
          {
            _tag: "ServerThread",
            environmentId,
            threadId: ThreadId.make("one"),
          },
        ],
      }).tabs,
    ).toEqual([serverTab("one")]);
    expect(parsePersistedGlobalTabsState({ tabs: [{ _tag: "Unknown" }] })).toEqual({
      tabs: [],
    });
  });

  it("round-trips the local-storage projection", () => {
    const state = { tabs: [draftTab("one"), serverTab("two")] };
    expect(parsePersistedGlobalTabsState(projectGlobalTabsState(state))).toEqual(state);
  });

  it("keeps singleton tabs in place while their route state changes", () => {
    const thread = serverTab("one");
    const general: GlobalTab = { _tag: "Settings", section: "general" };
    const appearance: GlobalTab = { _tag: "Settings", section: "appearance" };
    const state = open(open(open({ tabs: [] }, thread), general), appearance);

    expect(state.tabs).toEqual([thread, appearance]);
  });

  it("reconciles missing threads without pruning application destinations", () => {
    const thread = serverTab("one");
    const settings: GlobalTab = { _tag: "Settings", section: "general" };
    const usage: GlobalTab = { _tag: "Usage" };
    const pullRequests: GlobalTab = { _tag: "PullRequests" };
    const result = transitionGlobalTabs(
      { tabs: [thread, settings, usage, pullRequests] },
      { _tag: "Reconcile", validThreadTabKeys: [], activeTabKey: globalTabKey(settings) },
    );

    expect(result.state.tabs).toEqual([settings, usage, pullRequests]);
    expect(result.navigation).toEqual({ _tag: "KeepCurrent" });
  });

  it("persists usage as one singleton tab", () => {
    const usage: GlobalTab = { _tag: "Usage" };
    const state = open(open({ tabs: [] }, usage), usage);

    expect(state.tabs).toEqual([usage]);
    expect(parsePersistedGlobalTabsState(projectGlobalTabsState(state))).toEqual(state);
  });

  it("updates pull request status without changing its position", () => {
    const pullRequest: GlobalTab = {
      _tag: "PullRequest",
      environmentId,
      projectId: ProjectId.make("project-1"),
      repository: "pingdotgg/t3code",
      number: 6194,
    };
    const thread = serverTab("one");
    const result = transitionGlobalTabs(
      { tabs: [pullRequest, thread] },
      {
        _tag: "UpdatePullRequestStatus",
        tabKey: globalTabKey(pullRequest),
        state: "merged",
        isDraft: false,
      },
    );

    expect(result.state.tabs).toEqual([
      { ...pullRequest, reviewStatus: { state: "merged", isDraft: false } },
      thread,
    ]);
  });

  it("keeps the pull request list beside a directly opened review", () => {
    const pullRequest: GlobalTab = {
      _tag: "PullRequest",
      environmentId,
      projectId: ProjectId.make("project-1"),
      repository: "pingdotgg/t3code",
      number: 6194,
    };

    expect(open({ tabs: [] }, pullRequest).tabs).toEqual([{ _tag: "PullRequests" }, pullRequest]);
  });
});
