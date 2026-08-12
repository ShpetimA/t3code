import type { FileDiffMetadata } from "@pierre/diffs";
import type { GitStatusEntry } from "@pierre/trees";
import { FileTree, useFileTree } from "@pierre/trees/react";
import { useEffect, useMemo, useRef } from "react";

import { useTheme } from "~/hooks/useTheme";
import { resolveFileDiffPath } from "~/lib/diffRendering";
import { T3_PIERRE_ICONS } from "~/pierre-icons";

import { Button } from "../ui/button";

const TREE_UNSAFE_CSS = `
  :host {
    --trees-bg-override: transparent;
    --trees-selected-bg-override: color-mix(in srgb, currentColor 12%, transparent);
    --trees-hover-bg-override: color-mix(in srgb, currentColor 7%, transparent);
    --trees-border-color-override: color-mix(in srgb, currentColor 14%, transparent);
    --trees-font-family-override: var(--font-sans);
    --trees-font-size-override: 12px;
  }
  button[data-type='item'] { border-radius: 5px; }
`;

function toGitStatus(file: FileDiffMetadata): GitStatusEntry {
  const path = resolveFileDiffPath(file);
  switch (file.type) {
    case "new":
      return { path, status: "added" };
    case "deleted":
      return { path, status: "deleted" };
    case "rename-pure":
    case "rename-changed":
      return { path, status: "renamed" };
    case "change":
      return { path, status: "modified" };
  }
}

/** A path-first Pierre tree for the portion of a pull-request diff loaded so far. */
export function PullRequestDiffFileTree({
  files,
  totalFileCount,
  hasMore,
  isLoadingMore,
  loadMoreFailed,
  onLoadMore,
  onSelectFile,
}: {
  readonly files: ReadonlyArray<FileDiffMetadata>;
  /** Null when the selected host commit does not report its own aggregate file count. */
  readonly totalFileCount: number | null;
  readonly hasMore: boolean;
  readonly isLoadingMore: boolean;
  readonly loadMoreFailed: boolean;
  readonly onLoadMore: () => void;
  readonly onSelectFile: (path: string) => void;
}) {
  const { resolvedTheme } = useTheme();
  const paths = useMemo(() => files.map(resolveFileDiffPath), [files]);
  const gitStatus = useMemo(() => files.map(toGitStatus), [files]);
  const filePathsRef = useRef<ReadonlySet<string>>(new Set(paths));
  const onSelectFileRef = useRef(onSelectFile);
  const previousPathsRef = useRef<ReadonlyArray<string>>([]);

  useEffect(() => {
    filePathsRef.current = new Set(paths);
    onSelectFileRef.current = onSelectFile;
  }, [onSelectFile, paths]);

  const { model } = useFileTree({
    density: "compact",
    flattenEmptyDirectories: true,
    initialExpansion: 1,
    icons: T3_PIERRE_ICONS,
    onSelectionChange: (selectedPaths) => {
      const path = selectedPaths.at(-1)?.replace(/\/$/, "");
      if (path && filePathsRef.current.has(path)) {
        onSelectFileRef.current(path);
      }
    },
    paths: [],
    search: false,
    unsafeCSS: TREE_UNSAFE_CSS,
  });

  useEffect(() => {
    if (previousPathsRef.current === paths) return;
    previousPathsRef.current = paths;
    model.resetPaths(paths);
    model.setGitStatus(gitStatus);
  }, [gitStatus, model, paths]);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <div className="surface-subheader justify-between gap-2 px-3 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Files</span>
        <span className="tabular-nums">
          {files.length}
          {totalFileCount !== null && totalFileCount > files.length
            ? ` of ${totalFileCount}`
            : totalFileCount === null && hasMore
              ? "+"
              : ""}
        </span>
      </div>
      <FileTree
        model={model}
        aria-label="Pull request files"
        className="min-h-0 flex-1 overflow-hidden"
        style={{
          colorScheme: resolvedTheme,
          ["--trees-fg-override" as string]: "var(--foreground)",
        }}
      />
      {hasMore ? (
        <div className="shrink-0 border-t border-border/60 p-2">
          <Button
            type="button"
            size="xs"
            variant="outline"
            className="w-full tabular-nums"
            disabled={isLoadingMore}
            onClick={onLoadMore}
          >
            {loadMoreFailed
              ? "Retry loading files"
              : isLoadingMore
                ? "Loading more files…"
                : "Load more files"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
