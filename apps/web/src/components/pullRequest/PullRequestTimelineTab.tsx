import type { EnvironmentId, PullRequestDetailView, PullRequestRef } from "@t3tools/contracts";

import { PullRequestActivityFeed } from "./PullRequestActivityFeed";
import type { PullRequestFinding } from "./pullRequestDetail.logic";

/** Full chronological pull request activity, from opening through the latest conversation. */
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
  return (
    <div className="h-full overflow-y-auto px-5 py-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <h2 className="mb-5 text-sm font-medium text-muted-foreground">Activity</h2>
        <PullRequestActivityFeed
          environmentId={environmentId}
          reference={reference}
          detail={detail}
          view={{ _tag: "Full" }}
          pendingFinding={pendingFinding}
          onFixFinding={onFixFinding}
          onOpenCommit={onOpenCommit}
          onRefresh={onRefresh}
        />
      </div>
    </div>
  );
}
