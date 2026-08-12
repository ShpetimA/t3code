import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import {
  ChartNoAxesColumnIcon,
  GitPullRequestIcon,
  MessageSquareTextIcon,
  Settings2Icon,
  SquarePenIcon,
} from "lucide-react";

import type { GlobalTabsLandingProject } from "../globalTabsLanding";
import { formatRelativeTimeLabel } from "../timestampFormat";
import { cn } from "../lib/utils";
import { GlobalTabsLandingBackdrop } from "./GlobalTabsLandingBackdrop";
import { ProjectFavicon } from "./ProjectFavicon";
import { SidebarInset } from "./ui/sidebar";

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
}) {
  const { project, threads } = props.group;
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
        {threads.map((thread) => (
          <button
            key={`${thread.environmentId}:${thread.id}`}
            type="button"
            className="group flex h-9 w-full min-w-0 items-center gap-2.5 rounded-lg px-2 text-left text-sm outline-none transition-[background-color,color] duration-150 ease-out hover:bg-accent/55 focus-visible:bg-accent/55 focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => props.onOpenThread(thread)}
          >
            <MessageSquareTextIcon className="size-3.5 shrink-0 text-muted-foreground/75 transition-colors duration-150 group-hover:text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate text-foreground/80 group-hover:text-foreground">
              {thread.title}
            </span>
            <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground/65">
              {formatRelativeTimeLabel(thread.latestUserMessageAt ?? thread.updatedAt)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Quiet launcher shown when top-tabs mode has no route-backed view selected. */
export function GlobalTabsEmptyState(props: {
  readonly onNewThread: () => void;
  readonly onOpenPullRequests: () => void;
  readonly onOpenSettings: () => void;
  readonly onOpenUsage: () => void;
  readonly onOpenThread: (thread: EnvironmentThreadShell) => void;
  readonly pullRequestsSupported: boolean;
  readonly recentProjects: readonly GlobalTabsLandingProject[];
}) {
  return (
    <SidebarInset className="h-full min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground">
      <div className="relative min-h-0 flex-1 overflow-y-auto">
        <GlobalTabsLandingBackdrop />
        <main className="relative z-10 mx-auto flex min-h-full w-full max-w-2xl items-center px-6 py-14 sm:px-10">
          <div className="w-full">
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

            <section
              aria-labelledby="global-tab-recent-heading"
              className={cn("mt-8", props.recentProjects.length === 0 && "opacity-80")}
            >
              <h2
                id="global-tab-recent-heading"
                className="mb-2 px-2 text-[11px] font-medium tracking-wide text-muted-foreground/65 uppercase"
              >
                Recent threads
              </h2>
              {props.recentProjects.length > 0 ? (
                <div className="space-y-3">
                  {props.recentProjects.map((group) => (
                    <RecentProjectGroup
                      key={`${group.project.environmentId}:${group.project.id}`}
                      group={group}
                      onOpenThread={props.onOpenThread}
                    />
                  ))}
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
