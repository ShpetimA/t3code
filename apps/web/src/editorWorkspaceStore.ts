import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { ScopedThreadRef } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import {
  activateEditorTab,
  clampEditorSplitRatio,
  closeEditorTab,
  createEditorWorkspace,
  findEditorGroup,
  focusEditorGroup,
  getEditorGroups,
  moveEditorTabToGroup,
  moveEditorTabToSplit,
  openEditorTab,
  reorderEditorTab,
  resizeEditorSplit,
  splitEditorGroup,
  splitEditorTab,
  swapEditorGroups,
  toggleMaximizedEditorGroup,
  type EditorGroupId,
  type EditorSplitId,
  type EditorSplitDirection,
  type EditorTabId,
  type EditorWorkspace,
  type EditorWorkspaceNode,
} from "./editorWorkspace";
import { resolveStorage } from "./lib/storage";

export type EditorWorkspaceTab =
  | { readonly _tag: "Thread"; readonly id: EditorTabId }
  | { readonly _tag: "Surface"; readonly id: EditorTabId; readonly surfaceId: string };

export interface ThreadEditorWorkspace {
  readonly workspace: EditorWorkspace;
  readonly tabsById: Readonly<Record<string, EditorWorkspaceTab>>;
  readonly nextId: number;
}

interface EditorWorkspaceStoreState {
  readonly byThreadKey: Readonly<Record<string, ThreadEditorWorkspace>>;
  readonly transition: (ref: ScopedThreadRef, input: ThreadEditorWorkspaceTransition) => void;
  readonly removeThread: (ref: ScopedThreadRef) => void;
}

export type ThreadEditorWorkspaceTransition =
  | { readonly _tag: "ReconcileSurfaces"; readonly surfaceIds: readonly string[] }
  | { readonly _tag: "ActivateThread" }
  | { readonly _tag: "ActivateSurface"; readonly surfaceId: string }
  | { readonly _tag: "OpenSurface"; readonly surfaceId: string }
  | { readonly _tag: "ActivateTab"; readonly groupId: EditorGroupId; readonly tabId: EditorTabId }
  | { readonly _tag: "FocusGroup"; readonly groupId: EditorGroupId }
  | { readonly _tag: "ToggleGroupMaximized"; readonly groupId: EditorGroupId }
  | { readonly _tag: "ResizeSplit"; readonly splitId: EditorSplitId; readonly ratio: number }
  | {
      readonly _tag: "SplitGroup";
      readonly groupId: EditorGroupId;
      readonly direction: EditorSplitDirection;
    }
  | {
      readonly _tag: "SplitTab";
      readonly groupId: EditorGroupId;
      readonly tabId: EditorTabId;
      readonly direction: EditorSplitDirection;
      readonly mode: "copy" | "move";
    }
  | {
      readonly _tag: "ReorderTab";
      readonly groupId: EditorGroupId;
      readonly tabId: EditorTabId;
      readonly targetIndex: number;
    }
  | {
      readonly _tag: "MoveTabToGroup";
      readonly sourceGroupId: EditorGroupId;
      readonly targetGroupId: EditorGroupId;
      readonly tabId: EditorTabId;
      readonly targetIndex?: number;
    }
  | {
      readonly _tag: "MoveTabToSplit";
      readonly sourceGroupId: EditorGroupId;
      readonly targetGroupId: EditorGroupId;
      readonly tabId: EditorTabId;
      readonly direction: EditorSplitDirection;
    }
  | {
      readonly _tag: "SwapGroups";
      readonly sourceGroupId: EditorGroupId;
      readonly targetGroupId: EditorGroupId;
    }
  | {
      readonly _tag: "CloseSurfaceTab";
      readonly groupId: EditorGroupId;
      readonly tabId: EditorTabId;
    }
  | {
      readonly _tag: "CloseOtherSurfaceTabs";
      readonly groupId: EditorGroupId;
      readonly tabId: EditorTabId;
    }
  | {
      readonly _tag: "CloseSurfaceTabsToRight";
      readonly groupId: EditorGroupId;
      readonly tabId: EditorTabId;
    }
  | { readonly _tag: "CloseAllSurfaceTabs"; readonly groupId: EditorGroupId };

const ROOT_GROUP_ID = "editor-group:root" as EditorGroupId;
const THREAD_TAB_ID = "editor-tab:thread" as EditorTabId;
const EDITOR_WORKSPACE_STORAGE_KEY = "t3code:editor-workspace-state:v1";
const EDITOR_WORKSPACE_STORAGE_VERSION = 1;

interface PersistedEditorGroupNode {
  readonly _tag: "Group";
  readonly id: string;
  readonly tabIds: readonly string[];
  readonly activeTabId: string | null;
}

interface PersistedEditorSplitNode {
  readonly _tag: "Split";
  readonly id: string;
  readonly orientation: "horizontal" | "vertical";
  readonly ratio: number;
  readonly first: PersistedEditorWorkspaceNode;
  readonly second: PersistedEditorWorkspaceNode;
}

type PersistedEditorWorkspaceNode = PersistedEditorGroupNode | PersistedEditorSplitNode;

const PersistedEditorWorkspaceNodeRef = Schema.suspend(
  (): Schema.Codec<PersistedEditorWorkspaceNode> => PersistedEditorWorkspaceNodeSchema,
);
const PersistedEditorWorkspaceNodeSchema = Schema.Union([
  Schema.TaggedStruct("Group", {
    id: Schema.String,
    tabIds: Schema.Array(Schema.String),
    activeTabId: Schema.NullOr(Schema.String),
  }),
  Schema.TaggedStruct("Split", {
    id: Schema.String,
    orientation: Schema.Literals(["horizontal", "vertical"]),
    ratio: Schema.Finite,
    first: PersistedEditorWorkspaceNodeRef,
    second: PersistedEditorWorkspaceNodeRef,
  }),
]);

const PersistedEditorWorkspaceTabSchema = Schema.Union([
  Schema.TaggedStruct("Thread", { id: Schema.String }),
  Schema.TaggedStruct("Surface", {
    id: Schema.String,
    surfaceId: Schema.NonEmptyString,
  }),
]);

const PersistedThreadEditorWorkspaceSchema = Schema.Struct({
  workspace: Schema.Struct({
    root: PersistedEditorWorkspaceNodeSchema,
    focusedGroupId: Schema.String,
    maximizedGroupId: Schema.optional(Schema.NullOr(Schema.String)),
  }),
  tabsById: Schema.Record(Schema.String, PersistedEditorWorkspaceTabSchema),
  nextId: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
});

const decodePersistedThreadEditorWorkspace = Schema.decodeUnknownOption(
  PersistedThreadEditorWorkspaceSchema,
);

export function createThreadEditorWorkspace(
  surfaceIds: readonly string[] = [],
): ThreadEditorWorkspace {
  let next: ThreadEditorWorkspace = {
    workspace: createEditorWorkspace({ groupId: ROOT_GROUP_ID, tabIds: [THREAD_TAB_ID] }),
    tabsById: { [THREAD_TAB_ID]: { _tag: "Thread", id: THREAD_TAB_ID } },
    nextId: 1,
  };
  for (const surfaceId of surfaceIds) {
    next = addSurfaceTab(next, surfaceId, false);
  }
  return next;
}

function reconcileThreadEditorWorkspace(
  current: ThreadEditorWorkspace,
  surfaceIds: readonly string[],
): ThreadEditorWorkspace {
  const validSurfaceIds = new Set(surfaceIds);
  let next = replaceTransientSurfaceTabs(current, surfaceIds);
  for (const tab of Object.values(next.tabsById)) {
    if (tab._tag === "Surface" && !validSurfaceIds.has(tab.surfaceId)) {
      next = closeWorkspaceTab(next, tab.id);
    }
  }
  for (const surfaceId of surfaceIds) {
    if (!findSurfaceTabs(next, surfaceId).length) {
      next = addSurfaceTab(next, surfaceId, false);
    }
  }
  return next;
}

/** Applies every thread-workspace rule through the same pure interface used by the store. */
export function transitionThreadEditorWorkspace(
  current: ThreadEditorWorkspace,
  input: ThreadEditorWorkspaceTransition,
): ThreadEditorWorkspace {
  switch (input._tag) {
    case "ReconcileSurfaces":
      return reconcileThreadEditorWorkspace(current, input.surfaceIds);
    case "ActivateThread":
      return activateThreadWorkspaceTab(current);
    case "ActivateSurface":
      return activateSurfaceWorkspaceTab(current, input.surfaceId);
    case "OpenSurface":
      return openSurfaceWorkspaceTab(current, input.surfaceId);
    case "ActivateTab": {
      const workspace = activateEditorTab(current.workspace, input.groupId, input.tabId);
      return workspace === current.workspace ? current : { ...current, workspace };
    }
    case "FocusGroup": {
      const workspace = focusEditorGroup(current.workspace, input.groupId);
      return workspace === current.workspace ? current : { ...current, workspace };
    }
    case "ToggleGroupMaximized": {
      const workspace = toggleMaximizedEditorGroup(current.workspace, input.groupId);
      return workspace === current.workspace ? current : { ...current, workspace };
    }
    case "ResizeSplit": {
      const workspace = resizeEditorSplit(current.workspace, input.splitId, input.ratio);
      return workspace === current.workspace ? current : { ...current, workspace };
    }
    case "SplitGroup":
      return splitThreadEditorGroup(current, input.groupId, input.direction);
    case "SplitTab":
      return splitThreadEditorTab(current, input);
    case "ReorderTab":
      return reorderThreadEditorTab(current, input);
    case "MoveTabToGroup":
      return moveThreadEditorTabToGroup(current, input);
    case "MoveTabToSplit":
      return moveThreadEditorTabToSplit(current, input);
    case "SwapGroups":
      return swapThreadEditorGroups(current, input);
    case "CloseSurfaceTab":
      return closeThreadEditorSurfaceTab(current, input.groupId, input.tabId);
    case "CloseOtherSurfaceTabs":
      return closeOtherThreadEditorSurfaceTabs(current, input.groupId, input.tabId);
    case "CloseSurfaceTabsToRight":
      return closeThreadEditorSurfaceTabsToRight(current, input.groupId, input.tabId);
    case "CloseAllSurfaceTabs":
      return closeAllThreadEditorSurfaceTabs(current, input.groupId);
  }
}

function replaceTransientSurfaceTabs(
  current: ThreadEditorWorkspace,
  surfaceIds: readonly string[],
): ThreadEditorWorkspace {
  const existingSurfaceIds = new Set(
    Object.values(current.tabsById).flatMap((tab) =>
      tab._tag === "Surface" ? [tab.surfaceId] : [],
    ),
  );
  const incomingSurfaceIds = new Set(surfaceIds);
  const missingSurfaceIds = surfaceIds.filter((surfaceId) => !existingSurfaceIds.has(surfaceId));
  const removedSurfaceIds = [...existingSurfaceIds].filter(
    (surfaceId) => !incomingSurfaceIds.has(surfaceId),
  );
  let tabsById = current.tabsById;
  for (const nextSurfaceId of missingSurfaceIds) {
    const previousSurfaceId = removedSurfaceIds.find((surfaceId) =>
      isTransientSurfaceReplacement(surfaceId, nextSurfaceId),
    );
    if (!previousSurfaceId) continue;
    tabsById = Object.fromEntries(
      Object.entries(tabsById).map(([tabId, tab]) => [
        tabId,
        tab._tag === "Surface" && tab.surfaceId === previousSurfaceId
          ? { ...tab, surfaceId: nextSurfaceId }
          : tab,
      ]),
    );
    removedSurfaceIds.splice(removedSurfaceIds.indexOf(previousSurfaceId), 1);
  }
  return tabsById === current.tabsById ? current : { ...current, tabsById };
}

function isTransientSurfaceReplacement(previousSurfaceId: string, nextSurfaceId: string): boolean {
  return (
    (previousSurfaceId === "files" && nextSurfaceId.startsWith("file:")) ||
    (previousSurfaceId === "browser:new" && nextSurfaceId.startsWith("browser:"))
  );
}

function activateThreadWorkspaceTab(current: ThreadEditorWorkspace): ThreadEditorWorkspace {
  const threadTab = Object.values(current.tabsById).find((tab) => tab._tag === "Thread");
  if (!threadTab) return current;
  return activateWorkspaceTab(current, threadTab.id);
}

function activateSurfaceWorkspaceTab(
  current: ThreadEditorWorkspace,
  surfaceId: string,
): ThreadEditorWorkspace {
  const focusedGroup = findEditorGroup(current.workspace.root, current.workspace.focusedGroupId);
  const focusedTab = focusedGroup?.tabIds
    .map((tabId) => current.tabsById[tabId])
    .find((tab) => tab?._tag === "Surface" && tab.surfaceId === surfaceId);
  const existingTab = focusedTab ?? findSurfaceTabs(current, surfaceId)[0];
  return existingTab
    ? activateWorkspaceTab(current, existingTab.id)
    : addSurfaceTab(current, surfaceId);
}

/** Opens a surface in the focused group, allowing the same surface in separate groups. */
function openSurfaceWorkspaceTab(
  current: ThreadEditorWorkspace,
  surfaceId: string,
): ThreadEditorWorkspace {
  const focusedGroup = findEditorGroup(current.workspace.root, current.workspace.focusedGroupId);
  if (!focusedGroup) return activateSurfaceWorkspaceTab(current, surfaceId);
  const focusedTab = focusedGroup.tabIds
    .map((tabId) => current.tabsById[tabId])
    .find((tab) => tab?._tag === "Surface" && tab.surfaceId === surfaceId);
  return focusedTab
    ? activateWorkspaceTab(current, focusedTab.id)
    : addSurfaceTab(current, surfaceId);
}

function splitThreadEditorTab(
  current: ThreadEditorWorkspace,
  input: {
    readonly groupId: EditorGroupId;
    readonly tabId: EditorTabId;
    readonly direction: EditorSplitDirection;
    readonly mode: "copy" | "move";
  },
): ThreadEditorWorkspace {
  const sourceTab = current.tabsById[input.tabId];
  if (!sourceTab || (input.mode === "copy" && sourceTab._tag === "Thread")) return current;

  const targetGroupId = `editor-group:${current.nextId}` as EditorGroupId;
  const splitId = `editor-split:${current.nextId + 1}` as const;
  const targetTabId =
    input.mode === "copy" ? (`editor-tab:${current.nextId + 2}` as EditorTabId) : input.tabId;
  const workspace = splitEditorTab(current.workspace, {
    sourceGroupId: input.groupId,
    sourceTabId: input.tabId,
    targetTabId,
    targetGroupId,
    splitId,
    direction: input.direction,
    mode: input.mode,
  });
  if (workspace === current.workspace) return current;
  return {
    workspace,
    tabsById:
      input.mode === "copy"
        ? { ...current.tabsById, [targetTabId]: { ...sourceTab, id: targetTabId } }
        : current.tabsById,
    nextId: current.nextId + (input.mode === "copy" ? 3 : 2),
  };
}

function splitThreadEditorGroup(
  current: ThreadEditorWorkspace,
  groupId: EditorGroupId,
  direction: EditorSplitDirection,
): ThreadEditorWorkspace {
  const workspace = splitEditorGroup(current.workspace, {
    sourceGroupId: groupId,
    targetGroupId: `editor-group:${current.nextId}` as EditorGroupId,
    splitId: `editor-split:${current.nextId + 1}` as EditorSplitId,
    direction,
  });
  return workspace === current.workspace
    ? current
    : { ...current, workspace, nextId: current.nextId + 2 };
}

/** Reorders one thread-workspace tab within its current editor group. */
function reorderThreadEditorTab(
  current: ThreadEditorWorkspace,
  input: {
    readonly groupId: EditorGroupId;
    readonly tabId: EditorTabId;
    readonly targetIndex: number;
  },
): ThreadEditorWorkspace {
  const tab = current.tabsById[input.tabId];
  const group = findEditorGroup(current.workspace.root, input.groupId);
  if (!tab || tab._tag === "Thread" || !group) return current;
  const threadIndex = group.tabIds.findIndex((tabId) => current.tabsById[tabId]?._tag === "Thread");
  const targetIndex =
    threadIndex < 0 ? input.targetIndex : Math.max(threadIndex + 1, input.targetIndex);
  const workspace = reorderEditorTab(current.workspace, { ...input, targetIndex });
  return workspace === current.workspace ? current : { ...current, workspace };
}

/** Moves one thread-workspace tab into an existing editor group. */
function moveThreadEditorTabToGroup(
  current: ThreadEditorWorkspace,
  input: {
    readonly sourceGroupId: EditorGroupId;
    readonly targetGroupId: EditorGroupId;
    readonly tabId: EditorTabId;
    readonly targetIndex?: number;
  },
): ThreadEditorWorkspace {
  const tab = current.tabsById[input.tabId];
  const targetGroup = findEditorGroup(current.workspace.root, input.targetGroupId);
  if (!tab || !targetGroup) return current;
  const equivalentTargetTabId = targetGroup.tabIds.find((tabId) => {
    const candidate = current.tabsById[tabId];
    return candidate ? editorWorkspaceTabsShareContent(tab, candidate) : false;
  });
  if (equivalentTargetTabId) {
    const withoutSource = closeWorkspaceTab(current, input.tabId, input.sourceGroupId);
    const workspace = activateEditorTab(
      withoutSource.workspace,
      input.targetGroupId,
      equivalentTargetTabId,
    );
    return workspace === withoutSource.workspace ? withoutSource : { ...withoutSource, workspace };
  }
  const threadIndex = targetGroup.tabIds.findIndex(
    (tabId) => current.tabsById[tabId]?._tag === "Thread",
  );
  const requestedTargetIndex =
    tab._tag === "Thread"
      ? 0
      : input.targetIndex === undefined || threadIndex < 0
        ? input.targetIndex
        : Math.max(threadIndex + 1, input.targetIndex);
  const workspace = moveEditorTabToGroup(current.workspace, {
    ...input,
    ...(requestedTargetIndex !== undefined ? { targetIndex: requestedTargetIndex } : {}),
  });
  return workspace === current.workspace ? current : { ...current, workspace };
}

/** Moves one thread-workspace tab into a new split around a target group. */
function moveThreadEditorTabToSplit(
  current: ThreadEditorWorkspace,
  input: {
    readonly sourceGroupId: EditorGroupId;
    readonly targetGroupId: EditorGroupId;
    readonly tabId: EditorTabId;
    readonly direction: EditorSplitDirection;
  },
): ThreadEditorWorkspace {
  if (!current.tabsById[input.tabId]) return current;
  const workspace = moveEditorTabToSplit(current.workspace, {
    sourceGroupId: input.sourceGroupId,
    sourceTabId: input.tabId,
    targetGroupId: input.targetGroupId,
    newGroupId: `editor-group:${current.nextId}` as EditorGroupId,
    splitId: `editor-split:${current.nextId + 1}` as EditorSplitId,
    direction: input.direction,
  });
  return workspace === current.workspace
    ? current
    : { ...current, workspace, nextId: current.nextId + 2 };
}

/** Swaps two complete editor groups while preserving their tab contents. */
function swapThreadEditorGroups(
  current: ThreadEditorWorkspace,
  input: {
    readonly sourceGroupId: EditorGroupId;
    readonly targetGroupId: EditorGroupId;
  },
): ThreadEditorWorkspace {
  const workspace = swapEditorGroups(current.workspace, input.sourceGroupId, input.targetGroupId);
  return workspace === current.workspace ? current : { ...current, workspace };
}

function closeThreadEditorSurfaceTab(
  current: ThreadEditorWorkspace,
  groupId: EditorGroupId,
  tabId: EditorTabId,
): ThreadEditorWorkspace {
  const tab = current.tabsById[tabId];
  return tab?._tag === "Surface" ? closeWorkspaceTab(current, tabId, groupId) : current;
}

function closeOtherThreadEditorSurfaceTabs(
  current: ThreadEditorWorkspace,
  groupId: EditorGroupId,
  tabId: EditorTabId,
): ThreadEditorWorkspace {
  const group = findEditorGroup(current.workspace.root, groupId);
  if (!group || current.tabsById[tabId]?._tag !== "Surface") return current;
  return group.tabIds.reduce(
    (next, candidateId) =>
      candidateId !== tabId && next.tabsById[candidateId]?._tag === "Surface"
        ? closeWorkspaceTab(next, candidateId, groupId)
        : next,
    current,
  );
}

function closeThreadEditorSurfaceTabsToRight(
  current: ThreadEditorWorkspace,
  groupId: EditorGroupId,
  tabId: EditorTabId,
): ThreadEditorWorkspace {
  const group = findEditorGroup(current.workspace.root, groupId);
  const tabIndex = group?.tabIds.indexOf(tabId) ?? -1;
  if (!group || tabIndex < 0) return current;
  return group.tabIds
    .slice(tabIndex + 1)
    .reduce(
      (next, candidateId) =>
        next.tabsById[candidateId]?._tag === "Surface"
          ? closeWorkspaceTab(next, candidateId, groupId)
          : next,
      current,
    );
}

function closeAllThreadEditorSurfaceTabs(
  current: ThreadEditorWorkspace,
  groupId: EditorGroupId,
): ThreadEditorWorkspace {
  const group = findEditorGroup(current.workspace.root, groupId);
  if (!group) return current;
  return group.tabIds.reduce(
    (next, tabId) =>
      next.tabsById[tabId]?._tag === "Surface" ? closeWorkspaceTab(next, tabId, groupId) : next,
    current,
  );
}

export function findEditorWorkspaceTabGroup(
  current: ThreadEditorWorkspace,
  tabId: EditorTabId,
): EditorGroupId | null {
  return (
    getEditorGroups(current.workspace.root).find((group) => group.tabIds.includes(tabId))?.id ??
    null
  );
}

export function findSurfaceTabs(
  current: ThreadEditorWorkspace,
  surfaceId: string,
): readonly Extract<EditorWorkspaceTab, { _tag: "Surface" }>[] {
  return Object.values(current.tabsById).filter(
    (tab): tab is Extract<EditorWorkspaceTab, { _tag: "Surface" }> =>
      tab._tag === "Surface" && tab.surfaceId === surfaceId,
  );
}

export function selectThreadEditorWorkspace(
  byThreadKey: Readonly<Record<string, ThreadEditorWorkspace>>,
  ref: ScopedThreadRef | null | undefined,
): ThreadEditorWorkspace | null {
  return ref ? (byThreadKey[scopedThreadKey(ref)] ?? null) : null;
}

function addSurfaceTab(
  current: ThreadEditorWorkspace,
  surfaceId: string,
  activate = true,
): ThreadEditorWorkspace {
  const tabId = `editor-tab:${current.nextId}` as EditorTabId;
  const focusedGroup = findEditorGroup(current.workspace.root, current.workspace.focusedGroupId);
  const openedWorkspace = openEditorTab(current.workspace, tabId);
  const workspace =
    !activate && focusedGroup?.activeTabId
      ? activateEditorTab(openedWorkspace, focusedGroup.id, focusedGroup.activeTabId)
      : openedWorkspace;
  return {
    workspace,
    tabsById: {
      ...current.tabsById,
      [tabId]: { _tag: "Surface", id: tabId, surfaceId },
    },
    nextId: current.nextId + 1,
  };
}

function activateWorkspaceTab(
  current: ThreadEditorWorkspace,
  tabId: EditorTabId,
): ThreadEditorWorkspace {
  const groupId = findEditorWorkspaceTabGroup(current, tabId);
  if (!groupId) return current;
  const workspace = activateEditorTab(current.workspace, groupId, tabId);
  return workspace === current.workspace ? current : { ...current, workspace };
}

function closeWorkspaceTab(
  current: ThreadEditorWorkspace,
  tabId: EditorTabId,
  knownGroupId?: EditorGroupId,
): ThreadEditorWorkspace {
  const groupId = knownGroupId ?? findEditorWorkspaceTabGroup(current, tabId);
  if (!groupId) return withoutUnreferencedTabs(current);
  const workspace = closeEditorTab(current.workspace, groupId, tabId);
  return withoutUnreferencedTabs({ ...current, workspace });
}

function withoutUnreferencedTabs(current: ThreadEditorWorkspace): ThreadEditorWorkspace {
  const referencedIds = new Set(
    getEditorGroups(current.workspace.root).flatMap((group) => group.tabIds),
  );
  const tabsById = Object.fromEntries(
    Object.entries(current.tabsById).filter(([tabId]) => referencedIds.has(tabId as EditorTabId)),
  );
  return Object.keys(tabsById).length === Object.keys(current.tabsById).length
    ? current
    : { ...current, tabsById };
}

function editorWorkspaceTabsShareContent(
  left: EditorWorkspaceTab,
  right: EditorWorkspaceTab,
): boolean {
  if (left._tag === "Thread" || right._tag === "Thread") {
    return left._tag === right._tag;
  }
  return left.surfaceId === right.surfaceId;
}

function transitionThreadWorkspace(
  byThreadKey: Readonly<Record<string, ThreadEditorWorkspace>>,
  ref: ScopedThreadRef,
  input: ThreadEditorWorkspaceTransition,
): Readonly<Record<string, ThreadEditorWorkspace>> {
  const threadKey = scopedThreadKey(ref);
  const current =
    byThreadKey[threadKey] ??
    (input._tag === "ReconcileSurfaces" ? createThreadEditorWorkspace() : undefined);
  if (!current) return byThreadKey;
  const next = transitionThreadEditorWorkspace(current, input);
  return next === byThreadKey[threadKey] ? byThreadKey : { ...byThreadKey, [threadKey]: next };
}

export function parsePersistedEditorWorkspaceState(input: unknown): {
  readonly byThreadKey: Readonly<Record<string, ThreadEditorWorkspace>>;
} {
  if (!input || typeof input !== "object" || !("byThreadKey" in input)) {
    return { byThreadKey: {} };
  }
  const rawByThreadKey = input.byThreadKey;
  if (!rawByThreadKey || typeof rawByThreadKey !== "object") {
    return { byThreadKey: {} };
  }
  const byThreadKey: Record<string, ThreadEditorWorkspace> = {};
  for (const [threadKey, rawWorkspace] of Object.entries(rawByThreadKey)) {
    const decoded = decodePersistedThreadEditorWorkspace(rawWorkspace);
    if (decoded._tag === "None") continue;
    const workspace = normalizePersistedThreadEditorWorkspace(decoded.value);
    if (workspace) byThreadKey[threadKey] = workspace;
  }
  return { byThreadKey };
}

function normalizePersistedThreadEditorWorkspace(
  persisted: typeof PersistedThreadEditorWorkspaceSchema.Type,
): ThreadEditorWorkspace | null {
  const tabsById: Record<string, EditorWorkspaceTab> = {};
  let threadTabCount = 0;
  for (const [tabKey, tab] of Object.entries(persisted.tabsById)) {
    const tabId = parseEditorTabId(tab.id);
    if (!tabId || tabKey !== tab.id) return null;
    if (tab._tag === "Thread") threadTabCount += 1;
    tabsById[tabKey] =
      tab._tag === "Thread"
        ? { _tag: "Thread", id: tabId }
        : { _tag: "Surface", id: tabId, surfaceId: tab.surfaceId };
  }
  if (threadTabCount !== 1) return null;

  const seenGroupIds = new Set<EditorGroupId>();
  const seenSplitIds = new Set<EditorSplitId>();
  const referencedTabIds = new Set<EditorTabId>();
  const root = normalizePersistedEditorNode(persisted.workspace.root, {
    seenGroupIds,
    seenSplitIds,
    referencedTabIds,
    tabsById,
  });
  const focusedGroupId = parseEditorGroupId(persisted.workspace.focusedGroupId);
  const maximizedGroupId = persisted.workspace.maximizedGroupId
    ? parseEditorGroupId(persisted.workspace.maximizedGroupId)
    : null;
  if (
    !root ||
    !focusedGroupId ||
    !seenGroupIds.has(focusedGroupId) ||
    (persisted.workspace.maximizedGroupId !== undefined &&
      persisted.workspace.maximizedGroupId !== null &&
      (!maximizedGroupId || !seenGroupIds.has(maximizedGroupId))) ||
    referencedTabIds.size !== Object.keys(tabsById).length
  ) {
    return null;
  }
  return {
    workspace: { root, focusedGroupId, maximizedGroupId },
    tabsById,
    nextId: Math.max(
      persisted.nextId,
      nextAvailableEditorId([...seenGroupIds, ...seenSplitIds, ...referencedTabIds]),
    ),
  };
}

function nextAvailableEditorId(ids: readonly string[]): number {
  let nextId = 1;
  for (const id of ids) {
    const suffix = id.slice(id.lastIndexOf(":") + 1);
    const numericId = Number(suffix);
    if (Number.isSafeInteger(numericId) && numericId >= nextId) {
      nextId = numericId + 1;
    }
  }
  return nextId;
}

function normalizePersistedEditorNode(
  node: PersistedEditorWorkspaceNode,
  state: {
    readonly seenGroupIds: Set<EditorGroupId>;
    readonly seenSplitIds: Set<EditorSplitId>;
    readonly referencedTabIds: Set<EditorTabId>;
    readonly tabsById: Readonly<Record<string, EditorWorkspaceTab>>;
  },
): EditorWorkspaceNode | null {
  if (node._tag === "Group") {
    const id = parseEditorGroupId(node.id);
    if (!id || state.seenGroupIds.has(id)) return null;
    state.seenGroupIds.add(id);
    const tabIds: EditorTabId[] = [];
    for (const persistedTabId of node.tabIds) {
      const tabId = parseEditorTabId(persistedTabId);
      if (!tabId || !state.tabsById[tabId] || state.referencedTabIds.has(tabId)) {
        return null;
      }
      tabIds.push(tabId);
      state.referencedTabIds.add(tabId);
    }
    const activeTabId = node.activeTabId ? parseEditorTabId(node.activeTabId) : null;
    if ((node.activeTabId && !activeTabId) || (activeTabId && !tabIds.includes(activeTabId))) {
      return null;
    }
    if ((tabIds.length === 0) !== (activeTabId === null)) return null;
    return { _tag: "Group", id, tabIds, activeTabId };
  }

  const id = parseEditorSplitId(node.id);
  const ratio = clampEditorSplitRatio(node.ratio);
  if (!id || ratio === null || state.seenSplitIds.has(id)) return null;
  state.seenSplitIds.add(id);
  const first = normalizePersistedEditorNode(node.first, state);
  const second = normalizePersistedEditorNode(node.second, state);
  return first && second
    ? { _tag: "Split", id, orientation: node.orientation, ratio, first, second }
    : null;
}

function parseEditorGroupId(value: string): EditorGroupId | null {
  return value.startsWith("editor-group:") ? (value as EditorGroupId) : null;
}

function parseEditorSplitId(value: string): EditorSplitId | null {
  return value.startsWith("editor-split:") ? (value as EditorSplitId) : null;
}

function parseEditorTabId(value: string): EditorTabId | null {
  return value.startsWith("editor-tab:") ? (value as EditorTabId) : null;
}

export const useEditorWorkspaceStore = create<EditorWorkspaceStoreState>()(
  persist(
    (set) => ({
      byThreadKey: {},
      transition: (ref, input) =>
        set((state) => ({
          byThreadKey: transitionThreadWorkspace(state.byThreadKey, ref, input),
        })),
      removeThread: (ref) =>
        set((state) => {
          const threadKey = scopedThreadKey(ref);
          if (!(threadKey in state.byThreadKey)) return state;
          const { [threadKey]: _removed, ...byThreadKey } = state.byThreadKey;
          return { byThreadKey };
        }),
    }),
    {
      name: EDITOR_WORKSPACE_STORAGE_KEY,
      version: EDITOR_WORKSPACE_STORAGE_VERSION,
      storage: createJSONStorage(() =>
        resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
      ),
      partialize: (state) => ({ byThreadKey: state.byThreadKey }),
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...parsePersistedEditorWorkspaceState(persistedState),
      }),
    },
  ),
);
