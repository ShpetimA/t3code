import type { FileDiffMetadata } from "@pierre/diffs";
import type { GitStatusEntry } from "@pierre/trees";
import { FileTree, useFileTree, useFileTreeSelector } from "@pierre/trees/react";
import { ChevronsDownUpIcon, ChevronsUpDownIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useTheme } from "~/hooks/useTheme";
import { resolveFileDiffPath } from "~/lib/diffRendering";
import { T3_PIERRE_ICONS } from "~/pierre-icons";
import { PIERRE_TREE_UNSAFE_CSS, pierreTreeStyle } from "~/pierre-tree-theme";

import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { getPullRequestFileLoadState } from "./pullRequestDiff.logic";

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

function collectDirectoryPaths(paths: ReadonlyArray<string>): ReadonlyArray<string> {
  const directories = new Set<string>();
  for (const path of paths) {
    const segments = path.split("/");
    let directory = "";
    for (const segment of segments.slice(0, -1)) {
      directory += `${segment}/`;
      directories.add(directory);
    }
  }
  return [...directories];
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
  const directoryPaths = useMemo(() => collectDirectoryPaths(paths), [paths]);
  const gitStatus = useMemo(() => files.map(toGitStatus), [files]);
  const filePathsRef = useRef<ReadonlySet<string>>(new Set(paths));
  const onSelectFileRef = useRef(onSelectFile);
  const previousPathsRef = useRef<ReadonlyArray<string>>(paths);
  const previousDirectoryPathsRef = useRef<ReadonlyArray<string>>(directoryPaths);
  const newDirectoryExpansionRef = useRef<"open" | "closed">("open");
  const [hasRequestedMore, setHasRequestedMore] = useState(false);
  const fileLoadState = getPullRequestFileLoadState(files.length, totalFileCount, hasMore);
  const progressTotal = fileLoadState.knownTotalFileCount;
  const progressPercent =
    progressTotal === null || progressTotal === 0 ? null : (files.length / progressTotal) * 100;
  const loadedFileCount = files.length.toLocaleString();
  const loadedFileProgress =
    progressTotal === null
      ? `${loadedFileCount} loaded`
      : `${loadedFileCount} of ${progressTotal.toLocaleString()} loaded`;

  useEffect(() => {
    filePathsRef.current = new Set(paths);
    onSelectFileRef.current = onSelectFile;
  }, [onSelectFile, paths]);

  const { model } = useFileTree({
    density: "compact",
    flattenEmptyDirectories: true,
    initialExpandedPaths: directoryPaths,
    initialExpansion: "closed",
    icons: T3_PIERRE_ICONS,
    onSelectionChange: (selectedPaths) => {
      const path = selectedPaths.at(-1)?.replace(/\/$/, "");
      if (path && filePathsRef.current.has(path)) {
        onSelectFileRef.current(path);
      }
    },
    paths,
    search: false,
    unsafeCSS: PIERRE_TREE_UNSAFE_CSS,
  });

  const selectAllDirectoriesExpanded = useCallback(
    (currentModel: typeof model) =>
      directoryPaths.every((path) => {
        const item = currentModel.getItem(path);
        return item !== null && "isExpanded" in item && item.isExpanded();
      }),
    [directoryPaths],
  );
  const allDirectoriesExpanded = useFileTreeSelector(model, selectAllDirectoriesExpanded);

  useEffect(() => {
    if (previousPathsRef.current === paths) return;
    const previousDirectoryPaths = previousDirectoryPathsRef.current;
    const previousDirectoryPathSet = new Set(previousDirectoryPaths);
    const previouslyExpandedPaths = new Set(
      previousDirectoryPaths.filter((path) => {
        const item = model.getItem(path);
        return item !== null && "isExpanded" in item && item.isExpanded();
      }),
    );
    const nextExpandedPaths = directoryPaths.filter((path) =>
      previousDirectoryPathSet.has(path)
        ? previouslyExpandedPaths.has(path)
        : newDirectoryExpansionRef.current === "open",
    );
    previousPathsRef.current = paths;
    previousDirectoryPathsRef.current = directoryPaths;
    model.resetPaths(paths, { initialExpandedPaths: nextExpandedPaths });
  }, [directoryPaths, model, paths]);

  useEffect(() => {
    model.setGitStatus(gitStatus);
  }, [gitStatus, model]);

  const setAllDirectoriesExpanded = (expanded: boolean) => {
    newDirectoryExpansionRef.current = expanded ? "open" : "closed";
    model.resetPaths(paths, {
      initialExpandedPaths: expanded ? directoryPaths : [],
    });
    model.setGitStatus(gitStatus);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <div className="surface-subheader gap-2 px-3 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Files</span>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {directoryPaths.length > 0 ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="ghost"
                    aria-label={
                      allDirectoriesExpanded ? "Collapse all folders" : "Expand all folders"
                    }
                    onClick={() => setAllDirectoriesExpanded(!allDirectoriesExpanded)}
                  />
                }
              >
                {allDirectoriesExpanded ? (
                  <ChevronsDownUpIcon className="size-3.5" />
                ) : (
                  <ChevronsUpDownIcon className="size-3.5" />
                )}
              </TooltipTrigger>
              <TooltipPopup side="bottom">
                {allDirectoriesExpanded ? "Collapse all folders" : "Expand all folders"}
              </TooltipPopup>
            </Tooltip>
          ) : null}
          <span className="min-w-6 text-right tabular-nums">
            {files.length}
            {progressTotal !== null && progressTotal > files.length
              ? ` of ${progressTotal}`
              : fileLoadState.displayedCountIsLowerBound
                ? "+"
                : ""}
          </span>
        </div>
      </div>
      <FileTree
        model={model}
        aria-label="Pull request files"
        className="min-h-0 flex-1 overflow-hidden"
        style={pierreTreeStyle(resolvedTheme)}
      />
      {hasMore ? (
        <div className="shrink-0 border-t border-border/60 p-2">
          <Button
            type="button"
            size="xs"
            variant="outline"
            aria-busy={isLoadingMore}
            className="relative h-10 w-full overflow-hidden bg-transparent tabular-nums dark:bg-transparent"
            disabled={isLoadingMore}
            onClick={() => {
              setHasRequestedMore(true);
              onLoadMore();
            }}
          >
            {progressPercent === null ? null : (
              <span
                aria-hidden
                className="absolute inset-y-0 left-0 bg-primary/8 transition-[width] duration-200 motion-reduce:transition-none"
                style={{ width: `${progressPercent}%` }}
              />
            )}
            <span className="relative z-10" aria-live="polite">
              {loadMoreFailed ? "Retry" : isLoadingMore ? "Loading" : "Load more"}
              {` · ${loadedFileProgress}`}
            </span>
          </Button>
        </div>
      ) : hasRequestedMore ? (
        <div
          role="status"
          className="flex h-10 shrink-0 items-center justify-center border-t border-border/60 px-3 text-xs text-muted-foreground tabular-nums"
        >
          All {loadedFileCount} {files.length === 1 ? "file" : "files"} loaded
        </div>
      ) : null}
    </div>
  );
}
