import type {
  EnvironmentId,
  PullRequestActor,
  PullRequestDetailView,
  PullRequestRef,
  PullRequestReviewThread,
} from "@t3tools/contracts";
import {
  ExternalLinkIcon,
  FileCode2Icon,
  GitCommitHorizontalIcon,
  GitMergeIcon,
  GitPullRequestClosedIcon,
  GitPullRequestIcon,
  MessageSquareIcon,
  SendIcon,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

import { readLocalApi } from "~/localApi";
import { pullRequestEnvironment } from "~/state/pullRequests";
import { useAtomCommand } from "~/state/use-atom-command";
import { formatRelativeTimeLabel } from "~/timestampFormat";

import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { toastManager } from "../ui/toast";
import {
  buildPullRequestTimeline,
  pullRequestFindingKey,
  type PullRequestFinding,
  type PullRequestTimelineEvent,
} from "./pullRequestDetail.logic";
import { PullRequestMarkdown } from "./PullRequestMarkdown";
import { ReviewThreadCard } from "./PullRequestReviewAnnotation";
import {
  PullRequestActorAvatar,
  PullRequestDiffStat,
  PullRequestMetaLine,
} from "./pullRequestPresentation";

function Marker({ children }: { readonly children: ReactNode }) {
  return (
    <span className="absolute left-0 top-5 z-10 flex size-8 -translate-y-1/2 items-center justify-center bg-background text-muted-foreground">
      {children}
    </span>
  );
}

function ActorMarker({ actor, fallback }: { actor: PullRequestActor | null; fallback: ReactNode }) {
  return (
    <Marker>
      {actor ? (
        <PullRequestActorAvatar actor={actor} className="size-7 bg-muted text-[9px]" />
      ) : (
        <span className="flex size-7 items-center justify-center bg-background">{fallback}</span>
      )}
    </Marker>
  );
}

function ActorName({ actor }: { readonly actor: PullRequestActor | null }) {
  return <span className="font-semibold text-foreground">{actor?.login ?? "ghost"}</span>;
}

function CommitEvent({
  event,
  onOpen,
}: {
  readonly event: PullRequestTimelineEvent;
  readonly onOpen: (oid: string) => void;
}) {
  return (
    <button
      type="button"
      className="group relative mb-5 block min-h-10 w-full rounded-md pl-12 text-left outline-none [contain-intrinsic-block-size:48px] [content-visibility:auto] focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`View commit ${event.id}`}
      onClick={() => onOpen(event.id)}
    >
      <ActorMarker
        actor={event.commitAuthors[0] ?? event.actor}
        fallback={<GitCommitHorizontalIcon className="size-3.5" />}
      />
      <div className="flex min-w-0 items-center gap-3 py-1.5">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-foreground group-hover:underline group-hover:underline-offset-2">
            {event.body ?? "Untitled commit"}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
            <code className="font-mono tabular-nums">{event.id.slice(0, 7)}</code>
            <span>{formatRelativeTimeLabel(event.at)}</span>
          </div>
        </div>
        {event.additions !== null && event.deletions !== null ? (
          <PullRequestDiffStat
            additions={event.additions}
            deletions={event.deletions}
            className="shrink-0 font-mono text-[11px]"
          />
        ) : null}
      </div>
    </button>
  );
}

function LifecycleEvent({ event }: { readonly event: PullRequestTimelineEvent }) {
  const presentation =
    event.kind === "opened"
      ? { icon: <GitPullRequestIcon className="size-3.5" />, label: "opened this pull request" }
      : event.kind === "merged"
        ? { icon: <GitMergeIcon className="size-3.5" />, label: "merged this pull request" }
        : {
            icon: <GitPullRequestClosedIcon className="size-3.5" />,
            label: "closed this pull request",
          };

  return (
    <div className="relative mb-5 min-h-10 pl-12 [contain-intrinsic-block-size:48px] [content-visibility:auto]">
      <ActorMarker actor={event.actor} fallback={presentation.icon} />
      <div className="py-1.5 text-sm">
        <div className="flex flex-wrap items-center gap-1.5">
          {event.actor ? <ActorName actor={event.actor} /> : null}
          <span className="text-foreground">{presentation.label}</span>
          <span className="text-muted-foreground">· {formatRelativeTimeLabel(event.at)}</span>
        </div>
      </div>
    </div>
  );
}

function CommentEvent({
  event,
  cwd,
}: {
  readonly event: PullRequestTimelineEvent;
  readonly cwd: string;
}) {
  const openOnHost = () => {
    if (event.url) void readLocalApi()?.shell.openExternal(event.url);
  };
  return (
    <div className="relative mb-5 pl-12 [contain-intrinsic-block-size:120px] [content-visibility:auto]">
      <ActorMarker actor={event.actor} fallback={<MessageSquareIcon className="size-3.5" />} />
      <article className="rounded-xl border border-border/60 bg-muted/15 p-4 shadow-sm">
        <div className="flex min-w-0 items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-1.5 text-sm">
              <ActorName actor={event.actor} />
              <span className="text-muted-foreground">{event.title}</span>
              {event.reviewState ? (
                <span className="text-xs text-muted-foreground">
                  {event.reviewState.toLowerCase().replaceAll("_", " ")}
                </span>
              ) : null}
            </div>
            <PullRequestMetaLine className="mt-1 text-[11px] text-muted-foreground">
              <span>{formatRelativeTimeLabel(event.at)}</span>
              {event.path ? (
                <span className="inline-flex min-w-0 items-center gap-1">
                  <FileCode2Icon className="size-3 shrink-0" />
                  <span className="truncate">{event.path}</span>
                </span>
              ) : null}
            </PullRequestMetaLine>
          </div>
          {event.url ? (
            <Button
              size="icon-xs"
              variant="ghost"
              className="-mr-1 -mt-1 shrink-0 text-muted-foreground"
              aria-label="Open activity on host"
              onClick={openOnHost}
            >
              <ExternalLinkIcon className="size-3" />
            </Button>
          ) : null}
        </div>
        {event.body ? <PullRequestMarkdown className="mt-3" text={event.body} cwd={cwd} /> : null}
      </article>
    </div>
  );
}

function CommentComposer({
  environmentId,
  detail,
  onCommented,
}: {
  readonly environmentId: EnvironmentId;
  readonly detail: PullRequestDetailView;
  readonly onCommented: () => void;
}) {
  const [body, setBody] = useState("");
  const [posting, setPosting] = useState(false);
  const postComment = useAtomCommand(pullRequestEnvironment.comment, { reportFailure: false });
  const submit = async () => {
    const trimmed = body.trim();
    if (trimmed.length === 0 || posting) return;
    setPosting(true);
    const result = await postComment({
      environmentId,
      input: {
        projectId: detail.projectId,
        repository: detail.repository,
        number: detail.number,
        body: trimmed,
      },
    });
    setPosting(false);
    if (result._tag === "Failure") {
      toastManager.add({ type: "error", title: "Could not post the comment" });
      return;
    }
    setBody("");
    onCommented();
  };

  return (
    <div className="relative pl-12">
      <Marker>
        <span className="flex size-7 items-center justify-center bg-background">
          <MessageSquareIcon className="size-3.5" />
        </span>
      </Marker>
      <div className="rounded-xl border border-border/60 bg-muted/15 p-3 shadow-sm">
        <Textarea
          disabled={posting}
          value={body}
          rows={3}
          placeholder="Leave a comment…"
          aria-label="Comment on this pull request"
          onChange={(event) => setBody(event.target.value)}
        />
        <div className="mt-2 flex justify-end">
          <Button
            size="sm"
            disabled={body.trim().length === 0 || posting}
            onClick={() => void submit()}
          >
            <SendIcon className="size-3.5" />
            {posting ? "Posting..." : "Comment"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Chronological pull request activity, from opening through the latest conversation. */
export function PullRequestTimelineTab({
  environmentId,
  reference,
  detail,
  pendingFinding,
  onFixFinding,
  onOpenCommit,
  onRefresh,
}: {
  readonly environmentId: EnvironmentId;
  readonly reference: PullRequestRef;
  readonly detail: PullRequestDetailView;
  readonly pendingFinding?: string | null;
  readonly onFixFinding?: (finding: PullRequestFinding) => void;
  readonly onOpenCommit: (oid: string) => void;
  readonly onRefresh: () => void;
}) {
  const events = useMemo(() => buildPullRequestTimeline(detail).toReversed(), [detail]);
  const [threadPending, setThreadPending] = useState(false);
  const replyToThread = useAtomCommand(pullRequestEnvironment.replyToThread, {
    reportFailure: false,
  });
  const setThreadResolution = useAtomCommand(pullRequestEnvironment.setThreadResolution, {
    reportFailure: false,
  });
  const review = {
    reply: detail.capabilities.review.reply && detail.viewerPermissions.comment,
    resolve: detail.capabilities.review.resolve && detail.viewerPermissions.resolve,
  };
  const threadIndex = useMemo(() => {
    const startByCommentId = new Map<string, PullRequestReviewThread>();
    const commentIds = new Set<string>();
    const eventIds = new Set(events.map((event) => event.id));
    const orphanThreads: PullRequestReviewThread[] = [];
    for (const thread of detail.reviewThreads) {
      const first = thread.comments[0];
      if (first) {
        startByCommentId.set(first.id, thread);
        if (!eventIds.has(first.id)) orphanThreads.push(thread);
      }
      for (const comment of thread.comments) commentIds.add(comment.id);
    }
    return { startByCommentId, commentIds, orphanThreads };
  }, [detail.reviewThreads, events]);
  const runThreadCommand = async (
    label: string,
    run: () => Promise<{ readonly _tag: string }>,
  ): Promise<boolean> => {
    if (threadPending) return false;
    setThreadPending(true);
    const result = await run();
    setThreadPending(false);
    if (result._tag === "Failure") {
      toastManager.add({ type: "error", title: label });
      return false;
    }
    onRefresh();
    return true;
  };
  const renderThread = (thread: PullRequestReviewThread) => (
    <div key={thread.id} className="relative mb-5 pl-12">
      <ActorMarker
        actor={thread.comments[0]?.author ?? null}
        fallback={<MessageSquareIcon className="size-3.5" />}
      />
      <ReviewThreadCard
        className="mx-0 my-0"
        thread={thread}
        workspaceRoot={detail.workspaceRoot}
        canReply={review.reply}
        canResolve={review.resolve}
        pending={threadPending}
        fixPending={pendingFinding === pullRequestFindingKey({ kind: "thread", thread })}
        {...(onFixFinding ? { onFix: () => onFixFinding({ kind: "thread", thread }) } : {})}
        onReply={(body) =>
          runThreadCommand("Reply could not be posted", () =>
            replyToThread({
              environmentId,
              input: { ...reference, threadId: thread.id, body },
            }),
          )
        }
        onToggleResolved={() =>
          void runThreadCommand("The conversation could not be updated", () =>
            setThreadResolution({
              environmentId,
              input: { ...reference, threadId: thread.id, resolved: !thread.isResolved },
            }),
          )
        }
      />
    </div>
  );

  return (
    <div className="h-full overflow-y-auto px-5 py-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <h2 className="mb-5 text-sm font-medium text-muted-foreground">Activity</h2>
        <div className="relative">
          <span aria-hidden className="absolute bottom-5 left-[15px] top-1 w-px bg-border/55" />
          {events.map((event) => {
            const thread = threadIndex.startByCommentId.get(event.id);
            if (thread) return renderThread(thread);
            if (threadIndex.commentIds.has(event.id)) return null;
            if (event.kind === "commit") {
              return <CommitEvent key={event.id} event={event} onOpen={onOpenCommit} />;
            }
            if (event.kind === "comment" || event.kind === "review") {
              return <CommentEvent key={event.id} event={event} cwd={detail.workspaceRoot} />;
            }
            return <LifecycleEvent key={event.id} event={event} />;
          })}
          {threadIndex.orphanThreads.map(renderThread)}
          {detail.commentsTruncated ? (
            <p className="mb-5 ml-12 rounded-lg bg-amber-500/8 px-3 py-2 text-xs text-muted-foreground">
              This activity is longer than the host response. Open the pull request on its host to
              read the earlier conversation.
            </p>
          ) : null}
          {detail.capabilities.comment && detail.viewerPermissions.comment ? (
            <CommentComposer
              key={`${environmentId}:${detail.projectId}/${detail.repository}#${detail.number}`}
              environmentId={environmentId}
              detail={detail}
              onCommented={onRefresh}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
