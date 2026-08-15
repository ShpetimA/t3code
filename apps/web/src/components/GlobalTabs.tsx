import { useAtomValue } from "@effect/atom-react";
import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { ResolvedKeybindingsConfig, ScopedThreadRef } from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import {
  BotIcon,
  ChartNoAxesColumnIcon,
  CheckIcon,
  CircleCheckIcon,
  GitBranchIcon,
  GitPullRequestIcon,
  MoreHorizontalIcon,
  PanelsTopLeftIcon,
  PlusIcon,
  ServerIcon,
  Settings2Icon,
  XIcon,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";

import { openCommandPalette } from "../commandPaletteBus";
import { DraftId, useComposerDraftStore } from "../composerDraftStore";
import {
  globalTabKey,
  isGlobalTabCloseShortcut,
  isGlobalThreadTab,
  resolveGlobalTabDropTargetIndex,
  resolveLastActiveGlobalTab,
  resolveGlobalThreadTabLifecycle,
  type GlobalTab,
  type GlobalTabDropPosition,
  type GlobalTabNavigation,
  type GlobalThreadTabLifecycle,
} from "../globalTabs";
import { useGlobalTabsStore } from "../globalTabsStore";
import {
  resolveShortcutCommand,
  shortcutKeyLabelForCommandMatchingModifiers,
  shortcutLabelForCommand,
  shouldShowTabJumpHintsForModifiers,
  shouldShowThreadJumpHintsForModifiers,
  tabJumpCommandForIndex,
  tabJumpIndexFromCommand,
  threadJumpCommandForIndex,
  threadJumpIndexFromCommand,
  threadTraversalDirectionFromCommand,
} from "../keybindings";
import { useThreadTabLifecycleMenu } from "../hooks/useThreadActionMenu";
import { useClientSettings } from "../hooks/useSettings";
import { useNowMinute } from "../hooks/useNowMinute";
import { isTerminalFocused } from "../lib/terminalFocus";
import { isModelPickerOpen } from "../modelPickerVisibility";
import {
  captureHeldShortcut,
  shouldReleaseHeldShortcut,
  type HeldShortcutState,
  useShortcutModifierState,
} from "../shortcutModifierState";
import {
  useAllEnvironmentShellsBootstrapped,
  useProjects,
  useServerConfigs,
  useThreadShells,
} from "../state/entities";
import { useEnvironments } from "../state/environments";
import { primaryServerKeybindingsAtom } from "../state/server";
import { buildDraftThreadRouteParams, buildThreadRouteParams } from "../threadRoutes";
import { selectThreadTerminalUiState, useTerminalUiStateStore } from "../terminalUiStateStore";
import { cn } from "../lib/utils";
import { useUiStateStore } from "../uiStateStore";
import { ProjectFavicon } from "./ProjectFavicon";
import {
  resolveAdjacentThreadId,
  resolveThreadStatusPill,
  sortPinnedThreadsForSidebar,
  sortThreadsForSidebar,
  type ThreadStatusPill,
} from "./Sidebar.logic";
import { ThreadStatusMark } from "./ThreadStatusMark";
import { Kbd } from "./ui/kbd";
import { Tooltip, TooltipPopup, TooltipProvider, TooltipTrigger } from "./ui/tooltip";

interface GlobalTabsProps {
  readonly activeTab: GlobalTab | null;
}

function useTabPeekShortcutHeld(
  keybindings: ResolvedKeybindingsConfig,
  terminalOpen: boolean,
): boolean {
  const [held, setHeld] = useState(false);
  const heldShortcutRef = useRef<HeldShortcutState | null>(null);

  useEffect(() => {
    const clearHeldShortcut = () => {
      heldShortcutRef.current = null;
      setHeld(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const command = resolveShortcutCommand(event, keybindings, {
        platform: navigator.platform,
        context: {
          terminalFocus: isTerminalFocused(),
          terminalOpen,
          modelPickerOpen: isModelPickerOpen(),
        },
      });
      if (command !== "tab.peek") return;
      event.preventDefault();
      event.stopPropagation();
      if (event.repeat && heldShortcutRef.current !== null) return;
      heldShortcutRef.current = captureHeldShortcut(event);
      setHeld(true);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      const heldShortcut = heldShortcutRef.current;
      if (heldShortcut === null) return;
      if (shouldReleaseHeldShortcut(heldShortcut, event)) {
        clearHeldShortcut();
      }
    };

    clearHeldShortcut();
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    window.addEventListener("blur", clearHeldShortcut);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("blur", clearHeldShortcut);
    };
  }, [keybindings, terminalOpen]);

  return held;
}

function GlobalTabDetailsTooltip(props: {
  readonly children: ReactNode;
  readonly disabled: boolean;
  readonly quickLookOpen: boolean;
}) {
  const [interactionOpen, setInteractionOpen] = useState(false);
  const enabled = !props.disabled || props.quickLookOpen;
  return (
    <Tooltip
      disabled={!enabled}
      open={enabled && (props.quickLookOpen || interactionOpen)}
      onOpenChange={setInteractionOpen}
    >
      {props.children}
    </Tooltip>
  );
}

function navigateToGlobalTab(navigate: ReturnType<typeof useNavigate>, tab: GlobalTab): void {
  switch (tab._tag) {
    case "ServerThread":
      void navigate({
        to: "/$environmentId/$threadId",
        params: buildThreadRouteParams(tab.threadRef),
      });
      return;
    case "DraftThread":
      void navigate({
        to: "/draft/$draftId",
        params: buildDraftThreadRouteParams(tab.draftId),
      });
      return;
    case "Settings":
      void navigate({ to: `/settings/${tab.section}` });
      return;
    case "Usage":
      void navigate({ to: "/usage" });
      return;
    case "PullRequests":
      void navigate({
        to: "/pull-requests",
        search: { involvement: "all", state: "open" },
      });
      return;
  }
}

function applyTabNavigation(
  navigate: ReturnType<typeof useNavigate>,
  navigation: GlobalTabNavigation,
): void {
  switch (navigation._tag) {
    case "KeepCurrent":
      return;
    case "Activate":
      navigateToGlobalTab(navigate, navigation.tab);
      return;
    case "OpenLanding":
      void navigate({ to: "/" });
      return;
  }
}

function AnimatedThreadTabStatusMark({
  status,
  isSettled,
}: {
  readonly status: ThreadStatusPill | null;
  readonly isSettled: boolean;
}) {
  const [lastStatus, setLastStatus] = useState(status);
  useEffect(() => {
    if (status !== null) setLastStatus(status);
  }, [status]);

  const resolvedStatusVisible = status !== null;
  const settledStatusVisible = status === null && isSettled;
  const visible = resolvedStatusVisible || settledStatusVisible;
  const displayedStatus = status ?? lastStatus;
  return (
    <span
      aria-hidden={visible ? undefined : true}
      aria-label={status?.label ?? (settledStatusVisible ? "Settled" : undefined)}
      data-thread-tab-status-slot=""
      data-visible={visible}
      role={visible ? "img" : undefined}
      className={cn(
        "pointer-events-none inline-flex h-3 shrink-0 items-center justify-center transition-[width,margin-right] duration-150 motion-reduce:transition-none",
        visible ? "mr-1.5 w-3 ease-out" : "mr-0 w-0 ease-in",
      )}
    >
      <span className="relative inline-flex size-3 origin-center items-center justify-center">
        <span
          className={cn(
            "absolute inset-0 inline-flex items-center justify-center transition-[scale,opacity,filter] duration-300 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none",
            resolvedStatusVisible
              ? "scale-100 opacity-100 blur-0"
              : "scale-[0.25] opacity-0 blur-[4px]",
          )}
        >
          {displayedStatus ? (
            <ThreadStatusMark
              status={displayedStatus}
              decorative
              animatePulse={resolvedStatusVisible}
            />
          ) : null}
        </span>
        <span
          className={cn(
            "absolute inset-0 inline-flex items-center justify-center text-muted-foreground transition-[scale,opacity,filter] duration-300 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none",
            settledStatusVisible
              ? "scale-100 opacity-100 blur-0"
              : "scale-[0.25] opacity-0 blur-[4px]",
          )}
        >
          <CircleCheckIcon className="size-3" />
        </span>
      </span>
    </span>
  );
}

/** Application titlebar for lifecycle-required threads and route-backed tab history. */
export function GlobalTabs({ activeTab }: GlobalTabsProps) {
  const navigate = useNavigate();
  const tabs = useGlobalTabsStore((state) => state.tabs);
  const lastActiveTab = useGlobalTabsStore(resolveLastActiveGlobalTab);
  const transitionTabs = useGlobalTabsStore((state) => state.transition);
  const activeTabKey = activeTab === null ? null : globalTabKey(activeTab);
  const activeTabKeyRef = useRef(activeTabKey);
  activeTabKeyRef.current = activeTabKey;
  const threadShells = useThreadShells();
  const allShellsBootstrapped = useAllEnvironmentShellsBootstrapped();
  const serverConfigs = useServerConfigs();
  const autoSettleAfterDays = useClientSettings((state) => state.sidebarAutoSettleAfterDays);
  const nowMinute = useNowMinute();
  const projects = useProjects();
  const { environments } = useEnvironments();
  const draftSessions = useComposerDraftStore((state) => state.draftThreadsByThreadKey);
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  const shortcutModifiers = useShortcutModifierState();
  const lastVisitedAtByThreadKey = useUiStateStore((state) => state.threadLastVisitedAtById);
  const draggedTabKeyRef = useRef<string | null>(null);
  const [tabDropPreview, setTabDropPreview] = useState<{
    readonly key: string;
    readonly position: GlobalTabDropPosition | "end";
  } | null>(null);
  const startupRestoreAttemptedRef = useRef(false);
  const activeThreadRef: ScopedThreadRef | null =
    activeTab !== null && isGlobalThreadTab(activeTab) ? activeTab.threadRef : null;
  const routeTerminalOpen = useTerminalUiStateStore((state) =>
    activeThreadRef === null
      ? false
      : selectThreadTerminalUiState(state.terminalUiStateByThreadKey, activeThreadRef).terminalOpen,
  );
  const tabPeekShortcutHeld = useTabPeekShortcutHeld(keybindings, routeTerminalOpen);
  const shortcutContext = {
    terminalFocus: isTerminalFocused(),
    terminalOpen: routeTerminalOpen,
    modelPickerOpen: isModelPickerOpen(),
  };
  const fastTabJumpModifiersHeld = shouldShowThreadJumpHintsForModifiers(
    shortcutModifiers,
    keybindings,
    {
      platform: navigator.platform,
      context: shortcutContext,
    },
  );
  const contextualTabJumpModifiersHeld = shouldShowTabJumpHintsForModifiers(
    shortcutModifiers,
    keybindings,
    {
      platform: navigator.platform,
      context: shortcutContext,
    },
  );
  const newTabShortcutLabel = shortcutLabelForCommand(keybindings, "tab.new", {
    platform: navigator.platform,
    context: shortcutContext,
  });

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
  const { requiredThreadTabs, threadLifecycleByTabKey } = useMemo(() => {
    const pinnedThreads: Array<(typeof threadShells)[number]> = [];
    const activeThreads: Array<(typeof threadShells)[number]> = [];
    const lifecycleByTabKey = new Map<string, GlobalThreadTabLifecycle>();
    const now = `${nowMinute}:00.000Z`;

    for (const thread of threadShells) {
      const capabilities = serverConfigs.get(thread.environmentId)?.environment.capabilities;
      const supportsSettlement = capabilities?.threadSettlement === true;
      const supportsSnooze = capabilities?.threadSnooze === true;
      const threadRef = scopeThreadRef(thread.environmentId, thread.id);
      const tabKey = globalTabKey({ _tag: "ServerThread", threadRef });
      const lifecycle = resolveGlobalThreadTabLifecycle(thread, {
        now,
        autoSettleAfterDays,
        supportsSettlement,
        supportsSnooze,
      });
      lifecycleByTabKey.set(tabKey, lifecycle);
      if (!lifecycle.isRequired) continue;
      if (thread.pinnedAt != null) pinnedThreads.push(thread);
      else activeThreads.push(thread);
    }

    return {
      requiredThreadTabs: [
        ...sortPinnedThreadsForSidebar(pinnedThreads),
        ...sortThreadsForSidebar(activeThreads),
      ].map((thread) => ({
        _tag: "ServerThread" as const,
        threadRef: scopeThreadRef(thread.environmentId, thread.id),
      })),
      threadLifecycleByTabKey: lifecycleByTabKey,
    };
  }, [autoSettleAfterDays, nowMinute, serverConfigs, threadShells]);
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
    if (activeTab !== null) transitionTabs({ _tag: "Open", tab: activeTab });
  }, [activeTab, transitionTabs]);

  useEffect(() => {
    if (!allShellsBootstrapped) return;
    const validTabKeys = [
      ...threadShells.flatMap((thread) =>
        thread.archivedAt === null
          ? [
              globalTabKey({
                _tag: "ServerThread",
                threadRef: scopeThreadRef(thread.environmentId, thread.id),
              }),
            ]
          : [],
      ),
      ...Object.entries(draftSessions).map(([draftId, session]) =>
        globalTabKey({
          _tag: "DraftThread",
          draftId: DraftId.make(draftId),
          threadRef: scopeThreadRef(session.environmentId, session.threadId),
        }),
      ),
    ];
    const result = transitionTabs({
      _tag: "Reconcile",
      validThreadTabKeys: validTabKeys,
      requiredThreadTabs,
      routeActiveTabKey: activeTabKey,
    });
    if (!startupRestoreAttemptedRef.current) {
      startupRestoreAttemptedRef.current = true;
      if (activeTabKey === null) {
        const restoreTab = resolveLastActiveGlobalTab(result.state);
        if (restoreTab !== null) navigateToGlobalTab(navigate, restoreTab);
        return;
      }
    }
    applyTabNavigation(navigate, result.navigation);
  }, [
    activeTabKey,
    allShellsBootstrapped,
    draftSessions,
    navigate,
    requiredThreadTabs,
    threadShells,
    transitionTabs,
  ]);

  const closeTab = useCallback(
    (tabKey: string, requiredTabDisposition: "forget" | "dismiss") => {
      const result = transitionTabs({
        _tag: "Close",
        tabKey,
        requiredTabDisposition,
        // Lifecycle commands can finish after the user switches tabs. Read
        // the latest visible route so that navigation made during the await
        // wins over the close that follows it.
        routeActiveTabKey: activeTabKeyRef.current,
      });
      applyTabNavigation(navigate, result.navigation);
    },
    [navigate, transitionTabs],
  );
  const { openMenu: openThreadTabLifecycleMenu, settleAndClose: settleAndCloseThreadTab } =
    useThreadTabLifecycleMenu({ closeTab });
  const requestCloseTab = useCallback(
    (tab: GlobalTab) => {
      const tabKey = globalTabKey(tab);
      const lifecycle = threadLifecycleByTabKey.get(tabKey);
      if (tab._tag === "ServerThread" && lifecycle?.closePolicy === "settle-first") {
        void settleAndCloseThreadTab(tab.threadRef, tabKey);
        return;
      }
      closeTab(tabKey, lifecycle?.isRequired === true ? "dismiss" : "forget");
    },
    [closeTab, settleAndCloseThreadTab, threadLifecycleByTabKey],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const closeShortcut =
        (activeTabKey !== null || lastActiveTab !== null) &&
        isGlobalTabCloseShortcut(event, navigator.platform);
      if (event.repeat) {
        if (closeShortcut) event.preventDefault();
        return;
      }
      const command = resolveShortcutCommand(event, keybindings, {
        platform: navigator.platform,
        context: {
          terminalFocus: isTerminalFocused(),
          terminalOpen: routeTerminalOpen,
          modelPickerOpen: isModelPickerOpen(),
        },
      });
      if (command === "tab.new") {
        event.preventDefault();
        event.stopPropagation();
        void navigate({ to: "/" });
        return;
      }
      if (command === null && closeShortcut) {
        event.preventDefault();
        event.stopPropagation();
        if (activeTabKey !== null) {
          const activeStoredTab = tabs.find((tab) => globalTabKey(tab) === activeTabKey);
          if (activeStoredTab !== undefined) requestCloseTab(activeStoredTab);
        } else if (lastActiveTab !== null) {
          navigateToGlobalTab(navigate, lastActiveTab);
        }
        return;
      }
      const traversalDirection = threadTraversalDirectionFromCommand(command);
      const jumpIndex =
        tabJumpIndexFromCommand(command ?? "") ?? threadJumpIndexFromCommand(command ?? "");
      let targetKey: string | null = null;
      if (traversalDirection !== null) {
        targetKey = resolveAdjacentThreadId({
          threadIds: tabs.map(globalTabKey),
          currentThreadId: activeTabKey,
          direction: traversalDirection,
        });
      } else if (jumpIndex !== null) {
        const target = tabs[jumpIndex];
        targetKey = target ? globalTabKey(target) : null;
      }
      if (targetKey === null) return;
      const target = tabs.find((tab) => globalTabKey(tab) === targetKey);
      if (!target) return;
      event.preventDefault();
      event.stopPropagation();
      navigateToGlobalTab(navigate, target);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    activeTabKey,
    keybindings,
    lastActiveTab,
    navigate,
    requestCloseTab,
    routeTerminalOpen,
    tabs,
  ]);

  const reorderDraggedTab = useCallback(
    (hoveredIndex: number, position: GlobalTabDropPosition) => {
      const tabKey = draggedTabKeyRef.current;
      draggedTabKeyRef.current = null;
      if (tabKey === null) return;
      const sourceIndex = tabs.findIndex((tab) => globalTabKey(tab) === tabKey);
      if (sourceIndex < 0) return;
      transitionTabs({
        _tag: "Reorder",
        tabKey,
        targetIndex: resolveGlobalTabDropTargetIndex(sourceIndex, hoveredIndex, position),
      });
    },
    [tabs, transitionTabs],
  );
  const handleTabDragEnd = useCallback(() => {
    draggedTabKeyRef.current = null;
    setTabDropPreview(null);
  }, []);
  const handleTabDragLeave = useCallback((event: ReactDragEvent<HTMLElement>) => {
    const relatedTarget = event.relatedTarget;
    if (relatedTarget instanceof Node && event.currentTarget.contains(relatedTarget)) return;
    setTabDropPreview(null);
  }, []);
  const handleTabDragOver = useCallback((event: ReactDragEvent<HTMLElement>, tabKey: string) => {
    if (draggedTabKeyRef.current === null) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    const bounds = event.currentTarget.getBoundingClientRect();
    const position = event.clientX < bounds.left + bounds.width / 2 ? "before" : "after";
    setTabDropPreview((current) =>
      current?.key === tabKey && current.position === position
        ? current
        : { key: tabKey, position },
    );
  }, []);
  const handleTabDrop = useCallback(
    (event: ReactDragEvent<HTMLElement>, targetIndex: number, targetKey: string) => {
      event.preventDefault();
      event.stopPropagation();
      const position =
        tabDropPreview?.key === targetKey && tabDropPreview.position !== "end"
          ? tabDropPreview.position
          : "after";
      setTabDropPreview(null);
      reorderDraggedTab(targetIndex, position);
    },
    [reorderDraggedTab, tabDropPreview],
  );
  const handleTabBarDragOver = useCallback((event: ReactDragEvent<HTMLDivElement>) => {
    if (draggedTabKeyRef.current === null) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setTabDropPreview((current) =>
      current?.position === "end" ? current : { key: "end", position: "end" },
    );
  }, []);
  const handleTabBarDrop = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setTabDropPreview(null);
      const lastTabIndex = tabs.length - 1;
      if (lastTabIndex < 0) return;
      reorderDraggedTab(lastTabIndex, "after");
    },
    [reorderDraggedTab, tabs.length],
  );
  return (
    <header
      className="workspace-topbar drag-region relative z-[70] gap-0.5 border-b border-border/60 bg-background pl-[var(--workspace-controls-left)] pr-2 wco:pr-[var(--workspace-native-controls-inset)]"
      data-global-tabs=""
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
        <div className="min-w-0 flex-1 overflow-hidden">
          <div
            className="flex h-full min-w-0 items-center gap-0.5"
            onDragLeave={handleTabDragLeave}
            onDragOver={handleTabBarDragOver}
            onDrop={handleTabBarDrop}
          >
            {tabs.map((tab, index) => {
              const tabKey = globalTabKey(tab);
              const active = tabKey === activeTabKey;
              const threadTab = isGlobalThreadTab(tab) ? tab : null;
              const threadKey = threadTab ? scopedThreadKey(threadTab.threadRef) : null;
              const shell = threadKey ? threadShellByKey.get(threadKey) : undefined;
              const threadLifecycle =
                tab._tag === "ServerThread"
                  ? (threadLifecycleByTabKey.get(tabKey) ?? {
                      isRequired: false,
                      isSettled: false,
                      closePolicy: "direct" as const,
                    })
                  : null;
              const isSettled = threadLifecycle?.isSettled ?? false;
              const settlesBeforeClose = threadLifecycle?.closePolicy === "settle-first";
              const draftSession = tab._tag === "DraftThread" ? draftSessions[tab.draftId] : null;
              const projectId = shell?.projectId ?? draftSession?.projectId;
              const environmentId = threadTab?.threadRef.environmentId ?? null;
              const project = projectId
                ? projectByKey.get(`${environmentId}:${projectId}`)
                : undefined;
              const title =
                tab._tag === "Settings"
                  ? "Settings"
                  : tab._tag === "Usage"
                    ? "Usage"
                    : tab._tag === "PullRequests"
                      ? "Pull Requests"
                      : (shell?.title ?? (tab._tag === "DraftThread" ? "New session" : "Thread"));
              const status = shell
                ? resolveThreadStatusPill({
                    thread: {
                      ...shell,
                      lastVisitedAt:
                        threadKey === null ? undefined : lastVisitedAtByThreadKey[threadKey],
                    },
                  })
                : null;
              const environmentLabel = environmentId
                ? (environmentLabelById.get(environmentId) ?? null)
                : null;
              const branch = shell?.branch ?? draftSession?.branch ?? null;
              const modelLabel = shell?.modelSelection.model ?? null;
              const jumpCommand = contextualTabJumpModifiersHeld
                ? tabJumpCommandForIndex(index)
                : fastTabJumpModifiersHeld
                  ? threadJumpCommandForIndex(index)
                  : null;
              const jumpKeyLabel = jumpCommand
                ? shortcutKeyLabelForCommandMatchingModifiers(
                    shortcutModifiers,
                    keybindings,
                    jumpCommand,
                    { platform: navigator.platform, context: shortcutContext },
                  )
                : null;
              const showJumpHint = jumpKeyLabel !== null;
              const quickLookOpen = tabPeekShortcutHeld && threadTab !== null;
              const hasTooltipDetails =
                project !== undefined ||
                environmentLabel !== null ||
                branch !== null ||
                modelLabel !== null ||
                status !== null ||
                isSettled;
              return (
                <GlobalTabDetailsTooltip
                  key={tabKey}
                  disabled={!hasTooltipDetails}
                  quickLookOpen={quickLookOpen}
                >
                  <TooltipTrigger
                    render={
                      <div
                        draggable
                        data-active-tab={active}
                        data-global-tab=""
                        className={cn(
                          "group/tab relative flex h-7 min-w-0 max-w-44 flex-[1_1_11rem] items-center rounded-md pl-1.5 text-xs transition-[background-color,color] duration-150 ease-out",
                          tabDropPreview?.key === tabKey &&
                            tabDropPreview.position === "before" &&
                            "before:absolute before:inset-y-0.5 before:-left-0.5 before:w-0.5 before:rounded-full before:bg-primary",
                          tabDropPreview?.key === tabKey &&
                            tabDropPreview.position === "after" &&
                            "after:absolute after:inset-y-0.5 after:-right-0.5 after:w-0.5 after:rounded-full after:bg-primary",
                          active
                            ? "bg-accent text-foreground shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--border)_65%,transparent)]"
                            : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                        )}
                        onDragStart={(event) => {
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData("text/plain", title);
                          draggedTabKeyRef.current = tabKey;
                        }}
                        onDragEnd={handleTabDragEnd}
                        onDragLeave={handleTabDragLeave}
                        onDragOver={(event) => handleTabDragOver(event, tabKey)}
                        onDrop={(event) => handleTabDrop(event, index, tabKey)}
                        onMouseDown={(event: ReactMouseEvent) => {
                          if (event.button === 1) event.preventDefault();
                        }}
                        onAuxClick={(event: ReactMouseEvent) => {
                          if (event.button !== 1) return;
                          event.preventDefault();
                          requestCloseTab(tab);
                        }}
                        onContextMenu={(event) => {
                          if (tab._tag !== "ServerThread") return;
                          event.preventDefault();
                          openThreadTabLifecycleMenu(tab.threadRef, tabKey, {
                            x: event.clientX,
                            y: event.clientY,
                          });
                        }}
                      >
                        <button
                          type="button"
                          className={cn(
                            "flex h-full min-w-0 flex-1 items-center overflow-hidden",
                            tab._tag === "ServerThread" ? "pr-12" : "pr-6",
                          )}
                          data-global-tab-content=""
                          data-server-thread={tab._tag === "ServerThread" ? "" : undefined}
                          aria-current={active ? "page" : undefined}
                          onClick={() => navigateToGlobalTab(navigate, tab)}
                        >
                          {project ? (
                            <ProjectFavicon
                              environmentId={project.environmentId}
                              cwd={project.workspaceRoot}
                              projectName={project.title}
                              faviconPath={project.faviconPath}
                              className="mr-1.5 size-4"
                            />
                          ) : tab._tag === "Settings" ? (
                            <Settings2Icon className="mr-1.5 size-3.5 shrink-0" />
                          ) : tab._tag === "Usage" ? (
                            <ChartNoAxesColumnIcon className="mr-1.5 size-3.5 shrink-0" />
                          ) : tab._tag === "PullRequests" ? (
                            <GitPullRequestIcon className="mr-1.5 size-3.5 shrink-0" />
                          ) : null}
                          {threadTab ? (
                            <AnimatedThreadTabStatusMark status={status} isSettled={isSettled} />
                          ) : null}
                          <span className="truncate">{title}</span>
                        </button>
                        {tab._tag === "ServerThread" ? (
                          <button
                            type="button"
                            data-global-tab-thread-actions=""
                            className={cn(
                              "absolute right-[1.625rem] flex size-6 shrink-0 items-center justify-center rounded-sm text-foreground outline-none transition-[background-color,opacity] duration-150 ease-out hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
                              showJumpHint
                                ? "pointer-events-none opacity-0"
                                : active
                                  ? "pointer-events-auto opacity-100"
                                  : "pointer-events-none opacity-0 group-hover/tab:pointer-events-auto group-hover/tab:opacity-100 group-focus-within/tab:pointer-events-auto group-focus-within/tab:opacity-100",
                            )}
                            aria-label={`Thread actions for ${title}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              const bounds = event.currentTarget.getBoundingClientRect();
                              openThreadTabLifecycleMenu(tab.threadRef, tabKey, {
                                x: bounds.left,
                                y: bounds.bottom,
                              });
                            }}
                          >
                            <MoreHorizontalIcon className="size-3.5" />
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className={cn(
                            "absolute right-0.5 flex size-6 shrink-0 items-center justify-center rounded-sm text-foreground transition-[background-color,opacity] duration-150 ease-out hover:bg-muted",
                            showJumpHint
                              ? "pointer-events-none opacity-0"
                              : active
                                ? "opacity-100"
                                : "pointer-events-none opacity-0 group-hover/tab:pointer-events-auto group-hover/tab:opacity-100 group-focus-within/tab:pointer-events-auto group-focus-within/tab:opacity-100",
                          )}
                          aria-label={
                            settlesBeforeClose ? `Settle and close ${title}` : `Close ${title}`
                          }
                          title={settlesBeforeClose ? "Settle and close tab" : "Close tab"}
                          onClick={() => requestCloseTab(tab)}
                        >
                          <span className="relative size-3">
                            <span
                              className={cn(
                                "absolute inset-0 flex items-center justify-center transition-[opacity,filter,scale] duration-300 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none",
                                settlesBeforeClose
                                  ? "scale-100 opacity-100 blur-0"
                                  : "scale-[0.25] opacity-0 blur-[4px]",
                              )}
                            >
                              <CheckIcon className="size-3" />
                            </span>
                            <span
                              className={cn(
                                "flex size-3 items-center justify-center transition-[opacity,filter,scale] duration-300 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none",
                                settlesBeforeClose
                                  ? "scale-[0.25] opacity-0 blur-[4px]"
                                  : "scale-100 opacity-100 blur-0",
                              )}
                            >
                              <XIcon className="size-3" />
                            </span>
                          </span>
                        </button>
                        {showJumpHint ? (
                          <Kbd
                            aria-hidden
                            data-global-tab-jump-hint=""
                            className="absolute right-1 top-1/2 z-10 h-4 min-w-4 -translate-y-1/2 rounded-sm bg-background/95 px-1 font-mono text-[10px] text-foreground shadow-sm tabular-nums"
                          >
                            {jumpKeyLabel}
                          </Kbd>
                        ) : null}
                      </div>
                    }
                  />
                  <TooltipPopup
                    side="bottom"
                    align="start"
                    sideOffset={2}
                    variant="glass"
                    className="w-72 max-w-[calc(100vw-1rem)] text-left whitespace-normal transition-[width,height,scale,opacity,translate,filter] duration-200 ease-[cubic-bezier(0.2,0,0,1)] data-ending-style:-translate-y-1 data-starting-style:-translate-y-1 data-ending-style:blur-[4px] data-starting-style:blur-[4px] data-instant:duration-200 motion-reduce:transition-none [&_[data-slot=tooltip-viewport]]:p-0"
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
                            <ThreadStatusMark status={status} decorative />
                            <div className={cn("min-w-0 truncate", status.colorClass)}>
                              {status.label}
                            </div>
                          </div>
                        ) : isSettled ? (
                          <div className="flex min-w-0 items-center gap-2 text-muted-foreground">
                            <CircleCheckIcon className="size-3 shrink-0" />
                            <div className="min-w-0 truncate">Settled</div>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </TooltipPopup>
                </GlobalTabDetailsTooltip>
              );
            })}
            {tabDropPreview?.position === "end" ? (
              <span className="h-5 w-0.5 shrink-0 rounded-full bg-primary" aria-hidden />
            ) : null}
          </div>
        </div>
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-[background-color,color] duration-150 ease-out hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Open new tab"
                onClick={() => void navigate({ to: "/" })}
              >
                <PlusIcon className="size-3.5" />
              </button>
            }
          />
          <TooltipPopup side="bottom">
            {newTabShortcutLabel ? `New tab (${newTabShortcutLabel})` : "New tab"}
          </TooltipPopup>
        </Tooltip>
      </TooltipProvider>
    </header>
  );
}
