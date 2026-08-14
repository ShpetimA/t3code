import type { PreviewSessionSnapshot, PullRequestState } from "@t3tools/contracts";
import { getTerminalLabel } from "@t3tools/shared/terminalLabels";
import {
  Bot,
  FileDiff,
  Files,
  GitPullRequest,
  Globe2,
  Maximize2,
  MessageSquareText,
  Minimize2,
  Plus,
  TerminalSquare,
  X,
} from "lucide-react";
import {
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactElement,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { isElectron } from "~/env";
import type { DesktopPreviewOverlay } from "~/previewStateStore";
import type { AdjacentPanes, PaneSplitDirection } from "~/splitPaneTree";
import type { RightPanelSurface } from "~/threadWorkspace";
import { cn } from "~/lib/utils";
import { readLocalApi } from "~/localApi";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { Button } from "~/components/ui/button";
import { Kbd } from "~/components/ui/kbd";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "~/components/ui/menu";
import { ScrollArea } from "~/components/ui/scroll-area";
import { faviconUrlForOrigin } from "~/lib/favicon";
import { useTheme } from "~/hooks/useTheme";
import { COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS } from "~/workspaceTitlebar";

import { PreviewPanelShell, type PreviewPanelMode } from "./preview/PreviewPanelShell";
import { FaviconImage } from "./preview/PreviewFaviconIcon";
import { PierreEntryIcon } from "./chat/PierreEntryIcon";
import type { ThreadStatusPill } from "./Sidebar.logic";
import {
  buildWorkspaceTabContextMenuItems,
  type WorkspaceTabContextTarget,
  resolveWorkspaceTabLayoutAction,
  resolveWorkspaceTabSplitAction,
} from "./RightPanelTabs.logic";

interface RightPanelTabsProps {
  mode: PreviewPanelMode;
  titleBar?: boolean;
  sidebarTitleBarInset?: boolean;
  maximized?: boolean;
  widthStorageKey?: string;
  defaultWidth?: number;
  layoutControls?: ReactNode;
  onCloseGroup?: () => void;
  focusView?: {
    readonly active: boolean;
    readonly shortcutLabel: string | null;
    readonly onToggle: () => void;
  };
  threadTab?: {
    readonly title: string;
    readonly active: boolean;
    readonly status: ThreadStatusPill | null;
    readonly onActivate: () => void;
  };
  surfaces: readonly RightPanelSurface[];
  activeSurfaceId: string | null;
  pendingSurfaceIds: ReadonlySet<string>;
  previewSessions: Readonly<Record<string, PreviewSessionSnapshot>>;
  desktopByTabId: Readonly<Record<string, DesktopPreviewOverlay>>;
  terminalLabelsById: ReadonlyMap<string, string>;
  onActivate: (surface: RightPanelSurface) => void;
  onCloseSurface: (surface: RightPanelSurface) => void;
  onCloseOtherSurfaces: (surface: RightPanelSurface) => void;
  onCloseSurfacesToRight: (surface: RightPanelSurface) => void;
  onCloseAllSurfaces: () => void;
  onSplitTab?: (target: WorkspaceTabContextTarget, direction: PaneSplitDirection) => void;
  onMoveTabToSplit?: (target: WorkspaceTabContextTarget, direction: PaneSplitDirection) => void;
  onMoveTabToPane?: (target: WorkspaceTabContextTarget, direction: PaneSplitDirection) => void;
  onTabDragStart?: (target: WorkspaceTabContextTarget) => void;
  onTabDragEnd?: () => void;
  onTabDrop?: (target: WorkspaceTabContextTarget, position: "before" | "after") => void;
  onTabDropAtEnd?: () => void;
  adjacentGroups?: AdjacentPanes;
  canCopyTabToSplit?: (target: WorkspaceTabContextTarget) => boolean;
  canMoveTabToSplit?: (target: WorkspaceTabContextTarget) => boolean;
  onCopyFilePath: (relativePath: string) => void;
  onAddBrowser: () => void;
  onAddTerminal: () => void;
  onAddDiff: () => void;
  onAddFiles: () => void;
  onAddPullRequest: () => void;
  onAddAgents: () => void;
  browserAvailable: boolean;
  terminalAvailable: boolean;
  diffAvailable: boolean;
  filesAvailable: boolean;
  pullRequestAvailable: boolean;
  agentsAvailable: boolean;
  pullRequestStatuses?: Readonly<Record<string, PullRequestTabStatus>>;
  /** Running + waiting subagents; badges the Agents card in the empty state. */
  liveAgentCount: number;
  children: ReactNode;
}

type RightPanelTabBarProps = Omit<RightPanelTabsProps, "children">;

export interface PullRequestTabStatus {
  projectId: string;
  repository: string;
  number: number;
  state: PullRequestState;
  isDraft: boolean;
}

const SURFACE_DISABLED_REASONS = {
  browser: "Browser previews are only available in the T3 Code desktop app.",
  terminal: "Terminal surfaces are only available from a project thread.",
  files: "Files are only available when a project is open.",
  diff: "Diff is only available for server threads in Git repositories.",
  pullRequest: "This thread's branch has no pull request yet.",
  agents: "Agents are only available from a thread.",
} as const;

const NO_ADJACENT_EDITOR_GROUPS: AdjacentPanes = {
  up: null,
  down: null,
  left: null,
  right: null,
};

/** Overlays that must win over the launcher's letter shortcuts. */
const LAUNCHER_SHORTCUT_BLOCKING_LAYERS = [
  '[data-slot="dialog-popup"]',
  '[data-slot="alert-dialog-popup"]',
  '[data-slot="command-dialog-popup"]',
  '[data-slot="menu-popup"]',
  '[data-slot="select-popup"]',
  '[data-slot="popover-popup"]',
  '[data-slot="combobox-popup"]',
  '[data-slot="autocomplete-popup"]',
].join(",");

/** One-line unavailability hints for the empty-state cards. */
const SURFACE_UNAVAILABLE_HINTS = {
  browser: "Only available in the desktop app.",
  terminal: "Available when a project is open.",
  files: "Available when a project is open.",
  diff: "Available for Git repositories.",
  pullRequest: "No pull request on this branch yet.",
  agents: "Available from a thread.",
} as const;

function DisabledReasonTooltip(props: { reason: string; trigger: ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger render={props.trigger} />
      <TooltipPopup side="top">{props.reason}</TooltipPopup>
    </Tooltip>
  );
}

function SurfaceMenuItem(props: {
  available: boolean;
  disabledReason?: string;
  onClick: () => void;
  children: ReactNode;
}) {
  const item = (
    <MenuItem
      className={!props.available ? "data-disabled:pointer-events-auto" : undefined}
      onClick={props.onClick}
      disabled={!props.available}
    >
      {props.children}
    </MenuItem>
  );
  if (props.available || !props.disabledReason) return item;
  return <DisabledReasonTooltip reason={props.disabledReason} trigger={item} />;
}

/**
 * Card launcher shown when the right panel has no surfaces. Keyboard-first
 * without palette chrome: a surface's letter opens it directly from anywhere
 * outside a typing context, and arrows plus Enter work while the launcher is
 * focused. The highlight only appears on hover or arrow use. Unavailable
 * surfaces stay visible with a one-line reason.
 */
export function RightPanelEmptyState(props: {
  onAddBrowser: () => void;
  onAddTerminal: () => void;
  onAddDiff: () => void;
  onAddFiles: () => void;
  onAddPullRequest: () => void;
  onAddAgents: () => void;
  browserAvailable: boolean;
  terminalAvailable: boolean;
  diffAvailable: boolean;
  filesAvailable: boolean;
  pullRequestAvailable: boolean;
  agentsAvailable: boolean;
  liveAgentCount: number;
}) {
  // -1 means no highlight: it only appears on hover or arrow use.
  const [highlight, setHighlight] = useState(-1);

  const actions = [
    {
      label: "Browser",
      description: "Open a local app or URL.",
      icon: Globe2,
      shortcut: "B",
      available: props.browserAvailable,
      disabledReason: SURFACE_UNAVAILABLE_HINTS.browser,
      onClick: props.onAddBrowser,
      badgeCount: 0,
    },
    {
      label: "Terminal",
      description: "Start a shell in this workspace.",
      icon: TerminalSquare,
      shortcut: "T",
      available: props.terminalAvailable,
      disabledReason: SURFACE_UNAVAILABLE_HINTS.terminal,
      onClick: props.onAddTerminal,
      badgeCount: 0,
    },
    {
      label: "Files",
      description: "Browse and read workspace files.",
      icon: Files,
      shortcut: "F",
      available: props.filesAvailable,
      disabledReason: SURFACE_UNAVAILABLE_HINTS.files,
      onClick: props.onAddFiles,
      badgeCount: 0,
    },
    {
      label: "Diff",
      description: "Review changes in this thread.",
      icon: FileDiff,
      shortcut: "D",
      available: props.diffAvailable,
      disabledReason: SURFACE_UNAVAILABLE_HINTS.diff,
      onClick: props.onAddDiff,
      badgeCount: 0,
    },
    {
      label: "Pull request",
      description: "Open this branch's pull request.",
      icon: GitPullRequest,
      shortcut: "P",
      available: props.pullRequestAvailable,
      disabledReason: SURFACE_UNAVAILABLE_HINTS.pullRequest,
      onClick: props.onAddPullRequest,
      badgeCount: 0,
    },
    {
      label: "Agents",
      description: "Follow subagents and workflows.",
      icon: Bot,
      shortcut: "A",
      available: props.agentsAvailable,
      disabledReason: SURFACE_UNAVAILABLE_HINTS.agents,
      onClick: props.onAddAgents,
      badgeCount: props.liveAgentCount,
    },
  ] as const;

  type SurfaceAction = (typeof actions)[number];

  const availableActions = actions.filter((action) => action.available);
  const highlightIndex =
    availableActions.length === 0 ? -1 : Math.min(highlight, availableActions.length - 1);

  // Letter shortcuts work while the launcher is visible, not only while it
  // is focused; focus moves around too easily (stray clicks) to carry them.
  // Capture phase so app-level key handlers cannot swallow the event first;
  // typing contexts and already-handled events are left alone.
  const shortcutActionsRef = useRef(availableActions);
  useEffect(() => {
    shortcutActionsRef.current = availableActions;
  });
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (document.querySelector(LAUNCHER_SHORTCUT_BLOCKING_LAYERS)) return;
      const target = event.target;
      if (target instanceof HTMLElement) {
        if (target.closest("input, textarea, select")) return;
        // An empty contenteditable (the chat composer at rest) does not
        // count as typing; letters only become text once a draft exists.
        const editable = target.isContentEditable ? target : target.closest("[contenteditable]");
        if (editable && (editable.textContent ?? "").trim().length > 0) return;
      }
      const action = shortcutActionsRef.current.find(
        (candidate) => candidate.shortcut.toLowerCase() === event.key.toLowerCase(),
      );
      if (!action) return;
      event.preventDefault();
      event.stopPropagation();
      action.onClick();
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, []);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
    if (availableActions.length === 0) return;
    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      event.preventDefault();
      setHighlight((highlightIndex + 1) % availableActions.length);
      return;
    }
    if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      event.preventDefault();
      setHighlight(
        highlightIndex === -1
          ? availableActions.length - 1
          : (highlightIndex - 1 + availableActions.length) % availableActions.length,
      );
      return;
    }
    if (event.key === "Enter") {
      // A focused card button owns its own activation; only open from the
      // highlight when the container itself has focus.
      if (event.target instanceof HTMLElement && event.target.closest("button")) return;
      const action = availableActions[highlightIndex];
      if (!action) return;
      event.preventDefault();
      action.onClick();
    }
  };

  // Stable identity so React only runs this callback ref on mount/unmount;
  // an inline arrow would re-attach and re-focus on every render.
  const focusOnMount = useCallback((node: HTMLDivElement | null) => {
    node?.focus();
  }, []);

  const isHighlighted = (action: SurfaceAction) =>
    highlightIndex !== -1 && availableActions[highlightIndex] === action;

  const actionIcon = (action: SurfaceAction, iconClassName = "size-4") => {
    const Icon = action.icon;
    return (
      <span className="relative inline-flex shrink-0">
        <Icon className={iconClassName} />
        {action.badgeCount > 0 ? (
          <span
            aria-hidden
            className="absolute -top-1.5 -right-2 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-info px-1 text-[9px] font-semibold tabular-nums text-white"
          >
            {action.badgeCount}
          </span>
        ) : null}
      </span>
    );
  };

  const cardShellClass =
    "rounded-lg border border-border/80 bg-card dark:border-transparent dark:shadow-none dark:inset-ring-1 dark:inset-ring-white/5";
  const highlightedCardClass = "bg-accent/60 dark:inset-ring-white/20";

  return (
    <div
      ref={focusOnMount}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      aria-label="Open a surface"
      data-surface-launcher-keys={availableActions.map((action) => action.shortcut).join("")}
      className={cn(
        "flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-6 pt-6 outline-none",
        // The panel topbar sits above this container; matching bottom padding
        // keeps the cards centered against the full panel, not the leftover.
        "pb-[calc(var(--workspace-topbar-height)+--spacing(6))]",
      )}
    >
      <div className="relative w-full max-w-lg">
        <div className="absolute inset-x-0 bottom-full mb-5 text-center">
          <h3 className="font-medium text-foreground text-sm">Open a surface</h3>
          <p className="mt-1 text-muted-foreground text-xs">
            Choose what to show in the right panel.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {actions.map((action) =>
            action.available ? (
              <button
                key={action.label}
                type="button"
                onClick={action.onClick}
                onMouseEnter={() => setHighlight(availableActions.indexOf(action))}
                onMouseLeave={() =>
                  setHighlight((current) =>
                    current === availableActions.indexOf(action) ? -1 : current,
                  )
                }
                className={cn(
                  "relative flex w-full cursor-pointer flex-col items-start p-4 text-left transition hover:border-border hover:bg-accent/60",
                  cardShellClass,
                  isHighlighted(action) && highlightedCardClass,
                )}
              >
                <Kbd className="absolute top-3 right-3">{action.shortcut}</Kbd>
                <span className="flex items-center gap-2 pe-8">
                  {actionIcon(action)}
                  <span className="font-medium text-sm">{action.label}</span>
                </span>
                <span className="mt-1.5 text-muted-foreground text-xs leading-relaxed">
                  {action.description}
                </span>
              </button>
            ) : (
              <div
                key={action.label}
                className={cn(
                  "relative flex w-full flex-col items-start p-4 opacity-40",
                  cardShellClass,
                )}
              >
                <Kbd className="absolute top-3 right-3">{action.shortcut}</Kbd>
                <span className="flex items-center gap-2 pe-8">
                  {actionIcon(action)}
                  <span className="font-medium text-sm">{action.label}</span>
                </span>
                <span className="mt-1.5 text-muted-foreground text-xs leading-relaxed">
                  {action.disabledReason}
                </span>
              </div>
            ),
          )}
        </div>
      </div>
    </div>
  );
}

function surfaceTitle(
  surface: RightPanelSurface,
  sessions: Readonly<Record<string, PreviewSessionSnapshot>>,
  terminalLabelsById: ReadonlyMap<string, string>,
): string {
  switch (surface.kind) {
    case "diff":
      return "Diff";
    case "files":
      return "Files";
    case "file":
      return surface.relativePath.slice(surface.relativePath.lastIndexOf("/") + 1);
    case "terminal":
      return (
        terminalLabelsById.get(surface.activeTerminalId) ??
        getTerminalLabel(surface.activeTerminalId)
      );
    case "pull-request":
      return `#${surface.number}`;
    case "agents":
      return "Agents";
    case "preview": {
      const snapshot = surface.resourceId ? sessions[surface.resourceId] : null;
      if (!snapshot || snapshot.navStatus._tag === "Idle") return "Browser";
      if (snapshot.navStatus.title.trim().length > 0) return snapshot.navStatus.title;
      try {
        return new URL(snapshot.navStatus.url).host || "Browser";
      } catch {
        return "Browser";
      }
    }
  }
}

function PreviewFavicon({ capturedUrl, url }: { capturedUrl: string | null; url: string | null }) {
  const publicProviderUrl = faviconUrlForOrigin(url, 32);
  return (
    <FaviconImage
      sources={[capturedUrl, publicProviderUrl]}
      fallback={<Globe2 className="size-3 shrink-0" />}
      className="size-3 shrink-0 rounded-sm object-contain"
    />
  );
}

function sameOrigin(left: string, right: string): boolean {
  try {
    return new URL(left).origin === new URL(right).origin;
  } catch {
    return false;
  }
}

function SurfaceIcon({
  surface,
  sessions,
  desktopByTabId,
  theme,
  pullRequestStatuses,
}: {
  surface: RightPanelSurface;
  sessions: Readonly<Record<string, PreviewSessionSnapshot>>;
  desktopByTabId: Readonly<Record<string, DesktopPreviewOverlay>>;
  theme: "light" | "dark";
  pullRequestStatuses: Readonly<Record<string, PullRequestTabStatus>> | undefined;
}) {
  switch (surface.kind) {
    case "preview": {
      const snapshot = surface.resourceId ? sessions[surface.resourceId] : null;
      const url = !snapshot || snapshot.navStatus._tag === "Idle" ? null : snapshot.navStatus.url;
      const favicon = snapshot ? (desktopByTabId[snapshot.tabId]?.favicon ?? null) : null;
      const capturedUrl =
        favicon && url && sameOrigin(favicon.pageUrl, url) ? favicon.dataUrl : null;
      return <PreviewFavicon capturedUrl={capturedUrl} url={url} />;
    }
    case "diff":
      return <FileDiff className="size-3 shrink-0" />;
    case "files":
      return <Files className="size-3 shrink-0" />;
    case "file":
      return (
        <PierreEntryIcon
          pathValue={surface.relativePath}
          kind="file"
          theme={theme}
          className="size-3"
        />
      );
    case "terminal":
      return <TerminalSquare className="size-3 shrink-0" />;
    case "pull-request": {
      const status = pullRequestStatuses?.[surface.id] ?? null;
      const toneClassName =
        status?.state === "merged"
          ? "text-violet-600 dark:text-violet-300/90"
          : status?.state === "closed"
            ? "text-red-600 dark:text-red-300/90"
            : status?.isDraft
              ? "text-zinc-500 dark:text-zinc-400/80"
              : status?.state === "open"
                ? "text-emerald-600 dark:text-emerald-300/90"
                : "text-muted-foreground";
      return <GitPullRequest className={cn("size-3 shrink-0", toneClassName)} />;
    }
    case "agents":
      return <Bot className="size-3 shrink-0" />;
  }
}

function ThreadTabStatusDot({ status }: { readonly status: ThreadStatusPill }) {
  return (
    <span
      aria-label={status.label}
      className={cn("inline-flex size-2.5 shrink-0 items-center justify-center", status.colorClass)}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          status.dotClass,
          status.pulse && "animate-status-pulse",
        )}
      />
    </span>
  );
}

/** Render the shared tab strip used by tool panels and thread workspaces. */
export function RightPanelTabBar(props: RightPanelTabBarProps) {
  const ownsDesktopTitleBar = isElectron && props.titleBar === true;
  const reservesNativeControls = ownsDesktopTitleBar && props.layoutControls !== undefined;
  const { resolvedTheme } = useTheme();
  const tabListRef = useRef<HTMLDivElement>(null);
  const [tabDropPreview, setTabDropPreview] = useState<{
    readonly key: string;
    readonly position: "before" | "after" | "end";
  } | null>(null);

  const tabTargetKey = (target: WorkspaceTabContextTarget) =>
    target._tag === "Thread" ? "thread" : target.surface.id;
  const handleTabDragStart = (
    event: ReactDragEvent<HTMLElement>,
    target: WorkspaceTabContextTarget,
    label: string,
  ) => {
    if (!props.onTabDragStart) return;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", label);
    props.onTabDragStart(target);
  };
  const handleTabDragEnd = () => {
    setTabDropPreview(null);
    props.onTabDragEnd?.();
  };
  const handleTabDragOver = (
    event: ReactDragEvent<HTMLElement>,
    target: WorkspaceTabContextTarget,
  ) => {
    if (!props.onTabDrop) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    const bounds = event.currentTarget.getBoundingClientRect();
    const position = event.clientX < bounds.left + bounds.width / 2 ? "before" : "after";
    const key = tabTargetKey(target);
    setTabDropPreview((current) =>
      current?.key === key && current.position === position ? current : { key, position },
    );
  };
  const handleTabDrop = (event: ReactDragEvent<HTMLElement>, target: WorkspaceTabContextTarget) => {
    if (!props.onTabDrop) return;
    event.preventDefault();
    event.stopPropagation();
    const key = tabTargetKey(target);
    const position =
      tabDropPreview?.key === key && tabDropPreview.position !== "end"
        ? tabDropPreview.position
        : "after";
    setTabDropPreview(null);
    props.onTabDrop(target, position);
  };
  const handleTabDragLeave = (event: ReactDragEvent<HTMLElement>) => {
    const relatedTarget = event.relatedTarget;
    if (relatedTarget instanceof Node && event.currentTarget.contains(relatedTarget)) return;
    setTabDropPreview(null);
  };
  const handleTabBarDragOver = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!props.onTabDropAtEnd) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setTabDropPreview((current) =>
      current?.position === "end" ? current : { key: "end", position: "end" },
    );
  };
  const handleTabBarDrop = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!props.onTabDropAtEnd) return;
    event.preventDefault();
    setTabDropPreview(null);
    props.onTabDropAtEnd();
  };

  const handleTabContextMenu = useCallback(
    async (event: ReactMouseEvent, target: WorkspaceTabContextTarget) => {
      event.preventDefault();
      event.stopPropagation();

      const api = readLocalApi();
      if (!api) return;

      const surface = target._tag === "Surface" ? target.surface : null;
      const surfaceIndex = surface
        ? props.surfaces.findIndex((entry) => entry.id === surface.id)
        : -1;
      if (surface && surfaceIndex < 0) return;

      const items = buildWorkspaceTabContextMenuItems({
        target,
        surfaceCount: props.surfaces.length,
        surfaceIndex,
        adjacentGroups: props.adjacentGroups ?? NO_ADJACENT_EDITOR_GROUPS,
        moveToGroupAvailable: props.onMoveTabToPane !== undefined,
        copyToSplitAvailable:
          props.onSplitTab !== undefined && (props.canCopyTabToSplit?.(target) ?? true),
        moveToSplitAvailable:
          props.onMoveTabToSplit !== undefined && (props.canMoveTabToSplit?.(target) ?? true),
      });
      if (items.length === 0) return;

      const action = await api.contextMenu.show(items, { x: event.clientX, y: event.clientY });
      const splitAction = resolveWorkspaceTabSplitAction(action);
      if (splitAction?.mode === "copy") {
        props.onSplitTab?.(target, splitAction.direction);
        return;
      }
      if (splitAction?.mode === "move") {
        props.onMoveTabToSplit?.(target, splitAction.direction);
        return;
      }
      const layoutAction = resolveWorkspaceTabLayoutAction(action);
      if (layoutAction?._tag === "MoveToGroup") {
        props.onMoveTabToPane?.(target, layoutAction.direction);
        return;
      }
      switch (action) {
        case "copy-path":
          if (surface?.kind === "file") props.onCopyFilePath(surface.relativePath);
          break;
        case "close":
          if (surface) props.onCloseSurface(surface);
          break;
        case "close-others":
          if (surface) props.onCloseOtherSurfaces(surface);
          break;
        case "close-to-right":
          if (surface) props.onCloseSurfacesToRight(surface);
          break;
        case "close-all":
          props.onCloseAllSurfaces();
          break;
        case "move-group-up":
        case "move-group-down":
        case "move-group-left":
        case "move-group-right":
        case "split-right":
        case "split-down":
        case "split-and-move":
        case "move-up":
        case "move-down":
        case "move-left":
        case "move-right":
        case null:
          break;
      }
    },
    [props],
  );
  const handleTabMouseDown = useCallback((event: ReactMouseEvent) => {
    if (event.button !== 1) return;
    event.preventDefault();
  }, []);
  const handleTabAuxClick = useCallback(
    (event: ReactMouseEvent, surface: RightPanelSurface) => {
      if (event.button !== 1) return;
      event.preventDefault();
      event.stopPropagation();
      props.onCloseSurface(surface);
    },
    [props],
  );

  useEffect(() => {
    const activeTab = tabListRef.current?.querySelector<HTMLElement>("[data-active-tab='true']");
    activeTab?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [props.activeSurfaceId, props.threadTab?.active]);

  return (
    <div
      className={cn(
        "workspace-topbar relative z-[60] gap-1 pl-2",
        !props.titleBar && props.mode !== "sheet" && "[--workspace-topbar-height:--spacing(10)]",
        props.mode === "sheet" ? "pr-3" : "pr-2",
        reservesNativeControls && "wco:pr-[var(--workspace-native-controls-inset)]",
        props.sidebarTitleBarInset && COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS,
      )}
      data-right-panel-tabbar
    >
      <ScrollArea
        ref={tabListRef}
        hideScrollbars
        scrollFade
        className={cn("min-w-0 flex-1 rounded-none", ownsDesktopTitleBar && "drag-region")}
        data-right-panel-tab-list
      >
        <div
          className="flex h-full w-max min-w-full items-center gap-1"
          onDragLeave={handleTabDragLeave}
          onDragOver={handleTabBarDragOver}
          onDrop={handleTabBarDrop}
        >
          {props.threadTab ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    draggable={props.onTabDragStart !== undefined}
                    data-active-tab={props.threadTab.active}
                    data-editor-tab="thread"
                    aria-current={props.threadTab.active ? "page" : undefined}
                    onClick={props.threadTab.onActivate}
                    onDragEnd={handleTabDragEnd}
                    onDragLeave={handleTabDragLeave}
                    onDragOver={(event) => handleTabDragOver(event, { _tag: "Thread" })}
                    onDragStart={(event) =>
                      handleTabDragStart(
                        event,
                        { _tag: "Thread" },
                        props.threadTab?.title ?? "Thread",
                      )
                    }
                    onDrop={(event) => handleTabDrop(event, { _tag: "Thread" })}
                    onContextMenu={(event) => void handleTabContextMenu(event, { _tag: "Thread" })}
                    className={cn(
                      "cursor-pointer relative flex h-6 max-w-48 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs",
                      tabDropPreview?.key === "thread" &&
                        tabDropPreview.position === "before" &&
                        "before:absolute before:inset-y-0.5 before:-left-1 before:w-0.5 before:rounded-full before:bg-primary",
                      tabDropPreview?.key === "thread" &&
                        tabDropPreview.position === "after" &&
                        "after:absolute after:inset-y-0.5 after:-right-1 after:w-0.5 after:rounded-full after:bg-primary",
                      props.threadTab.active
                        ? "bg-accent text-foreground"
                        : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                    )}
                  >
                    <MessageSquareText className="size-3 shrink-0" />
                    {props.threadTab.status ? (
                      <ThreadTabStatusDot status={props.threadTab.status} />
                    ) : null}
                    <span className="truncate">{props.threadTab.title}</span>
                  </button>
                }
              />
              <TooltipPopup>
                {props.threadTab.status
                  ? `${props.threadTab.title} · ${props.threadTab.status.label}`
                  : props.threadTab.title}
              </TooltipPopup>
            </Tooltip>
          ) : null}
          {props.surfaces.map((surface) => {
            const active = surface.id === props.activeSurfaceId;
            const pending = props.pendingSurfaceIds.has(surface.id);
            const title = surfaceTitle(surface, props.previewSessions, props.terminalLabelsById);
            return (
              <div
                key={surface.id}
                draggable={props.onTabDragStart !== undefined}
                data-active-tab={active}
                data-editor-tab={surface.id}
                onDragEnd={handleTabDragEnd}
                onDragLeave={handleTabDragLeave}
                onDragOver={(event) => handleTabDragOver(event, { _tag: "Surface", surface })}
                onDragStart={(event) =>
                  handleTabDragStart(event, { _tag: "Surface", surface }, title)
                }
                onDrop={(event) => handleTabDrop(event, { _tag: "Surface", surface })}
                onMouseDown={handleTabMouseDown}
                onAuxClick={(event) => handleTabAuxClick(event, surface)}
                onContextMenu={(event) =>
                  void handleTabContextMenu(event, { _tag: "Surface", surface })
                }
                className={cn(
                  "cursor-pointer group/tab relative flex h-6 max-w-36 shrink-0 items-center gap-0.5 rounded-md pr-2 pl-1.5 text-xs",
                  tabDropPreview?.key === surface.id &&
                    tabDropPreview.position === "before" &&
                    "before:absolute before:inset-y-0.5 before:-left-1 before:w-0.5 before:rounded-full before:bg-primary",
                  tabDropPreview?.key === surface.id &&
                    tabDropPreview.position === "after" &&
                    "after:absolute after:inset-y-0.5 after:-right-1 after:w-0.5 after:rounded-full after:bg-primary",
                  active
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                )}
              >
                <button
                  type="button"
                  className="cursor-pointer group/close relative flex size-4 shrink-0 items-center justify-center rounded-sm hover:bg-muted"
                  aria-label={`Close ${title}`}
                  onClick={() => props.onCloseSurface(surface)}
                >
                  <span className="relative flex size-3 items-center justify-center group-hover/tab:hidden group-focus-visible/close:hidden">
                    <SurfaceIcon
                      surface={surface}
                      sessions={props.previewSessions}
                      desktopByTabId={props.desktopByTabId}
                      theme={resolvedTheme}
                      pullRequestStatuses={props.pullRequestStatuses}
                    />
                    {pending ? (
                      <span
                        className="absolute -right-0.5 -bottom-0.5 size-1.5 rounded-full bg-current"
                        aria-hidden
                      />
                    ) : null}
                  </span>
                  <X className="hidden size-3 group-hover/tab:block group-focus-visible/close:block" />
                </button>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <button
                        type="button"
                        className="cursor-pointer flex min-w-0 items-center"
                        onClick={() => props.onActivate(surface)}
                      >
                        <span className="truncate">{title}</span>
                      </button>
                    }
                  />
                  <TooltipPopup>{title}</TooltipPopup>
                </Tooltip>
              </div>
            );
          })}
          {tabDropPreview?.position === "end" ? (
            <span className="h-5 w-0.5 shrink-0 rounded-full bg-primary" aria-hidden />
          ) : null}
          {props.surfaces.length > 0 || props.threadTab ? (
            <Menu>
              <MenuTrigger
                className="cursor-pointer relative inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label="Add panel surface"
              >
                <Plus className="size-3.5" />
              </MenuTrigger>
              <MenuPopup align="start" side="bottom" sideOffset={6} className="min-w-44">
                <SurfaceMenuItem
                  available={props.browserAvailable}
                  disabledReason={SURFACE_DISABLED_REASONS.browser}
                  onClick={props.onAddBrowser}
                >
                  <Globe2 />
                  Browser
                </SurfaceMenuItem>
                <SurfaceMenuItem
                  available={props.terminalAvailable}
                  disabledReason={SURFACE_DISABLED_REASONS.terminal}
                  onClick={props.onAddTerminal}
                >
                  <TerminalSquare />
                  Terminal
                </SurfaceMenuItem>
                <SurfaceMenuItem
                  available={props.filesAvailable}
                  disabledReason={SURFACE_DISABLED_REASONS.files}
                  onClick={props.onAddFiles}
                >
                  <Files />
                  Files
                </SurfaceMenuItem>
                <SurfaceMenuItem
                  available={props.diffAvailable}
                  disabledReason={SURFACE_DISABLED_REASONS.diff}
                  onClick={props.onAddDiff}
                >
                  <FileDiff />
                  Diff
                </SurfaceMenuItem>
                <SurfaceMenuItem
                  available={props.pullRequestAvailable}
                  disabledReason={SURFACE_DISABLED_REASONS.pullRequest}
                  onClick={props.onAddPullRequest}
                >
                  <GitPullRequest />
                  Pull request
                </SurfaceMenuItem>
                <SurfaceMenuItem
                  available={props.agentsAvailable}
                  disabledReason={SURFACE_DISABLED_REASONS.agents}
                  onClick={props.onAddAgents}
                >
                  <Bot />
                  Agents
                </SurfaceMenuItem>
              </MenuPopup>
            </Menu>
          ) : null}
        </div>
      </ScrollArea>
      {props.focusView || props.layoutControls || props.onCloseGroup ? (
        <div className="flex h-full shrink-0 items-center gap-1 [-webkit-app-region:no-drag]">
          {props.focusView ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    aria-label={props.focusView.active ? "Restore workspace layout" : "Focus pane"}
                    aria-pressed={props.focusView.active}
                    onClick={props.focusView.onToggle}
                    className="text-foreground [--control-icon-color:currentColor] transition-[color,background-color,scale] duration-150 active:scale-[0.96]"
                    variant="ghost"
                    size="icon-sm"
                  >
                    {props.focusView.active ? (
                      <Minimize2 className="size-3.5" />
                    ) : (
                      <Maximize2 className="size-3.5" />
                    )}
                  </Button>
                }
              />
              <TooltipPopup>
                {props.focusView.active ? "Restore workspace layout" : "Focus pane"}
                {props.focusView.shortcutLabel ? ` (${props.focusView.shortcutLabel})` : ""}
              </TooltipPopup>
            </Tooltip>
          ) : null}
          {props.layoutControls}
          {props.onCloseGroup ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    aria-label="Close pane"
                    onClick={props.onCloseGroup}
                    className="text-foreground [--control-icon-color:currentColor] transition-[color,background-color,scale] duration-150 active:scale-[0.96]"
                    variant="ghost"
                    size="icon-sm"
                  >
                    <X className="size-3.5" />
                  </Button>
                }
              />
              <TooltipPopup>Close pane</TooltipPopup>
            </Tooltip>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Render the right-panel shell, shared tab strip, and active surface. */
export function RightPanelTabs(props: RightPanelTabsProps) {
  const { children, ...tabBarProps } = props;
  return (
    <PreviewPanelShell
      mode={props.mode}
      {...(props.maximized !== undefined ? { maximized: props.maximized } : {})}
      {...(props.widthStorageKey !== undefined ? { widthStorageKey: props.widthStorageKey } : {})}
      {...(props.defaultWidth !== undefined ? { defaultWidth: props.defaultWidth } : {})}
    >
      <RightPanelTabBar {...tabBarProps} />
      <div className="flex min-h-0 flex-1 flex-col" data-right-panel-surface-content>
        {props.activeSurfaceId === null ? (
          <RightPanelEmptyState
            onAddBrowser={props.onAddBrowser}
            onAddTerminal={props.onAddTerminal}
            onAddDiff={props.onAddDiff}
            onAddFiles={props.onAddFiles}
            onAddPullRequest={props.onAddPullRequest}
            onAddAgents={props.onAddAgents}
            browserAvailable={props.browserAvailable}
            terminalAvailable={props.terminalAvailable}
            diffAvailable={props.diffAvailable}
            filesAvailable={props.filesAvailable}
            pullRequestAvailable={props.pullRequestAvailable}
            agentsAvailable={props.agentsAvailable}
            liveAgentCount={props.liveAgentCount}
          />
        ) : (
          children
        )}
      </div>
    </PreviewPanelShell>
  );
}
