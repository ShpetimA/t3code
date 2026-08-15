import type {
  EnvironmentProject,
  EnvironmentThreadShell,
} from "@t3tools/client-runtime/state/shell";
import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import {
  DEFAULT_RUNTIME_MODE,
  EnvironmentId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
} from "@t3tools/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { GlobalTabsEmptyState } from "./GlobalTabsEmptyState";

const environmentId = EnvironmentId.make("environment-local");
const projectId = ProjectId.make("project-1");
const project: EnvironmentProject = {
  id: projectId,
  environmentId,
  title: "T3 Code",
  workspaceRoot: "/tmp/t3code",
  repositoryIdentity: null,
  defaultModelSelection: null,
  scripts: [],
  createdAt: "2026-08-12T09:00:00.000Z",
  updatedAt: "2026-08-12T09:00:00.000Z",
};

function makeThread(index: number): EnvironmentThreadShell {
  return {
    id: ThreadId.make(`thread-${index}`),
    environmentId,
    projectId,
    title: `Thread ${index}`,
    modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5.4" },
    runtimeMode: DEFAULT_RUNTIME_MODE,
    interactionMode: "default",
    branch: null,
    worktreePath: null,
    latestTurn: null,
    createdAt: `2026-08-12T09:0${index}:00.000Z`,
    updatedAt: `2026-08-12T09:0${index}:00.000Z`,
    archivedAt: null,
    settledOverride: null,
    settledAt: null,
    session: null,
    latestUserMessageAt: null,
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    hasActionableProposedPlan: false,
  };
}

describe("GlobalTabsEmptyState", () => {
  it("offers deliberate ways forward without creating a thread", () => {
    const html = renderToStaticMarkup(
      <GlobalTabsEmptyState
        onNewThread={() => undefined}
        onSearchThreads={() => undefined}
        onOpenPullRequests={() => undefined}
        onOpenSettings={() => undefined}
        onOpenUsage={() => undefined}
        onOpenThread={() => undefined}
        pullRequestsSupported
        recentProjects={[]}
        statusByThreadKey={new Map()}
      />,
    );

    expect(html).toContain("New tab");
    expect(html).toContain("New thread");
    expect(html).toContain("Search threads");
    expect(html).toContain("Pull requests");
    expect(html).toContain("Usage");
    expect(html).toContain("Settings");
    expect(html).toContain("No recent threads yet.");
    expect(html).not.toContain("Search by thread, project, or branch");
    expect(html).toContain('data-global-tabs-landing-backdrop=""');
  });

  it("uses global-tab status marks and caps each recent project initially", () => {
    const recentThreads = Array.from({ length: 6 }, (_, index) => makeThread(index + 1));
    const planStatus = {
      label: "Plan Ready",
      colorClass: "text-blue-600",
      dotClass: "bg-blue-500",
      pulse: false,
    } as const;
    const statusThread = recentThreads[0];
    const statusByThreadKey = new Map(
      statusThread
        ? [
            [
              scopedThreadKey(scopeThreadRef(statusThread.environmentId, statusThread.id)),
              planStatus,
            ] as const,
          ]
        : [],
    );
    const html = renderToStaticMarkup(
      <GlobalTabsEmptyState
        onNewThread={() => undefined}
        onSearchThreads={() => undefined}
        onOpenPullRequests={() => undefined}
        onOpenSettings={() => undefined}
        onOpenUsage={() => undefined}
        onOpenThread={() => undefined}
        pullRequestsSupported
        recentProjects={[{ project, threads: recentThreads }]}
        statusByThreadKey={statusByThreadKey}
      />,
    );

    expect(html).not.toContain("Needs attention");
    expect(html).toContain('aria-label="Plan Ready"');
    expect(html).toContain("Show 1 more");
    expect(html).toContain("Thread 5");
    expect(html).not.toContain("Thread 6");
  });
});
