import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import {
  ChartNoAxesColumnIcon,
  GitPullRequestIcon,
  MessageSquareTextIcon,
  SearchIcon,
  Settings2Icon,
  SquarePenIcon,
} from "lucide-react";
import { useState } from "react";

import {
  GLOBAL_TABS_RECENT_THREADS_PER_PROJECT,
  type GlobalTabsLandingProject,
} from "../globalTabsLanding";
import { formatRelativeTimeLabel } from "../timestampFormat";
import { GlobalTabsLandingBackdrop } from "./GlobalTabsLandingBackdrop";
import { ProjectFavicon } from "./ProjectFavicon";
import type { ThreadStatusPill } from "./Sidebar.logic";
import { ThreadStatusMark } from "./ThreadStatusMark";
import { SidebarInset } from "./ui/sidebar";

function threadKey(thread: EnvironmentThreadShell): string {
  return scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id));
}

interface LandingActionProps {
  readonly icon: typeof SquarePenIcon;
  readonly label: string;
  readonly onClick: () => void;
}

function LandingAction({ icon: Icon, label, onClick }: LandingActionProps) {
  return (
    <button
      type="button"
      className="group flex h-10 w-full items-center gap-3 rounded-lg px-2 text-left text-sm text-foreground/85 outline-none transition-[background-color,color] duration-150 ease-out hover:bg-accent/55 hover:text-foreground focus-visible:bg-accent/55 focus-visible:ring-2 focus-visible:ring-ring"
      onClick={onClick}
    >
      <Icon className="size-4 shrink-0 text-muted-foreground transition-colors duration-150 group-hover:text-foreground/75" />
      <span className="truncate">{label}</span>
    </button>
  );
}

function RecentProjectGroup(props: {
  readonly group: GlobalTabsLandingProject;
  readonly onOpenThread: (thread: EnvironmentThreadShell) => void;
  readonly statusByThreadKey: ReadonlyMap<string, ThreadStatusPill>;
  readonly expanded: boolean;
  readonly onToggleExpanded: () => void;
}) {
  const { project, threads } = props.group;
  const visibleThreads = props.expanded
    ? threads
    : threads.slice(0, GLOBAL_TABS_RECENT_THREADS_PER_PROJECT);
  const hiddenThreadCount = threads.length - visibleThreads.length;

  return (
    <div>
      <div className="flex h-8 items-center gap-2 px-2 text-xs font-medium text-muted-foreground">
        <ProjectFavicon
          environmentId={project.environmentId}
          cwd={project.workspaceRoot}
          projectName={project.title}
          faviconPath={project.faviconPath}
          className="size-4"
        />
        <span className="truncate">{project.title}</span>
      </div>
      <div className="ml-3 border-l border-border/55 pl-3">
        {visibleThreads.map((thread) => {
          const key = threadKey(thread);
          const status = props.statusByThreadKey.get(key) ?? null;
          return (
            <button
              key={key}
              type="button"
              className="group flex h-9 w-full min-w-0 items-center gap-2.5 rounded-lg px-2 text-left text-sm outline-none transition-[background-color,color] duration-150 ease-out hover:bg-accent/55 focus-visible:bg-accent/55 focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => props.onOpenThread(thread)}
            >
              {status ? (
                <ThreadStatusMark status={status} animatePulse={false} />
              ) : (
                <MessageSquareTextIcon className="size-3.5 shrink-0 text-muted-foreground/75 transition-colors duration-150 group-hover:text-muted-foreground" />
              )}
              <span className="min-w-0 flex-1 truncate text-foreground/80 group-hover:text-foreground">
                {thread.title}
              </span>
              <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground/65">
                {formatRelativeTimeLabel(thread.latestUserMessageAt ?? thread.updatedAt)}
              </span>
            </button>
          );
        })}
        {hiddenThreadCount > 0 ? (
          <button
            type="button"
            className="flex h-8 w-full items-center rounded-lg px-2 pl-8 text-left text-xs text-muted-foreground/65 outline-none transition-colors duration-150 hover:bg-accent/40 hover:text-muted-foreground focus-visible:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring"
            onClick={props.onToggleExpanded}
          >
            Show {hiddenThreadCount} more
          </button>
        ) : props.expanded && threads.length > GLOBAL_TABS_RECENT_THREADS_PER_PROJECT ? (
          <button
            type="button"
            className="flex h-8 w-full items-center rounded-lg px-2 pl-8 text-left text-xs text-muted-foreground/65 outline-none transition-colors duration-150 hover:bg-accent/40 hover:text-muted-foreground focus-visible:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring"
            onClick={props.onToggleExpanded}
          >
            Show less
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** Quiet launcher shown when top-tabs mode has no route-backed view selected. */
export function GlobalTabsEmptyState(props: {
  readonly onNewThread: () => void;
  readonly onSearchThreads: () => void;
  readonly onOpenPullRequests: () => void;
  readonly onOpenSettings: () => void;
  readonly onOpenUsage: () => void;
  readonly onOpenThread: (thread: EnvironmentThreadShell) => void;
  readonly pullRequestsSupported: boolean;
  readonly recentProjects: readonly GlobalTabsLandingProject[];
  readonly statusByThreadKey: ReadonlyMap<string, ThreadStatusPill>;
}) {
  const [expandedProjectKeys, setExpandedProjectKeys] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  return (
    <SidebarInset className="h-full min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground">
      <div className="relative min-h-0 flex-1 overflow-y-auto">
        <GlobalTabsLandingBackdrop />
        <main className="relative z-10 mx-auto flex min-h-full w-full max-w-2xl items-start px-6 py-14 sm:px-10">
          <div className="my-auto w-full">
            <header className="mb-7 px-2">
              <h1 className="text-base font-medium tracking-tight text-foreground">New tab</h1>
              <p className="mt-1 text-sm text-muted-foreground/70">
                Start something new or return to recent work.
              </p>
            </header>

            <section aria-labelledby="global-tab-open-heading">
              <h2
                id="global-tab-open-heading"
                className="mb-1 px-2 text-[11px] font-medium tracking-wide text-muted-foreground/65 uppercase"
              >
                Open
              </h2>
              <div>
                <LandingAction
                  icon={SquarePenIcon}
                  label="New thread"
                  onClick={props.onNewThread}
                />
                <LandingAction
                  icon={SearchIcon}
                  label="Search threads"
                  onClick={props.onSearchThreads}
                />
                {props.pullRequestsSupported ? (
                  <LandingAction
                    icon={GitPullRequestIcon}
                    label="Pull requests"
                    onClick={props.onOpenPullRequests}
                  />
                ) : null}
                <LandingAction
                  icon={ChartNoAxesColumnIcon}
                  label="Usage"
                  onClick={props.onOpenUsage}
                />
                <LandingAction
                  icon={Settings2Icon}
                  label="Settings"
                  onClick={props.onOpenSettings}
                />
              </div>
            </section>

            <section aria-labelledby="global-tab-recent-heading" className="mt-8">
              <h2
                id="global-tab-recent-heading"
                className="mb-2 px-2 text-[11px] font-medium tracking-wide text-muted-foreground/65 uppercase"
              >
                Recent threads
              </h2>
              {props.recentProjects.length > 0 ? (
                <div className="space-y-3">
                  {props.recentProjects.map((group) => {
                    const key = `${group.project.environmentId}:${group.project.id}`;
                    return (
                      <RecentProjectGroup
                        key={key}
                        group={group}
                        onOpenThread={props.onOpenThread}
                        statusByThreadKey={props.statusByThreadKey}
                        expanded={expandedProjectKeys.has(key)}
                        onToggleExpanded={() =>
                          setExpandedProjectKeys((current) => {
                            const next = new Set(current);
                            if (next.has(key)) next.delete(key);
                            else next.add(key);
                            return next;
                          })
                        }
                      />
                    );
                  })}
                </div>
              ) : (
                <p className="px-2 py-2 text-sm text-muted-foreground/60">No recent threads yet.</p>
              )}
            </section>
          </div>
        </main>
      </div>
    </SidebarInset>
  );
}
