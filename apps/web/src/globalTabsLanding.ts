import type {
  EnvironmentProject,
  EnvironmentThreadShell,
} from "@t3tools/client-runtime/state/shell";
import { sortThreads } from "./lib/threadSort";

/** Number of recent threads considered for the default landing view. */
export const GLOBAL_TABS_RECENT_THREAD_LIMIT = 30;

/** Number of thread rows initially visible inside each recent project group. */
export const GLOBAL_TABS_RECENT_THREADS_PER_PROJECT = 5;

export interface GlobalTabsLandingProject {
  readonly project: EnvironmentProject;
  readonly threads: readonly EnvironmentThreadShell[];
}

function projectKey(input: { readonly environmentId: string; readonly id: string }): string {
  return `${input.environmentId}:${input.id}`;
}

/** Selects the newest live threads and preserves their recency across project groups. */
export function buildGlobalTabsLandingProjects(input: {
  readonly projects: readonly EnvironmentProject[];
  readonly threads: readonly EnvironmentThreadShell[];
  readonly limit?: number;
}): readonly GlobalTabsLandingProject[] {
  const projectByKey = new Map(input.projects.map((project) => [projectKey(project), project]));
  const recentThreads = sortThreads(
    input.threads.filter(
      (thread) =>
        thread.archivedAt === null &&
        projectByKey.has(projectKey({ environmentId: thread.environmentId, id: thread.projectId })),
    ),
    "updated_at",
  ).slice(0, input.limit ?? GLOBAL_TABS_RECENT_THREAD_LIMIT);
  const groups = new Map<string, GlobalTabsLandingProject>();

  for (const thread of recentThreads) {
    const key = projectKey({ environmentId: thread.environmentId, id: thread.projectId });
    const existing = groups.get(key);
    if (existing) {
      groups.set(key, { ...existing, threads: [...existing.threads, thread] });
      continue;
    }
    const project = projectByKey.get(key);
    if (project) {
      groups.set(key, { project, threads: [thread] });
    }
  }

  return [...groups.values()];
}
