import type { PreviewSessionSnapshot } from "@t3tools/contracts";
import { getTerminalLabel } from "@t3tools/shared/terminalLabels";
import {
  Bot,
  FileDiff,
  Files,
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
  type MouseEvent as ReactMouseEvent,
  type ReactElement,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { isElectron } from "~/env";
import type { AdjacentEditorGroups, EditorSplitDirection } from "~/editorWorkspace";
import type { RightPanelSurface } from "~/rightPanelStore";
import { cn } from "~/lib/utils";
import { readLocalApi } from "~/localApi";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { Button } from "~/components/ui/button";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "~/components/ui/menu";
import { ScrollArea } from "~/components/ui/scroll-area";
import { faviconUrlForOrigin } from "~/lib/favicon";
import { useTheme } from "~/hooks/useTheme";
import { COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS } from "~/workspaceTitlebar";

import { PreviewPanelShell, type PreviewPanelMode } from "./preview/PreviewPanelShell";
import { PierreEntryIcon } from "./chat/PierreEntryIcon";
import type { ThreadStatusPill } from "./Sidebar.logic";
import {
  buildEditorTabContextMenuItems,
  type EditorTabContextTarget,
  resolveEditorTabLayoutAction,
  resolveEditorTabSplitAction,
} from "./RightPanelTabs.logic";

interface RightPanelTabsProps {
  mode: PreviewPanelMode;
  titleBar?: boolean;
  sidebarTitleBarInset?: boolean;
  layoutControls?: ReactNode;
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
  terminalLabelsById: ReadonlyMap<string, string>;
  onActivate: (surface: RightPanelSurface) => void;
  onCloseSurface: (surface: RightPanelSurface) => void;
  onCloseOtherSurfaces: (surface: RightPanelSurface) => void;
  onCloseSurfacesToRight: (surface: RightPanelSurface) => void;
  onCloseAllSurfaces: () => void;
  onSplitTab?: (target: EditorTabContextTarget, direction: EditorSplitDirection) => void;
  onMoveTabToSplit?: (target: EditorTabContextTarget, direction: EditorSplitDirection) => void;
  onMoveTabToGroup?: (target: EditorTabContextTarget, direction: EditorSplitDirection) => void;
  onTabDragStart?: (target: EditorTabContextTarget) => void;
  onTabDragEnd?: () => void;
  onTabDrop?: (target: EditorTabContextTarget, position: "before" | "after") => void;
  onTabDropAtEnd?: () => void;
  adjacentGroups?: AdjacentEditorGroups;
  canCopyTabToSplit?: (target: EditorTabContextTarget) => boolean;
  canMoveTabToSplit?: (target: EditorTabContextTarget) => boolean;
  onCopyFilePath: (relativePath: string) => void;
  onAddBrowser: () => void;
  onAddTerminal: () => void;
  onAddDiff: () => void;
  onAddFiles: () => void;
  onAddAgents: () => void;
  browserAvailable: boolean;
  diffAvailable: boolean;
  filesAvailable: boolean;
  /** Running + waiting subagents; badges the Agents card in the empty state. */
  liveAgentCount: number;
  children: ReactNode;
}

type RightPanelTabBarProps = Omit<RightPanelTabsProps, "children">;

const SURFACE_DISABLED_REASONS = {
  browser: "Browser previews are only available in the T3 Code desktop app.",
  files: "Files are only available when a project is open.",
  diff: "Diff is only available for server threads in Git repositories.",
} as const;

const NO_ADJACENT_EDITOR_GROUPS: AdjacentEditorGroups = {
  up: null,
  down: null,
  left: null,
  right: null,
};

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

export function RightPanelEmptyState(props: {
  onAddBrowser: () => void;
  onAddTerminal: () => void;
  onAddDiff: () => void;
  onAddFiles: () => void;
  onAddAgents: () => void;
  browserAvailable: boolean;
  diffAvailable: boolean;
  filesAvailable: boolean;
  liveAgentCount: number;
}) {
  const actions = [
    {
      label: "Browser",
      description: "Open a local app or URL.",
      icon: Globe2,
      available: props.browserAvailable,
      disabledReason: SURFACE_DISABLED_REASONS.browser,
      onClick: props.onAddBrowser,
      badgeCount: 0,
    },
    {
      label: "Terminal",
      description: "Start a shell in this workspace.",
      icon: TerminalSquare,
      available: true,
      disabledReason: null,
      onClick: props.onAddTerminal,
      badgeCount: 0,
    },
    {
      label: "Files",
      description: "Browse and read workspace files.",
      icon: Files,
      available: props.filesAvailable,
      disabledReason: SURFACE_DISABLED_REASONS.files,
      onClick: props.onAddFiles,
      badgeCount: 0,
    },
    {
      label: "Diff",
      description: "Review changes in this thread.",
      icon: FileDiff,
      available: props.diffAvailable,
      disabledReason: SURFACE_DISABLED_REASONS.diff,
      onClick: props.onAddDiff,
      badgeCount: 0,
    },
    {
      label: "Agents",
      description: "Watch subagents and workflows run.",
      icon: Bot,
      available: true,
      disabledReason: null,
      onClick: props.onAddAgents,
      badgeCount: props.liveAgentCount,
    },
  ] as const;

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-6">
      <div className="w-full max-w-xl">
        <div className="mb-5 text-center">
          <h3 className="text-sm font-medium text-foreground">Open a surface</h3>
          <p className="mt-1 text-xs text-muted-foreground">Choose what to open here.</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {actions.map((action) => {
            const Icon = action.icon;
            const content = (
              <>
                <span className="relative mb-3 inline-flex">
                  <Icon className="size-5" />
                  {action.badgeCount > 0 ? (
                    <span
                      aria-hidden
                      className="absolute -top-1.5 -right-2 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-info px-1 text-[9px] font-semibold tabular-nums text-white"
                    >
                      {action.badgeCount}
                    </span>
                  ) : null}
                </span>
                <span className="text-sm font-medium">{action.label}</span>
                <span className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {action.description}
                </span>
              </>
            );
            if (action.available) {
              return (
                <button
                  key={action.label}
                  type="button"
                  onClick={action.onClick}
                  className="cursor-pointer flex min-h-28 w-full flex-col items-start rounded-lg border border-border/80 bg-card p-4 text-left transition-[background-color,border-color] hover:border-border hover:bg-accent/60 dark:border-transparent dark:shadow-none dark:inset-ring-1 dark:inset-ring-white/5"
                >
                  {content}
                </button>
              );
            }
            const disabledCard = (
              <button
                type="button"
                className="flex min-h-28 w-full cursor-not-allowed flex-col items-start rounded-lg border border-border/80 bg-card p-4 text-left opacity-40 dark:border-transparent dark:shadow-none dark:inset-ring-1 dark:inset-ring-white/5"
                aria-disabled="true"
              >
                {content}
              </button>
            );
            return (
              <DisabledReasonTooltip
                key={action.label}
                reason={action.disabledReason}
                trigger={disabledCard}
              />
            );
          })}
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

function PreviewFavicon({ url }: { url: string | null }) {
  const faviconUrl = faviconUrlForOrigin(url, 32);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (!faviconUrl || failedUrl === faviconUrl) return <Globe2 className="size-3 shrink-0" />;
  return (
    <img
      src={faviconUrl}
      alt=""
      aria-hidden
      draggable={false}
      className="size-3 shrink-0 rounded-sm"
      onError={() => setFailedUrl(faviconUrl)}
    />
  );
}

function SurfaceIcon({
  surface,
  sessions,
  theme,
}: {
  surface: RightPanelSurface;
  sessions: Readonly<Record<string, PreviewSessionSnapshot>>;
  theme: "light" | "dark";
}) {
  switch (surface.kind) {
    case "preview": {
      const snapshot = surface.resourceId ? sessions[surface.resourceId] : null;
      const url = !snapshot || snapshot.navStatus._tag === "Idle" ? null : snapshot.navStatus.url;
      return <PreviewFavicon url={url} />;
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

  const tabTargetKey = (target: EditorTabContextTarget) =>
    target._tag === "Thread" ? "thread" : target.surface.id;
  const handleTabDragStart = (
    event: ReactDragEvent<HTMLElement>,
    target: EditorTabContextTarget,
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
    target: EditorTabContextTarget,
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
  const handleTabDrop = (event: ReactDragEvent<HTMLElement>, target: EditorTabContextTarget) => {
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
    async (event: ReactMouseEvent, target: EditorTabContextTarget) => {
      event.preventDefault();
      event.stopPropagation();

      const api = readLocalApi();
      if (!api) return;

      const surface = target._tag === "Surface" ? target.surface : null;
      const surfaceIndex = surface
        ? props.surfaces.findIndex((entry) => entry.id === surface.id)
        : -1;
      if (surface && surfaceIndex < 0) return;

      const items = buildEditorTabContextMenuItems({
        target,
        surfaceCount: props.surfaces.length,
        surfaceIndex,
        adjacentGroups: props.adjacentGroups ?? NO_ADJACENT_EDITOR_GROUPS,
        moveToGroupAvailable: props.onMoveTabToGroup !== undefined,
        copyToSplitAvailable:
          props.onSplitTab !== undefined && (props.canCopyTabToSplit?.(target) ?? true),
        moveToSplitAvailable:
          props.onMoveTabToSplit !== undefined && (props.canMoveTabToSplit?.(target) ?? true),
      });
      if (items.length === 0) return;

      const action = await api.contextMenu.show(items, { x: event.clientX, y: event.clientY });
      const splitAction = resolveEditorTabSplitAction(action);
      if (splitAction?.mode === "copy") {
        props.onSplitTab?.(target, splitAction.direction);
        return;
      }
      if (splitAction?.mode === "move") {
        props.onMoveTabToSplit?.(target, splitAction.direction);
        return;
      }
      const layoutAction = resolveEditorTabLayoutAction(action);
      if (layoutAction?._tag === "MoveToGroup") {
        props.onMoveTabToGroup?.(target, layoutAction.direction);
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
        !props.titleBar && "[--workspace-topbar-height:--spacing(11)]",
        "pr-2",
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
                      theme={resolvedTheme}
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
                <SurfaceMenuItem available onClick={props.onAddTerminal}>
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
                <SurfaceMenuItem available onClick={props.onAddAgents}>
                  <Bot />
                  Agents
                </SurfaceMenuItem>
              </MenuPopup>
            </Menu>
          ) : null}
        </div>
      </ScrollArea>
      {props.focusView || props.layoutControls ? (
        <div className="flex h-full shrink-0 items-center gap-1 [-webkit-app-region:no-drag]">
          {props.focusView ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    aria-label={
                      props.focusView.active ? "Restore editor layout" : "Focus editor group"
                    }
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
                {props.focusView.active ? "Restore editor layout" : "Focus editor group"}
                {props.focusView.shortcutLabel ? ` (${props.focusView.shortcutLabel})` : ""}
              </TooltipPopup>
            </Tooltip>
          ) : null}
          {props.layoutControls}
        </div>
      ) : null}
    </div>
  );
}

/** Render the right-panel shell, shared tab strip, and active surface. */
export function RightPanelTabs(props: RightPanelTabsProps) {
  const { children, ...tabBarProps } = props;
  return (
    <PreviewPanelShell mode={props.mode}>
      <RightPanelTabBar {...tabBarProps} />
      <div className="flex min-h-0 flex-1 flex-col" data-right-panel-surface-content>
        {props.activeSurfaceId === null ? (
          <RightPanelEmptyState
            onAddBrowser={props.onAddBrowser}
            onAddTerminal={props.onAddTerminal}
            onAddDiff={props.onAddDiff}
            onAddFiles={props.onAddFiles}
            onAddAgents={props.onAddAgents}
            browserAvailable={props.browserAvailable}
            diffAvailable={props.diffAvailable}
            filesAvailable={props.filesAvailable}
            liveAgentCount={props.liveAgentCount}
          />
        ) : (
          children
        )}
      </div>
    </PreviewPanelShell>
  );
}
