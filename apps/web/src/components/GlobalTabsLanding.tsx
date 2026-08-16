import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";

import { openCommandPalette } from "../commandPaletteBus";
import { buildGlobalTabsLandingProjects } from "../globalTabsLanding";
import {
  useAllEnvironmentShellsBootstrapped,
  useProjects,
  useThreadShells,
} from "../state/entities";
import { useEnvironments } from "../state/environments";
import { buildThreadRouteParams } from "../threadRoutes";
import { useUiStateStore } from "../uiStateStore";
import { GlobalTabsEmptyState } from "./GlobalTabsEmptyState";
import { resolveThreadStatusPill, type ThreadStatusPill } from "./Sidebar.logic";

/** Route content for the global-tabs launcher. */
export function GlobalTabsLanding() {
  const navigate = useNavigate();
  const projects = useProjects();
  const threads = useThreadShells();
  const bootstrapped = useAllEnvironmentShellsBootstrapped();
  const { environments } = useEnvironments();
  const lastVisitedAtByThreadKey = useUiStateStore((state) => state.threadLastVisitedAtById);
  const statusByThreadKey = useMemo(() => {
    const statuses = new Map<string, ThreadStatusPill>();
    for (const thread of threads) {
      const threadKey = scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id));
      const status = resolveThreadStatusPill({
        thread: {
          ...thread,
          lastVisitedAt: lastVisitedAtByThreadKey[threadKey],
        },
      });
      if (status) statuses.set(threadKey, status);
    }
    return statuses;
  }, [lastVisitedAtByThreadKey, threads]);
  const recentProjects = useMemo(
    () => buildGlobalTabsLandingProjects({ projects, threads }),
    [projects, threads],
  );
  const pullRequestsSupported = environments.some(
    (environment) => environment.serverConfig?.environment.capabilities.pullRequests === true,
  );

  if (!bootstrapped) return null;

  return (
    <GlobalTabsEmptyState
      onNewThread={() => openCommandPalette({ open: "new-thread-in" })}
      onSearchThreads={() => openCommandPalette({ open: "search-threads" })}
      onOpenPullRequests={() =>
        void navigate({
          to: "/pull-requests",
          search: { involvement: "all", state: "open" },
        })
      }
      onOpenSettings={() => void navigate({ to: "/settings" })}
      onOpenUsage={() => void navigate({ to: "/usage" })}
      onOpenThread={(thread) =>
        void navigate({
          to: "/$environmentId/$threadId",
          params: buildThreadRouteParams(scopeThreadRef(thread.environmentId, thread.id)),
        })
      }
      pullRequestsSupported={pullRequestsSupported}
      recentProjects={recentProjects}
      statusByThreadKey={statusByThreadKey}
    />
  );
}
