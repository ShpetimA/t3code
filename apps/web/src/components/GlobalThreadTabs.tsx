import { useAtomValue } from "@effect/atom-react";
import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import {
  BotIcon,
  CircleDashedIcon,
  GitBranchIcon,
  PanelsTopLeftIcon,
  PlusIcon,
  ServerIcon,
  XIcon,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type DragEvent as ReactDragEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";

import { openCommandPalette } from "../commandPaletteBus";
import { useComposerDraftStore } from "../composerDraftStore";
import {
  globalThreadTabKey,
  type GlobalThreadTab,
  type GlobalThreadTabNavigation,
} from "../globalThreadTabs";
import {
  transitionGlobalThreadTabsStore,
  useGlobalThreadTabsStore,
} from "../globalThreadTabsStore";
import {
  resolveShortcutCommand,
  threadJumpIndexFromCommand,
  threadTraversalDirectionFromCommand,
} from "../keybindings";
import { isTerminalFocused } from "../lib/terminalFocus";
import { isModelPickerOpen } from "../modelPickerVisibility";
import {
  useAllEnvironmentShellsBootstrapped,
  useProjects,
  useThreadShells,
} from "../state/entities";
import { useEnvironments } from "../state/environments";
import { primaryServerKeybindingsAtom } from "../state/server";
import { buildDraftThreadRouteParams, buildThreadRouteParams } from "../threadRoutes";
import { selectThreadWorkspaceOrDefault, useThreadWorkspaceStore } from "../threadWorkspaceStore";
import { cn } from "../lib/utils";
import { useUiStateStore } from "../uiStateStore";
import { ProjectFavicon } from "./ProjectFavicon";
import {
  resolveAdjacentThreadId,
  resolveThreadStatusPill,
  type ThreadStatusPill,
} from "./Sidebar.logic";
import { ScrollArea } from "./ui/scroll-area";
import { Tooltip, TooltipPopup, TooltipProvider, TooltipTrigger } from "./ui/tooltip";

interface GlobalThreadTabsProps {
  readonly activeTab: GlobalThreadTab;
}

function navigateToGlobalThreadTab(
  navigate: ReturnType<typeof useNavigate>,
  tab: GlobalThreadTab,
): void {
  if (tab._tag === "ServerThread") {
    void navigate({
      to: "/$environmentId/$threadId",
      params: buildThreadRouteParams(tab.threadRef),
    });
    return;
  }
  void navigate({
    to: "/draft/$draftId",
    params: buildDraftThreadRouteParams(tab.draftId),
  });
}

function applyTabNavigation(
  navigate: ReturnType<typeof useNavigate>,
  navigation: GlobalThreadTabNavigation,
): void {
  switch (navigation._tag) {
    case "KeepCurrent":
      return;
    case "Activate":
      navigateToGlobalThreadTab(navigate, navigation.tab);
      return;
    case "OpenLanding":
      void navigate({ to: "/" });
      return;
  }
}

function threadTabStatusGlyph(label: ThreadStatusPill["label"]): string {
  switch (label) {
    case "Connecting":
      return ">_";
    case "Monitoring":
      return "~";
    case "Pending Approval":
      return "!";
    case "Awaiting Input":
      return "?";
    case "Failed":
      return "×";
    case "Plan Ready":
      return "≡";
    case "Completed":
      return "✓";
    case "Working":
      return "";
  }
}

function ThreadTabStatusMark({
  status,
  decorative = false,
}: {
  readonly status: ThreadStatusPill;
  readonly decorative?: boolean;
}) {
  return (
    <span
      aria-hidden={decorative ? true : undefined}
      aria-label={decorative ? undefined : status.label}
      className={cn(
        "inline-flex size-3 shrink-0 items-center justify-center font-mono text-[10px] leading-none font-semibold",
        status.colorClass,
        status.pulse && "animate-status-pulse motion-reduce:animate-none",
      )}
      role={decorative ? undefined : "img"}
    >
      {status.label === "Working" ? (
        <CircleDashedIcon className="size-3" />
      ) : (
        threadTabStatusGlyph(status.label)
      )}
    </span>
  );
}

/** Desktop titlebar that navigates among explicitly opened threads. */
export function GlobalThreadTabs({ activeTab }: GlobalThreadTabsProps) {
  const navigate = useNavigate();
  const tabs = useGlobalThreadTabsStore((state) => state.tabs);
  const activeTabKey = globalThreadTabKey(activeTab);
  const threadShells = useThreadShells();
  const allShellsBootstrapped = useAllEnvironmentShellsBootstrapped();
  const projects = useProjects();
  const { environments } = useEnvironments();
  const draftSessions = useComposerDraftStore((state) => state.draftThreadsByThreadKey);
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  const lastVisitedAtByThreadKey = useUiStateStore((state) => state.threadLastVisitedAtById);
  const tabListRef = useRef<HTMLDivElement | null>(null);
  const draggedTabKeyRef = useRef<string | null>(null);
  const activeThreadRef: ScopedThreadRef = activeTab.threadRef;
  const routeTerminalOpen = useThreadWorkspaceStore(
    (state) => selectThreadWorkspaceOrDefault(state.byThreadKey, activeThreadRef).bottomPanelOpen,
  );

  const threadShellByKey = useMemo(
    () =>
      new Map(
        threadShells.map((thread) => [
          scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)),
          thread,
        ]),
      ),
    [threadShells],
  );
  const projectByKey = useMemo(
    () => new Map(projects.map((project) => [`${project.environmentId}:${project.id}`, project])),
    [projects],
  );
  const environmentLabelById = useMemo(
    () =>
      new Map(
        environments.map((environment) => [environment.environmentId, environment.label] as const),
      ),
    [environments],
  );
  useLayoutEffect(() => {
    transitionGlobalThreadTabsStore({ _tag: "Open", tab: activeTab });
  }, [activeTab]);

  useEffect(() => {
    if (!allShellsBootstrapped) return;
    const validTabKeys = [
      ...threadShells.flatMap((thread) =>
        thread.archivedAt === null
          ? [scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id))]
          : [],
      ),
      ...Object.values(draftSessions).map((session) =>
        scopedThreadKey(scopeThreadRef(session.environmentId, session.threadId)),
      ),
    ];
    const result = transitionGlobalThreadTabsStore({
      _tag: "Reconcile",
      validTabKeys,
      activeTabKey,
    });
    applyTabNavigation(navigate, result.navigation);
  }, [activeTabKey, allShellsBootstrapped, draftSessions, navigate, threadShells]);

  useEffect(() => {
    const activeElement = tabListRef.current?.querySelector<HTMLElement>("[data-active-tab=true]");
    activeElement?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeTabKey, tabs.length]);

  const closeTab = useCallback(
    (tabKey: string) => {
      const result = transitionGlobalThreadTabsStore({
        _tag: "Close",
        tabKey,
        activeTabKey,
      });
      applyTabNavigation(navigate, result.navigation);
    },
    [activeTabKey, navigate],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat) return;
      const command = resolveShortcutCommand(event, keybindings, {
        platform: navigator.platform,
        context: {
          terminalFocus: isTerminalFocused(),
          terminalOpen: routeTerminalOpen,
          modelPickerOpen: isModelPickerOpen(),
        },
      });
      const traversalDirection = threadTraversalDirectionFromCommand(command);
      const jumpIndex = threadJumpIndexFromCommand(command ?? "");
      let targetKey: string | null = null;
      if (traversalDirection !== null) {
        targetKey = resolveAdjacentThreadId({
          threadIds: tabs.map(globalThreadTabKey),
          currentThreadId: activeTabKey,
          direction: traversalDirection,
        });
      } else if (jumpIndex !== null) {
        const target = tabs[jumpIndex];
        targetKey = target ? globalThreadTabKey(target) : null;
      }
      if (targetKey === null) return;
      const target = tabs.find((tab) => globalThreadTabKey(tab) === targetKey);
      if (!target) return;
      event.preventDefault();
      event.stopPropagation();
      navigateToGlobalThreadTab(navigate, target);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeTabKey, keybindings, navigate, routeTerminalOpen, tabs]);

  const handleTabDrop = useCallback((event: ReactDragEvent, targetIndex: number) => {
    event.preventDefault();
    const tabKey = draggedTabKeyRef.current;
    draggedTabKeyRef.current = null;
    if (tabKey === null) return;
    transitionGlobalThreadTabsStore({ _tag: "Reorder", tabKey, targetIndex });
  }, []);
  return (
    <header
      className="workspace-topbar drag-region relative z-[70] gap-0.5 border-b border-border/60 bg-background pl-[var(--workspace-controls-left)] pr-2 wco:pr-[var(--workspace-native-controls-inset)]"
      data-global-thread-tabs=""
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-[background-color,color] duration-150 ease-out hover:bg-accent hover:text-foreground"
              aria-label="Open command center"
              onClick={() => openCommandPalette()}
            >
              <PanelsTopLeftIcon className="size-3.5" />
            </button>
          }
        />
        <TooltipPopup side="bottom">Command center</TooltipPopup>
      </Tooltip>
      <TooltipProvider delay={60} closeDelay={0} timeout={300}>
        <ScrollArea
          ref={tabListRef}
          hideScrollbars
          scrollFade
          className="min-w-0 flex-1 rounded-none"
        >
          <div className="flex h-full w-max min-w-full items-center gap-0.5">
            {tabs.map((tab, index) => {
              const tabKey = globalThreadTabKey(tab);
              const active = tabKey === activeTabKey;
              const shell = threadShellByKey.get(tabKey);
              const draftSession = tab._tag === "DraftThread" ? draftSessions[tab.draftId] : null;
              const projectId = shell?.projectId ?? draftSession?.projectId;
              const project = projectId
                ? projectByKey.get(`${tab.threadRef.environmentId}:${projectId}`)
                : undefined;
              const title = shell?.title ?? (tab._tag === "DraftThread" ? "New session" : "Thread");
              const status = shell
                ? resolveThreadStatusPill({
                    thread: {
                      ...shell,
                      lastVisitedAt: lastVisitedAtByThreadKey[tabKey],
                    },
                  })
                : null;
              const environmentLabel =
                environmentLabelById.get(tab.threadRef.environmentId) ?? null;
              const branch = shell?.branch ?? draftSession?.branch ?? null;
              const modelLabel = shell?.modelSelection.model ?? null;
              return (
                <Tooltip key={tabKey}>
                  <TooltipTrigger
                    render={
                      <div
                        draggable
                        data-active-tab={active}
                        className={cn(
                          "group/tab relative flex h-7 max-w-44 shrink-0 items-center rounded-md pl-1.5 text-xs transition-[background-color,color] duration-150 ease-out",
                          active
                            ? "bg-accent text-foreground shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--border)_65%,transparent)]"
                            : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                        )}
                        onDragStart={() => {
                          draggedTabKeyRef.current = tabKey;
                        }}
                        onDragEnd={() => {
                          draggedTabKeyRef.current = null;
                        }}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => handleTabDrop(event, index)}
                        onMouseDown={(event: ReactMouseEvent) => {
                          if (event.button === 1) event.preventDefault();
                        }}
                        onAuxClick={(event: ReactMouseEvent) => {
                          if (event.button !== 1) return;
                          event.preventDefault();
                          closeTab(tabKey);
                        }}
                      >
                        <button
                          type="button"
                          className="flex h-full min-w-0 flex-1 items-center gap-1.5 pr-6"
                          aria-current={active ? "page" : undefined}
                          onClick={() => navigateToGlobalThreadTab(navigate, tab)}
                        >
                          {project ? (
                            <ProjectFavicon
                              environmentId={project.environmentId}
                              cwd={project.workspaceRoot}
                              projectName={project.title}
                              faviconPath={project.faviconPath}
                              className="size-4"
                            />
                          ) : null}
                          {status ? <ThreadTabStatusMark status={status} /> : null}
                          <span className="truncate">{title}</span>
                        </button>
                        <button
                          type="button"
                          className={cn(
                            "absolute right-0.5 flex size-6 shrink-0 items-center justify-center rounded-sm text-foreground transition-[background-color,opacity] duration-150 ease-out hover:bg-muted",
                            active
                              ? "opacity-100"
                              : "pointer-events-none opacity-0 group-hover/tab:pointer-events-auto group-hover/tab:opacity-100 group-focus-within/tab:pointer-events-auto group-focus-within/tab:opacity-100",
                          )}
                          aria-label={`Close ${title}`}
                          onClick={() => closeTab(tabKey)}
                        >
                          <XIcon className="size-3" />
                        </button>
                      </div>
                    }
                  />
                  <TooltipPopup
                    side="bottom"
                    align="start"
                    sideOffset={2}
                    variant="glass"
                    className="w-72 max-w-[calc(100vw-1rem)] text-left whitespace-normal [&_[data-slot=tooltip-viewport]]:p-0"
                  >
                    <div className="flex min-w-0 flex-col gap-2 p-[var(--floating-content-inset)]">
                      <div className="truncate text-xs leading-none font-medium text-foreground">
                        {title}
                      </div>
                      <div className="grid gap-1.5 pl-0.5 text-xs text-muted-foreground">
                        {project ? (
                          <div className="flex min-w-0 items-center gap-2">
                            <ProjectFavicon
                              environmentId={project.environmentId}
                              cwd={project.workspaceRoot}
                              projectName={project.title}
                              faviconPath={project.faviconPath}
                              className="size-3 shrink-0 stroke-muted-foreground"
                            />
                            <div className="min-w-0 truncate text-foreground/75">
                              {project.title}
                            </div>
                          </div>
                        ) : null}
                        {environmentLabel ? (
                          <div className="flex min-w-0 items-center gap-2">
                            <ServerIcon className="size-3 shrink-0 stroke-muted-foreground" />
                            <div className="min-w-0 truncate text-foreground/75">
                              {environmentLabel}
                            </div>
                          </div>
                        ) : null}
                        {branch ? (
                          <div className="flex min-w-0 items-center gap-2">
                            <GitBranchIcon className="size-3 shrink-0 stroke-muted-foreground" />
                            <div className="min-w-0 truncate text-foreground/75">{branch}</div>
                          </div>
                        ) : null}
                        {modelLabel ? (
                          <div className="flex min-w-0 items-center gap-2">
                            <BotIcon className="size-3 shrink-0 stroke-muted-foreground" />
                            <div className="min-w-0 truncate text-foreground/75">{modelLabel}</div>
                          </div>
                        ) : null}
                        {status ? (
                          <div className="flex min-w-0 items-center gap-2">
                            <ThreadTabStatusMark status={status} decorative />
                            <div className={cn("min-w-0 truncate", status.colorClass)}>
                              {status.label}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </TooltipPopup>
                </Tooltip>
              );
            })}
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-[background-color,color] duration-150 ease-out hover:bg-accent hover:text-foreground"
                    aria-label="New thread"
                    onClick={() => openCommandPalette({ open: "new-thread-in" })}
                  >
                    <PlusIcon className="size-3.5" />
                  </button>
                }
              />
              <TooltipPopup side="bottom">New thread</TooltipPopup>
            </Tooltip>
          </div>
        </ScrollArea>
      </TooltipProvider>
    </header>
  );
}
