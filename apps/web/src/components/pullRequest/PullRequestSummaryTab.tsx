import type { EnvironmentId, PullRequestDetailView, PullRequestRef } from "@t3tools/contracts";
import {
  ArrowRightIcon,
  CheckCircle2Icon,
  CircleDotIcon,
  FileDiffIcon,
  GitBranchIcon,
  GitCommitHorizontalIcon,
  GitMergeIcon,
  GitPullRequestClosedIcon,
  GitPullRequestIcon,
  HammerIcon,
  MessageSquareIcon,
  UsersIcon,
} from "lucide-react";
import { useMemo, type ReactNode } from "react";

import { cn } from "~/lib/utils";
import { readLocalApi } from "~/localApi";
import { formatRelativeTimeLabel } from "~/timestampFormat";

import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import {
  PullRequestActorLabel,
  PullRequestActorAvatar,
  PullRequestCheckStatusIcon,
  PullRequestDiffStat,
  pullRequestCheckStatusLabel,
  resolvePullRequestState,
  summarizePullRequestChecks,
} from "./pullRequestPresentation";
import { PullRequestMarkdown } from "./PullRequestMarkdown";
import { PullRequestReviewerPicker } from "./PullRequestReviewerPicker";
import {
  buildPullRequestTimeline,
  pullRequestFindingKey,
  type PullRequestFinding,
  type PullRequestTimelineEvent,
} from "./pullRequestDetail.logic";

type ActivityStatus = "loading" | "ready" | "unavailable";

const LATEST_ACTIVITY_LIMIT = 3;

function activityTitle(event: PullRequestTimelineEvent): string {
  if (event.kind === "commit") return event.body ?? "Untitled commit";
  if (event.actor) return `${event.actor.login} ${event.title}`;
  return event.title;
}

function activityExcerpt(event: PullRequestTimelineEvent): string | null {
  if ((event.kind !== "comment" && event.kind !== "review") || event.body === null) return null;
  const visible = event.body
    .replace(/<!--[\s\S]*?-->/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
  return visible.length === 0 ? null : visible;
}

function ActivityMarker({ event }: { readonly event: PullRequestTimelineEvent }) {
  if (event.actor) {
    return <PullRequestActorAvatar actor={event.actor} className="size-7 bg-muted text-[9px]" />;
  }

  const icon =
    event.kind === "commit" ? (
      <GitCommitHorizontalIcon className="size-3.5" />
    ) : event.kind === "merged" ? (
      <GitMergeIcon className="size-3.5" />
    ) : event.kind === "closed" ? (
      <GitPullRequestClosedIcon className="size-3.5" />
    ) : event.kind === "opened" ? (
      <GitPullRequestIcon className="size-3.5" />
    ) : (
      <MessageSquareIcon className="size-3.5" />
    );
  return (
    <span className="flex size-7 items-center justify-center rounded-full bg-background text-muted-foreground shadow-[0_0_0_1px_color-mix(in_srgb,currentColor_16%,transparent)]">
      {icon}
    </span>
  );
}

function LatestActivity({
  detail,
  status,
  onViewAll,
}: {
  readonly detail: PullRequestDetailView;
  readonly status: ActivityStatus;
  readonly onViewAll: () => void;
}) {
  const events = useMemo(
    () => buildPullRequestTimeline(detail).slice(0, LATEST_ACTIVITY_LIMIT),
    [detail],
  );

  return (
    <section className="border-t border-border/60 pt-6 lg:col-span-2">
      <div className="mb-3 flex min-h-10 items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Latest activity</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">The newest updates on this review.</p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="min-h-10 shrink-0"
          onClick={onViewAll}
        >
          View all activity
          <ArrowRightIcon className="size-3.5" />
        </Button>
      </div>

      {status === "loading" ? (
        <p className="py-3 text-xs text-muted-foreground">Loading activity…</p>
      ) : status === "unavailable" ? (
        <p className="py-3 text-xs text-muted-foreground">
          Activity is unavailable right now. Open the full view to retry.
        </p>
      ) : (
        <ol className="relative before:absolute before:bottom-5 before:left-3.5 before:top-5 before:w-px before:bg-border/55">
          {events.map((event) => {
            const excerpt = activityExcerpt(event);
            return (
              <li key={`${event.kind}:${event.id}`} className="relative flex min-h-14 gap-3 py-2">
                <span className="relative z-10 flex size-7 shrink-0 items-center justify-center bg-background">
                  <ActivityMarker event={event} />
                </span>
                <div className="min-w-0 flex-1 pt-0.5">
                  <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="min-w-0 truncate text-sm font-medium text-foreground">
                      {activityTitle(event)}
                    </span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {formatRelativeTimeLabel(event.at)}
                    </span>
                  </div>
                  <div className="mt-0.5 flex min-w-0 items-center gap-2 text-[11px] text-muted-foreground">
                    {event.kind === "commit" ? (
                      <code className="shrink-0 font-mono tabular-nums">
                        {event.id.slice(0, 7)}
                      </code>
                    ) : null}
                    {event.reviewState ? (
                      <span className="shrink-0 capitalize">
                        {event.reviewState.toLowerCase().replaceAll("_", " ")}
                      </span>
                    ) : null}
                    {excerpt ? <span className="line-clamp-1 min-w-0">{excerpt}</span> : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function InfoSection({
  icon,
  label,
  children,
}: {
  readonly icon: ReactNode;
  readonly label: string;
  readonly children: ReactNode;
}) {
  return (
    <section className="space-y-2.5">
      <h2 className="text-xs font-medium text-muted-foreground">{label}</h2>
      <div className="flex min-w-0 items-start gap-2.5 text-sm">
        <span className="mt-0.5 shrink-0 text-muted-foreground">{icon}</span>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </section>
  );
}

/** The overview of a pull request, with reading content left and compact metadata to the right. */
export function PullRequestSummaryTab({
  environmentId,
  reference,
  detail,
  activityStatus,
  pendingFinding,
  onFixFinding,
  onRefresh,
  onViewActivity,
}: {
  readonly environmentId: EnvironmentId;
  readonly reference: PullRequestRef;
  readonly detail: PullRequestDetailView;
  readonly activityStatus: ActivityStatus;
  readonly pendingFinding?: string | null;
  readonly onFixFinding?: (finding: PullRequestFinding) => void;
  readonly onRefresh: () => void;
  readonly onViewActivity: () => void;
}) {
  const state = resolvePullRequestState({
    state: detail.state,
    isDraft: detail.isDraft,
    mergeability: detail.mergeability,
    baseBranch: detail.baseBranch,
  });
  const checksSummary = summarizePullRequestChecks(detail.checks) ?? "No checks reported";
  const openCheck = (url: string) => {
    void readLocalApi()?.shell.openExternal(url);
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-5 py-6 lg:grid-cols-[minmax(0,1fr)_16rem] lg:px-8">
        <main className="min-w-0 space-y-8">
          <section>
            <h2 className="mb-3 text-sm font-semibold text-foreground">Description</h2>
            <PullRequestMarkdown
              text={detail.body.trim().length > 0 ? detail.body : "_No description provided._"}
              cwd={detail.workspaceRoot}
            />
          </section>

          <section>
            <div className="mb-3 flex items-center gap-2">
              <h2 className="text-sm font-semibold text-foreground">Checks</h2>
              <span className="text-xs tabular-nums text-muted-foreground">
                {detail.checks.length}
              </span>
            </div>
            {detail.checks.length === 0 ? (
              <p className="text-xs text-muted-foreground">No checks reported.</p>
            ) : (
              <div className="space-y-1">
                {detail.checks.map((check) => {
                  const finding = { kind: "check", check } as const;
                  const failing = check.status === "failure" || check.status === "cancelled";
                  return (
                    <div
                      key={`${check.name}:${check.url ?? ""}`}
                      className="group flex min-h-10 items-center gap-1 rounded-lg hover:bg-accent/50"
                    >
                      <button
                        type="button"
                        disabled={!check.url}
                        onClick={() => check.url && openCheck(check.url)}
                        className={cn(
                          "flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-lg px-2.5 text-left text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          check.url ? undefined : "cursor-default",
                        )}
                      >
                        <PullRequestCheckStatusIcon status={check.status} />
                        <span className="min-w-0 flex-1 truncate">{check.name}</span>
                        <span className="shrink-0 text-muted-foreground">
                          {pullRequestCheckStatusLabel(check.status)}
                        </span>
                      </button>
                      {onFixFinding && failing ? (
                        <Button
                          size="xs"
                          variant="ghost"
                          className="mr-1 shrink-0"
                          disabled={pendingFinding !== null && pendingFinding !== undefined}
                          onClick={() => onFixFinding(finding)}
                        >
                          <HammerIcon className="size-3" />
                          {pendingFinding === pullRequestFindingKey(finding)
                            ? "Preparing..."
                            : "Fix"}
                        </Button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </main>

        <aside className="space-y-8 border-t border-border/60 pt-6 lg:border-l lg:border-t-0 lg:pl-7 lg:pt-0">
          <InfoSection icon={<GitPullRequestIcon className="size-4" />} label="Status">
            <span className={cn("font-medium", state.toneClassName)}>{state.label}</span>
          </InfoSection>

          <InfoSection icon={<UsersIcon className="size-4" />} label="Reviewers">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              {detail.reviewers.length === 0 ? (
                <span className="text-muted-foreground">None</span>
              ) : (
                <span className="flex min-w-0 flex-col gap-2">
                  {detail.reviewers.map((actor) => (
                    <Tooltip key={actor.login}>
                      <TooltipTrigger
                        render={
                          <span
                            className="min-w-0 rounded-md"
                            aria-label={actor.name ?? actor.login}
                          />
                        }
                      >
                        <PullRequestActorLabel actor={actor} className="min-w-0 text-sm" />
                      </TooltipTrigger>
                      <TooltipPopup side="bottom">
                        {actor.name && actor.name !== actor.login
                          ? `${actor.name} (@${actor.login})`
                          : actor.login}
                      </TooltipPopup>
                    </Tooltip>
                  ))}
                </span>
              )}
              {detail.capabilities.reviewers.request &&
              detail.capabilities.reviewers.listCandidates ? (
                <PullRequestReviewerPicker
                  environmentId={environmentId}
                  reference={reference}
                  allowed={detail.viewerPermissions.requestReviewers}
                  onRequested={onRefresh}
                />
              ) : null}
            </div>
          </InfoSection>

          <InfoSection
            icon={
              detail.checks.length > 0 &&
              detail.checks.every((check) => check.status === "success") ? (
                <CheckCircle2Icon className="size-4 text-emerald-600 dark:text-emerald-500" />
              ) : (
                <CircleDotIcon className="size-4" />
              )
            }
            label="Checks"
          >
            <span className="text-pretty">{checksSummary}</span>
          </InfoSection>

          <InfoSection icon={<GitBranchIcon className="size-4" />} label="Branch">
            <div className="min-w-0 space-y-1 font-mono text-xs">
              <div className="truncate text-foreground" title={detail.headBranch}>
                {detail.headBranch}
              </div>
              <div className="truncate text-muted-foreground" title={detail.baseBranch}>
                into {detail.baseBranch}
              </div>
            </div>
          </InfoSection>

          <InfoSection icon={<FileDiffIcon className="size-4" />} label="Changes">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="tabular-nums">
                {detail.changedFiles.toLocaleString()}{" "}
                {detail.changedFiles === 1 ? "file" : "files"}
              </span>
              <PullRequestDiffStat
                additions={detail.additions}
                deletions={detail.deletions}
                className="font-mono text-xs"
              />
            </div>
          </InfoSection>
        </aside>

        <LatestActivity detail={detail} status={activityStatus} onViewAll={onViewActivity} />
      </div>
    </div>
  );
}
