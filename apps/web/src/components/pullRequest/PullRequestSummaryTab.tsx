import type { EnvironmentId, PullRequestDetailView, PullRequestRef } from "@t3tools/contracts";
import {
  CheckCircle2Icon,
  CircleDotIcon,
  FileDiffIcon,
  GitBranchIcon,
  GitPullRequestIcon,
  HammerIcon,
  UsersIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "~/lib/utils";
import { readLocalApi } from "~/localApi";

import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import {
  PullRequestActorLabel,
  PullRequestCheckStatusIcon,
  PullRequestDiffStat,
  pullRequestCheckStatusLabel,
  resolvePullRequestState,
  summarizePullRequestChecks,
} from "./pullRequestPresentation";
import { PullRequestMarkdown } from "./PullRequestMarkdown";
import { PullRequestReviewerPicker } from "./PullRequestReviewerPicker";
import { pullRequestFindingKey, type PullRequestFinding } from "./pullRequestDetail.logic";

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
  pendingFinding,
  onFixFinding,
  onRefresh,
}: {
  readonly environmentId: EnvironmentId;
  readonly reference: PullRequestRef;
  readonly detail: PullRequestDetailView;
  readonly pendingFinding?: string | null;
  readonly onFixFinding?: (finding: PullRequestFinding) => void;
  readonly onRefresh: () => void;
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
      </div>
    </div>
  );
}
