import { scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { describe, expect, test } from "vite-plus/test";

import { createThreadWorkspaceState, transitionThreadWorkspaceState } from "./threadWorkspace";
import {
  parsePersistedThreadWorkspaceState,
  selectThreadWorkspace,
} from "./threadWorkspaceStore";

const THREAD_REF = scopeThreadRef(
  EnvironmentId.make("env-test"),
  ThreadId.make("thread-test"),
);
const THREAD_KEY = scopedThreadKey(THREAD_REF);

describe("thread workspace persistence", () => {
  test("parses one aggregate containing surfaces and pane placement", () => {
    const opened = transitionThreadWorkspaceState(createThreadWorkspaceState(), {
      _tag: "OpenSurface",
      surface: { _tag: "File", relativePath: "src/app.ts", line: 42 },
    }).state;

    const parsed = parsePersistedThreadWorkspaceState({
      byThreadKey: { [THREAD_KEY]: opened },
    });

    expect(selectThreadWorkspace(parsed.byThreadKey, THREAD_REF)).toEqual(opened);
  });

  test("drops malformed aggregate entries at the persistence boundary", () => {
    expect(
      parsePersistedThreadWorkspaceState({
        byThreadKey: {
          [THREAD_KEY]: { paneTree: null, surfaces: "invalid" },
        },
      }),
    ).toEqual({ byThreadKey: {} });
  });

  test("defaults missing or invalid bottom-panel layout fields", () => {
    const workspace = createThreadWorkspaceState();
    const parsed = parsePersistedThreadWorkspaceState({
      byThreadKey: {
        [THREAD_KEY]: {
          ...workspace,
          bottomPanelOpen: "yes",
          bottomPanelHeight: -1,
        },
      },
    });

    expect(selectThreadWorkspace(parsed.byThreadKey, THREAD_REF)).toMatchObject({
      bottomPanelOpen: false,
      bottomPanelHeight: 280,
    });
  });
});
