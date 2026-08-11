import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { describe, expect, it } from "vite-plus/test";

import { DraftId } from "./composerDraftStore";
import {
  globalThreadTabKey,
  parsePersistedGlobalThreadTabsState,
  projectGlobalThreadTabsState,
  transitionGlobalThreadTabs,
  type GlobalThreadTab,
  type GlobalThreadTabsState,
} from "./globalThreadTabs";

const environmentId = EnvironmentId.make("environment-1");

function serverTab(id: string): GlobalThreadTab {
  return {
    _tag: "ServerThread",
    threadRef: scopeThreadRef(environmentId, ThreadId.make(id)),
  };
}

function draftTab(id: string): GlobalThreadTab {
  return {
    _tag: "DraftThread",
    draftId: DraftId.make(`draft-${id}`),
    threadRef: scopeThreadRef(environmentId, ThreadId.make(id)),
  };
}

function open(state: GlobalThreadTabsState, tab: GlobalThreadTab): GlobalThreadTabsState {
  return transitionGlobalThreadTabs(state, { _tag: "Open", tab }).state;
}

describe("global thread tabs", () => {
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

    const closeMiddle = transitionGlobalThreadTabs(current, {
      _tag: "Close",
      tabKey: globalThreadTabKey(second),
      activeTabKey: globalThreadTabKey(second),
    });
    expect(closeMiddle.navigation).toEqual({ _tag: "Activate", tab: third });

    const closeLast = transitionGlobalThreadTabs(closeMiddle.state, {
      _tag: "Close",
      tabKey: globalThreadTabKey(third),
      activeTabKey: globalThreadTabKey(third),
    });
    expect(closeLast.navigation).toEqual({ _tag: "Activate", tab: first });
  });

  it("keeps navigation in place when closing a background tab", () => {
    const first = serverTab("one");
    const second = serverTab("two");
    const result = transitionGlobalThreadTabs(
      { tabs: [first, second] },
      {
        _tag: "Close",
        tabKey: globalThreadTabKey(first),
        activeTabKey: globalThreadTabKey(second),
      },
    );
    expect(result.navigation).toEqual({ _tag: "KeepCurrent" });
    expect(result.state.tabs).toEqual([second]);
  });

  it("reconciles archived or deleted tabs and replaces an invalid active route", () => {
    const first = serverTab("one");
    const second = serverTab("two");
    const third = serverTab("three");
    const result = transitionGlobalThreadTabs(
      { tabs: [first, second, third] },
      {
        _tag: "Reconcile",
        validTabKeys: [globalThreadTabKey(first), globalThreadTabKey(third)],
        activeTabKey: globalThreadTabKey(second),
      },
    );
    expect(result.state.tabs).toEqual([first, third]);
    expect(result.navigation).toEqual({ _tag: "Activate", tab: third });
  });

  it("parses persisted tabs and rejects an invalid aggregate", () => {
    expect(
      parsePersistedGlobalThreadTabsState({
        tabs: [
          {
            _tag: "ServerThread",
            environmentId,
            threadId: ThreadId.make("one"),
          },
        ],
      }).tabs,
    ).toEqual([serverTab("one")]);
    expect(parsePersistedGlobalThreadTabsState({ tabs: [{ _tag: "Unknown" }] })).toEqual({
      tabs: [],
    });
  });

  it("round-trips the local-storage projection", () => {
    const state = { tabs: [draftTab("one"), serverTab("two")] };
    expect(parsePersistedGlobalThreadTabsState(projectGlobalThreadTabsState(state))).toEqual(state);
  });
});
