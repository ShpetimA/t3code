export type EditorGroupId = `editor-group:${string}`;
export type EditorSplitId = `editor-split:${string}`;
export type EditorTabId = `editor-tab:${string}`;

export type EditorSplitDirection = "up" | "down" | "left" | "right";
export type EditorSplitOrientation = "horizontal" | "vertical";

export interface EditorGroupNode {
  readonly _tag: "Group";
  readonly id: EditorGroupId;
  readonly tabIds: readonly EditorTabId[];
  readonly activeTabId: EditorTabId | null;
}

export interface EditorSplitNode {
  readonly _tag: "Split";
  readonly id: EditorSplitId;
  readonly orientation: EditorSplitOrientation;
  readonly ratio: number;
  readonly first: EditorWorkspaceNode;
  readonly second: EditorWorkspaceNode;
}

export type EditorWorkspaceNode = EditorGroupNode | EditorSplitNode;

export interface EditorWorkspace {
  readonly root: EditorWorkspaceNode;
  readonly focusedGroupId: EditorGroupId;
}

export interface SplitEditorTabInput {
  readonly sourceGroupId: EditorGroupId;
  readonly sourceTabId: EditorTabId;
  readonly targetTabId: EditorTabId;
  readonly targetGroupId: EditorGroupId;
  readonly splitId: EditorSplitId;
  readonly direction: EditorSplitDirection;
  readonly mode: "copy" | "move";
}

const MIN_SPLIT_RATIO = 0.1;
const MAX_SPLIT_RATIO = 0.9;

export function clampEditorSplitRatio(ratio: number): number | null {
  if (!Number.isFinite(ratio)) return null;
  return Math.min(MAX_SPLIT_RATIO, Math.max(MIN_SPLIT_RATIO, ratio));
}

export function createEditorWorkspace(input: {
  readonly groupId: EditorGroupId;
  readonly tabIds?: readonly EditorTabId[];
  readonly activeTabId?: EditorTabId | null;
}): EditorWorkspace {
  const tabIds = input.tabIds ?? [];
  const activeTabId = resolveActiveTabId(tabIds, input.activeTabId ?? null);
  return {
    root: { _tag: "Group", id: input.groupId, tabIds, activeTabId },
    focusedGroupId: input.groupId,
  };
}

export function getEditorGroups(node: EditorWorkspaceNode): readonly EditorGroupNode[] {
  return node._tag === "Group"
    ? [node]
    : [...getEditorGroups(node.first), ...getEditorGroups(node.second)];
}

export function findEditorGroup(
  node: EditorWorkspaceNode,
  groupId: EditorGroupId,
): EditorGroupNode | null {
  if (node._tag === "Group") return node.id === groupId ? node : null;
  return findEditorGroup(node.first, groupId) ?? findEditorGroup(node.second, groupId);
}

export function findTopRightEditorGroup(node: EditorWorkspaceNode): EditorGroupNode {
  if (node._tag === "Group") return node;
  return findTopRightEditorGroup(node.orientation === "horizontal" ? node.second : node.first);
}

export function getTopEditorGroups(node: EditorWorkspaceNode): readonly EditorGroupNode[] {
  if (node._tag === "Group") return [node];
  return node.orientation === "horizontal"
    ? [...getTopEditorGroups(node.first), ...getTopEditorGroups(node.second)]
    : getTopEditorGroups(node.first);
}

export function focusEditorGroup(
  workspace: EditorWorkspace,
  groupId: EditorGroupId,
): EditorWorkspace {
  return findEditorGroup(workspace.root, groupId)
    ? { ...workspace, focusedGroupId: groupId }
    : workspace;
}

export function openEditorTab(
  workspace: EditorWorkspace,
  tabId: EditorTabId,
  groupId = workspace.focusedGroupId,
): EditorWorkspace {
  return updateEditorGroup(workspace, groupId, (group) => ({
    ...group,
    tabIds: group.tabIds.includes(tabId) ? group.tabIds : [...group.tabIds, tabId],
    activeTabId: tabId,
  }));
}

export function activateEditorTab(
  workspace: EditorWorkspace,
  groupId: EditorGroupId,
  tabId: EditorTabId,
): EditorWorkspace {
  const group = findEditorGroup(workspace.root, groupId);
  if (!group?.tabIds.includes(tabId)) return workspace;
  return {
    ...updateEditorGroup(workspace, groupId, (current) => ({
      ...current,
      activeTabId: tabId,
    })),
    focusedGroupId: groupId,
  };
}

export function splitEditorTab(
  workspace: EditorWorkspace,
  input: SplitEditorTabInput,
): EditorWorkspace {
  const sourceGroup = findEditorGroup(workspace.root, input.sourceGroupId);
  if (!sourceGroup?.tabIds.includes(input.sourceTabId)) return workspace;
  if (findEditorGroup(workspace.root, input.targetGroupId)) return workspace;
  if (input.mode === "move" && sourceGroup.tabIds.length === 1) return workspace;

  const sourceAfterMove =
    input.mode === "move" ? removeTabFromGroup(sourceGroup, input.sourceTabId) : sourceGroup;
  const targetGroup: EditorGroupNode = {
    _tag: "Group",
    id: input.targetGroupId,
    tabIds: [input.targetTabId],
    activeTabId: input.targetTabId,
  };
  const newGroupFirst = input.direction === "left" || input.direction === "up";
  const split: EditorSplitNode = {
    _tag: "Split",
    id: input.splitId,
    orientation:
      input.direction === "left" || input.direction === "right" ? "horizontal" : "vertical",
    ratio: 0.5,
    first: newGroupFirst ? targetGroup : sourceAfterMove,
    second: newGroupFirst ? sourceAfterMove : targetGroup,
  };
  const root = replaceEditorGroup(workspace.root, input.sourceGroupId, split);
  if (root === workspace.root) return workspace;
  return { root, focusedGroupId: input.targetGroupId };
}

export function closeEditorTab(
  workspace: EditorWorkspace,
  groupId: EditorGroupId,
  tabId: EditorTabId,
): EditorWorkspace {
  const group = findEditorGroup(workspace.root, groupId);
  if (!group?.tabIds.includes(tabId)) return workspace;
  if (group.tabIds.length > 1 || workspace.root._tag === "Group") {
    return updateEditorGroup(workspace, groupId, (current) => removeTabFromGroup(current, tabId));
  }
  return removeEditorGroup(workspace, groupId);
}

export function closeOtherEditorTabs(
  workspace: EditorWorkspace,
  groupId: EditorGroupId,
  tabId: EditorTabId,
): EditorWorkspace {
  const group = findEditorGroup(workspace.root, groupId);
  if (!group?.tabIds.includes(tabId) || group.tabIds.length === 1) return workspace;
  return updateEditorGroup(workspace, groupId, (current) => ({
    ...current,
    tabIds: [tabId],
    activeTabId: tabId,
  }));
}

export function closeEditorTabsToRight(
  workspace: EditorWorkspace,
  groupId: EditorGroupId,
  tabId: EditorTabId,
): EditorWorkspace {
  const group = findEditorGroup(workspace.root, groupId);
  const tabIndex = group?.tabIds.indexOf(tabId) ?? -1;
  if (!group || tabIndex < 0 || tabIndex === group.tabIds.length - 1) return workspace;
  const tabIds = group.tabIds.slice(0, tabIndex + 1);
  return updateEditorGroup(workspace, groupId, (current) => ({
    ...current,
    tabIds,
    activeTabId: resolveActiveTabId(tabIds, current.activeTabId),
  }));
}

export function closeAllEditorTabs(
  workspace: EditorWorkspace,
  groupId: EditorGroupId,
): EditorWorkspace {
  const group = findEditorGroup(workspace.root, groupId);
  if (!group || group.tabIds.length === 0) return workspace;
  if (workspace.root._tag !== "Group") return removeEditorGroup(workspace, groupId);
  return updateEditorGroup(workspace, groupId, (current) => ({
    ...current,
    tabIds: [],
    activeTabId: null,
  }));
}

export function resizeEditorSplit(
  workspace: EditorWorkspace,
  splitId: EditorSplitId,
  ratio: number,
): EditorWorkspace {
  const nextRatio = clampEditorSplitRatio(ratio);
  if (nextRatio === null) return workspace;
  const root = mapEditorNode(workspace.root, (node) =>
    node._tag === "Split" && node.id === splitId ? { ...node, ratio: nextRatio } : node,
  );
  return root === workspace.root ? workspace : { ...workspace, root };
}

function updateEditorGroup(
  workspace: EditorWorkspace,
  groupId: EditorGroupId,
  update: (group: EditorGroupNode) => EditorGroupNode,
): EditorWorkspace {
  const root = mapEditorNode(workspace.root, (node) =>
    node._tag === "Group" && node.id === groupId ? update(node) : node,
  );
  return root === workspace.root ? workspace : { ...workspace, root };
}

function removeEditorGroup(workspace: EditorWorkspace, groupId: EditorGroupId): EditorWorkspace {
  const root = collapseEditorGroup(workspace.root, groupId);
  if (!root) return workspace;
  const focusedGroupId = findEditorGroup(root, workspace.focusedGroupId)
    ? workspace.focusedGroupId
    : getEditorGroups(root)[0]?.id;
  return focusedGroupId ? { root, focusedGroupId } : workspace;
}

function collapseEditorGroup(
  node: EditorWorkspaceNode,
  groupId: EditorGroupId,
): EditorWorkspaceNode | null {
  if (node._tag === "Group") return node.id === groupId ? null : node;
  const first = collapseEditorGroup(node.first, groupId);
  const second = collapseEditorGroup(node.second, groupId);
  if (!first) return second;
  if (!second) return first;
  if (first === node.first && second === node.second) return node;
  return { ...node, first, second };
}

function replaceEditorGroup(
  node: EditorWorkspaceNode,
  groupId: EditorGroupId,
  replacement: EditorWorkspaceNode,
): EditorWorkspaceNode {
  if (node._tag === "Group") return node.id === groupId ? replacement : node;
  const first = replaceEditorGroup(node.first, groupId, replacement);
  const second = replaceEditorGroup(node.second, groupId, replacement);
  return first === node.first && second === node.second ? node : { ...node, first, second };
}

function mapEditorNode(
  node: EditorWorkspaceNode,
  map: (node: EditorWorkspaceNode) => EditorWorkspaceNode,
): EditorWorkspaceNode {
  if (node._tag === "Group") return map(node);
  const first = mapEditorNode(node.first, map);
  const second = mapEditorNode(node.second, map);
  return map(first === node.first && second === node.second ? node : { ...node, first, second });
}

function removeTabFromGroup(group: EditorGroupNode, tabId: EditorTabId): EditorGroupNode {
  const tabIndex = group.tabIds.indexOf(tabId);
  if (tabIndex < 0) return group;
  const tabIds = group.tabIds.filter((candidate) => candidate !== tabId);
  const fallbackActiveTabId = tabIds[Math.min(tabIndex, tabIds.length - 1)] ?? null;
  return {
    ...group,
    tabIds,
    activeTabId:
      group.activeTabId === tabId
        ? fallbackActiveTabId
        : resolveActiveTabId(tabIds, group.activeTabId),
  };
}

function resolveActiveTabId(
  tabIds: readonly EditorTabId[],
  requestedTabId: EditorTabId | null,
): EditorTabId | null {
  return requestedTabId && tabIds.includes(requestedTabId) ? requestedTabId : (tabIds[0] ?? null);
}
