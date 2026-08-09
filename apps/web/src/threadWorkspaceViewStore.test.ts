import { beforeEach, describe, expect, test } from "vitest";

import { INITIAL_THREAD_WORKSPACE_VIEW } from "./components/ChatView.logic";
import { useThreadWorkspaceViewStore } from "./threadWorkspaceViewStore";

describe("thread workspace view store", () => {
  beforeEach(() => {
    useThreadWorkspaceViewStore.setState({
      view: INITIAL_THREAD_WORKSPACE_VIEW,
      appliedDefaultLayout: null,
    });
  });

  test("preserves a manual workspace choice when another thread route applies the same default", () => {
    const store = useThreadWorkspaceViewStore.getState();
    store.applyDefaultLayout("split");
    store.enterWorkspace();
    useThreadWorkspaceViewStore.getState().applyDefaultLayout("split");

    expect(useThreadWorkspaceViewStore.getState().view).toEqual({ _tag: "Workspace" });
  });

  test("applies a changed default once without overriding later manual choices", () => {
    const store = useThreadWorkspaceViewStore.getState();
    store.applyDefaultLayout("split");
    store.applyDefaultLayout("maximized");
    expect(useThreadWorkspaceViewStore.getState().view).toEqual({ _tag: "Workspace" });

    useThreadWorkspaceViewStore.getState().exitWorkspace();
    useThreadWorkspaceViewStore.getState().applyDefaultLayout("maximized");
    expect(useThreadWorkspaceViewStore.getState().view).toEqual({ _tag: "Conversation" });
  });
});
