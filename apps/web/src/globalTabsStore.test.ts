import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { globalTabKey, type GlobalTab } from "./globalTabs";
import { useGlobalTabsStore } from "./globalTabsStore";

const tab: GlobalTab = {
  _tag: "ServerThread",
  threadRef: scopeThreadRef(EnvironmentId.make("environment-1"), ThreadId.make("thread-1")),
};

afterEach(() => {
  useGlobalTabsStore.setState({
    tabs: [],
    lastActiveTabKey: null,
    historyTabKeys: [],
  });
});

describe("global tabs store", () => {
  it("writes the restoration target computed by a transition", () => {
    useGlobalTabsStore.getState().transition({ _tag: "Open", tab });

    expect(useGlobalTabsStore.getState()).toMatchObject({
      tabs: [tab],
      lastActiveTabKey: globalTabKey(tab),
      historyTabKeys: [globalTabKey(tab)],
    });
  });
});
