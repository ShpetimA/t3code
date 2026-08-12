import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { globalTabKey, type GlobalTab } from "./globalTabs";
import { transitionGlobalTabsStore, useGlobalTabsStore } from "./globalTabsStore";

const tab: GlobalTab = {
  _tag: "ServerThread",
  threadRef: scopeThreadRef(EnvironmentId.make("environment-1"), ThreadId.make("thread-1")),
};

afterEach(() => {
  useGlobalTabsStore.setState({ tabs: [], activeTabKey: null });
});

describe("global tabs store", () => {
  it("writes the selected tab computed by a transition", () => {
    transitionGlobalTabsStore({ _tag: "Open", tab });

    expect(useGlobalTabsStore.getState()).toMatchObject({
      tabs: [tab],
      activeTabKey: globalTabKey(tab),
    });
  });
});
