import type {
  EnvironmentProject,
  EnvironmentThreadShell,
} from "@t3tools/client-runtime/state/shell";
import {
  DEFAULT_RUNTIME_MODE,
  EnvironmentId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { buildGlobalTabsLandingProjects } from "./globalTabsLanding";

const localEnvironmentId = EnvironmentId.make("environment-local");
const remoteEnvironmentId = EnvironmentId.make("environment-remote");
const projectId = ProjectId.make("project-1");

function makeProject(overrides: Partial<EnvironmentProject> = {}): EnvironmentProject {
  return {
    id: projectId,
    environmentId: localEnvironmentId,
    title: "Local project",
    workspaceRoot: "/tmp/local-project",
    repositoryIdentity: null,
    defaultModelSelection: null,
    scripts: [],
    createdAt: "2026-08-12T09:00:00.000Z",
    updatedAt: "2026-08-12T09:00:00.000Z",
    ...overrides,
  };
}

function makeThread(overrides: Partial<EnvironmentThreadShell> = {}): EnvironmentThreadShell {
  return {
    id: ThreadId.make("thread-1"),
    environmentId: localEnvironmentId,
    projectId,
    title: "Thread",
    modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5.4" },
    runtimeMode: DEFAULT_RUNTIME_MODE,
    interactionMode: "default",
    branch: null,
    worktreePath: null,
    latestTurn: null,
    createdAt: "2026-08-12T09:00:00.000Z",
    updatedAt: "2026-08-12T09:00:00.000Z",
    archivedAt: null,
    settledOverride: null,
    settledAt: null,
    session: null,
    latestUserMessageAt: null,
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    hasActionableProposedPlan: false,
    ...overrides,
  };
}

describe("global tabs landing", () => {
  it("groups recent live threads by physical project in recency order", () => {
    const localProject = makeProject();
    const remoteProject = makeProject({
      environmentId: remoteEnvironmentId,
      title: "Remote project",
      workspaceRoot: "/tmp/remote-project",
    });
    const groups = buildGlobalTabsLandingProjects({
      projects: [localProject, remoteProject],
      threads: [
        makeThread({ id: ThreadId.make("local-new"), updatedAt: "2026-08-12T12:00:00.000Z" }),
        makeThread({
          id: ThreadId.make("remote"),
          environmentId: remoteEnvironmentId,
          updatedAt: "2026-08-12T11:00:00.000Z",
        }),
        makeThread({ id: ThreadId.make("local-old"), updatedAt: "2026-08-12T10:00:00.000Z" }),
      ],
    });

    expect(groups.map((group) => group.project.title)).toEqual(["Local project", "Remote project"]);
    expect(groups[0]?.threads.map((thread) => thread.id)).toEqual([
      ThreadId.make("local-new"),
      ThreadId.make("local-old"),
    ]);
  });

  it("excludes archived, missing-project, and over-limit threads", () => {
    const groups = buildGlobalTabsLandingProjects({
      projects: [makeProject()],
      threads: [
        makeThread({ id: ThreadId.make("new"), updatedAt: "2026-08-12T12:00:00.000Z" }),
        makeThread({
          id: ThreadId.make("archived"),
          archivedAt: "2026-08-12T12:30:00.000Z",
          updatedAt: "2026-08-12T12:30:00.000Z",
        }),
        makeThread({
          id: ThreadId.make("missing-project"),
          projectId: ProjectId.make("missing"),
          updatedAt: "2026-08-12T13:00:00.000Z",
        }),
        makeThread({ id: ThreadId.make("old"), updatedAt: "2026-08-12T10:00:00.000Z" }),
      ],
      limit: 1,
    });

    expect(groups).toHaveLength(1);
    expect(groups[0]?.threads.map((thread) => thread.id)).toEqual([ThreadId.make("new")]);
  });
});
