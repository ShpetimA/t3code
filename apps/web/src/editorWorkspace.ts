export type EditorGroupId = `editor-group:${string}`;
export type EditorSplitId = `editor-split:${string}`;
export type EditorTabId = `editor-tab:${string}`;

export type EditorSplitDirection = "up" | "down" | "left" | "right";
export type EditorSplitOrientation = "horizontal" | "vertical";
export type EditorGroupDropZone = EditorSplitDirection | "center";

/** Identifies the editor tab currently being dragged. */
export interface EditorTabDragData {
  readonly sourceGroupId: EditorGroupId;
  readonly sourceTabId: EditorTabId;
}

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
  readonly maximizedGroupId: EditorGroupId | null;
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

export interface SplitEditorGroupInput {
  readonly sourceGroupId: EditorGroupId;
  readonly targetGroupId: EditorGroupId;
  readonly splitId: EditorSplitId;
  readonly direction: EditorSplitDirection;
}

/** Moves one tab from its current editor group into an existing group. */
export interface MoveEditorTabInput {
  readonly sourceGroupId: EditorGroupId;
  readonly targetGroupId: EditorGroupId;
  readonly tabId: EditorTabId;
  readonly targetIndex?: number;
}

/** Moves one tab into a new split positioned around an existing target group. */
export interface MoveEditorTabToSplitInput extends EditorTabDragData {
  readonly targetGroupId: EditorGroupId;
  readonly newGroupId: EditorGroupId;
  readonly splitId: EditorSplitId;
  readonly direction: EditorSplitDirection;
}

/** The closest editor group in each direction from a source group. */
export interface AdjacentEditorGroups {
  readonly up: EditorGroupId | null;
  readonly down: EditorGroupId | null;
  readonly left: EditorGroupId | null;
  readonly right: EditorGroupId | null;
}

export interface EditorWorkspaceBounds {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export interface EditorWorkspaceGroupLayout {
  readonly group: EditorGroupNode;
  readonly bounds: EditorWorkspaceBounds;
}

export interface EditorWorkspaceSplitLayout {
  readonly split: EditorSplitNode;
  readonly bounds: EditorWorkspaceBounds;
}

export interface EditorWorkspaceLayout {
  readonly groups: readonly EditorWorkspaceGroupLayout[];
  readonly splits: readonly EditorWorkspaceSplitLayout[];
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
    maximizedGroupId: null,
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

/** Returns the full layout or the single group selected for Focus View. */
export function getVisibleEditorWorkspaceRoot(workspace: EditorWorkspace): EditorWorkspaceNode {
  if (!workspace.maximizedGroupId) return workspace.root;
  return findEditorGroup(workspace.root, workspace.maximizedGroupId) ?? workspace.root;
}

export function findTopRightEditorGroup(node: EditorWorkspaceNode): EditorGroupNode {
  return getTopEditorGroups(node).at(-1)!;
}

export function getTopEditorGroups(node: EditorWorkspaceNode): readonly EditorGroupNode[] {
  return calculateEditorWorkspaceLayout(node).groups.flatMap(({ group, bounds }) =>
    bounds.top === 0 ? [group] : [],
  );
}

/** Projects the split tree into stable, normalized group and divider geometry. */
export function calculateEditorWorkspaceLayout(root: EditorWorkspaceNode): EditorWorkspaceLayout {
  const groups: EditorWorkspaceGroupLayout[] = [];
  const splits: EditorWorkspaceSplitLayout[] = [];
  collectEditorWorkspaceLayout(root, { top: 0, right: 1, bottom: 1, left: 0 }, groups, splits);
  return { groups, splits };
}

/** Finds the closest spatially adjacent editor group in every direction. */
export function findAdjacentEditorGroups(
  workspace: EditorWorkspace,
  groupId: EditorGroupId,
): AdjacentEditorGroups {
  const groups = calculateEditorWorkspaceLayout(workspace.root).groups;
  const source = groups.find((entry) => entry.group.id === groupId);
  if (!source) {
    return { up: null, down: null, left: null, right: null };
  }
  return {
    up: findDirectionalEditorGroup(groups, source, "up"),
    down: findDirectionalEditorGroup(groups, source, "down"),
    left: findDirectionalEditorGroup(groups, source, "left"),
    right: findDirectionalEditorGroup(groups, source, "right"),
  };
}

export function focusEditorGroup(
  workspace: EditorWorkspace,
  groupId: EditorGroupId,
): EditorWorkspace {
  return findEditorGroup(workspace.root, groupId)
    ? {
        ...workspace,
        focusedGroupId: groupId,
        maximizedGroupId: workspace.maximizedGroupId ? groupId : null,
      }
    : workspace;
}

/** Toggles Focus View for one editor group without changing the split tree. */
export function toggleMaximizedEditorGroup(
  workspace: EditorWorkspace,
  groupId = workspace.focusedGroupId,
): EditorWorkspace {
  if (!findEditorGroup(workspace.root, groupId)) return workspace;
  return {
    ...workspace,
    focusedGroupId: groupId,
    maximizedGroupId: workspace.maximizedGroupId === groupId ? null : groupId,
  };
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
    maximizedGroupId: workspace.maximizedGroupId ? groupId : null,
  };
}

/** Reorders a tab within one group while preserving the active tab. */
export function reorderEditorTab(
  workspace: EditorWorkspace,
  input: {
    readonly groupId: EditorGroupId;
    readonly tabId: EditorTabId;
    readonly targetIndex: number;
  },
): EditorWorkspace {
  const group = findEditorGroup(workspace.root, input.groupId);
  const sourceIndex = group?.tabIds.indexOf(input.tabId) ?? -1;
  if (
    !group ||
    sourceIndex < 0 ||
    !Number.isSafeInteger(input.targetIndex) ||
    input.targetIndex < 0 ||
    input.targetIndex >= group.tabIds.length ||
    sourceIndex === input.targetIndex
  ) {
    return workspace;
  }
  const tabIds = [...group.tabIds];
  tabIds.splice(sourceIndex, 1);
  tabIds.splice(input.targetIndex, 0, input.tabId);
  return updateEditorGroup(workspace, group.id, (current) => ({ ...current, tabIds }));
}

/** Moves a tab into an existing group and collapses an emptied source group. */
export function moveEditorTabToGroup(
  workspace: EditorWorkspace,
  input: MoveEditorTabInput,
): EditorWorkspace {
  if (input.sourceGroupId === input.targetGroupId) return workspace;
  const sourceGroup = findEditorGroup(workspace.root, input.sourceGroupId);
  const targetGroup = findEditorGroup(workspace.root, input.targetGroupId);
  if (!sourceGroup?.tabIds.includes(input.tabId) || !targetGroup) return workspace;
  const targetIndex = input.targetIndex ?? targetGroup.tabIds.length;
  if (
    !Number.isSafeInteger(targetIndex) ||
    targetIndex < 0 ||
    targetIndex > targetGroup.tabIds.length ||
    targetGroup.tabIds.includes(input.tabId)
  ) {
    return workspace;
  }
  const sourceAfterMove = removeTabFromGroup(sourceGroup, input.tabId);
  const targetTabIds = [...targetGroup.tabIds];
  targetTabIds.splice(targetIndex, 0, input.tabId);
  let root = mapEditorNode(workspace.root, (node) => {
    if (node._tag !== "Group") return node;
    if (node.id === sourceGroup.id) return sourceAfterMove;
    if (node.id === targetGroup.id) {
      return { ...node, tabIds: targetTabIds, activeTabId: input.tabId };
    }
    return node;
  });
  if (sourceAfterMove.tabIds.length === 0) {
    root = collapseEditorGroup(root, sourceGroup.id) ?? root;
  }
  return {
    root,
    focusedGroupId: targetGroup.id,
    maximizedGroupId: workspace.maximizedGroupId ? targetGroup.id : null,
  };
}

/** Moves a tab to a new split at an arbitrary target group. */
export function moveEditorTabToSplit(
  workspace: EditorWorkspace,
  input: MoveEditorTabToSplitInput,
): EditorWorkspace {
  if (input.sourceGroupId === input.targetGroupId) {
    return splitEditorTab(workspace, {
      sourceGroupId: input.sourceGroupId,
      sourceTabId: input.sourceTabId,
      targetTabId: input.sourceTabId,
      targetGroupId: input.newGroupId,
      splitId: input.splitId,
      direction: input.direction,
      mode: "move",
    });
  }

  const sourceGroup = findEditorGroup(workspace.root, input.sourceGroupId);
  const targetGroup = findEditorGroup(workspace.root, input.targetGroupId);
  if (
    !sourceGroup?.tabIds.includes(input.sourceTabId) ||
    !targetGroup ||
    findEditorGroup(workspace.root, input.newGroupId)
  ) {
    return workspace;
  }

  const sourceAfterMove = removeTabFromGroup(sourceGroup, input.sourceTabId);
  let root = mapEditorNode(workspace.root, (node) =>
    node._tag === "Group" && node.id === sourceGroup.id ? sourceAfterMove : node,
  );
  if (sourceAfterMove.tabIds.length === 0) {
    root = collapseEditorGroup(root, sourceGroup.id) ?? root;
  }
  const targetAfterMove = findEditorGroup(root, targetGroup.id);
  if (!targetAfterMove) return workspace;

  const movedGroup: EditorGroupNode = {
    _tag: "Group",
    id: input.newGroupId,
    tabIds: [input.sourceTabId],
    activeTabId: input.sourceTabId,
  };
  const movedGroupFirst = input.direction === "left" || input.direction === "up";
  const split: EditorSplitNode = {
    _tag: "Split",
    id: input.splitId,
    orientation:
      input.direction === "left" || input.direction === "right" ? "horizontal" : "vertical",
    ratio: 0.5,
    first: movedGroupFirst ? movedGroup : targetAfterMove,
    second: movedGroupFirst ? targetAfterMove : movedGroup,
  };
  root = replaceEditorGroup(root, targetAfterMove.id, split);
  return {
    root,
    focusedGroupId: movedGroup.id,
    maximizedGroupId: null,
  };
}

/** Swaps two editor groups in-place without changing either group's tabs. */
export function swapEditorGroups(
  workspace: EditorWorkspace,
  sourceGroupId: EditorGroupId,
  targetGroupId: EditorGroupId,
): EditorWorkspace {
  if (sourceGroupId === targetGroupId) return workspace;
  const sourceGroup = findEditorGroup(workspace.root, sourceGroupId);
  const targetGroup = findEditorGroup(workspace.root, targetGroupId);
  if (!sourceGroup || !targetGroup) return workspace;
  const root = mapEditorNode(workspace.root, (node) => {
    if (node._tag !== "Group") return node;
    if (node.id === sourceGroup.id) return targetGroup;
    if (node.id === targetGroup.id) return sourceGroup;
    return node;
  });
  return root === workspace.root ? workspace : { ...workspace, root };
}

/** Creates and focuses an empty editor group beside an existing group. */
export function splitEditorGroup(
  workspace: EditorWorkspace,
  input: SplitEditorGroupInput,
): EditorWorkspace {
  const sourceGroup = findEditorGroup(workspace.root, input.sourceGroupId);
  if (!sourceGroup || findEditorGroup(workspace.root, input.targetGroupId)) return workspace;

  const targetGroup: EditorGroupNode = {
    _tag: "Group",
    id: input.targetGroupId,
    tabIds: [],
    activeTabId: null,
  };
  const newGroupFirst = input.direction === "left" || input.direction === "up";
  const split: EditorSplitNode = {
    _tag: "Split",
    id: input.splitId,
    orientation:
      input.direction === "left" || input.direction === "right" ? "horizontal" : "vertical",
    ratio: 0.5,
    first: newGroupFirst ? targetGroup : sourceGroup,
    second: newGroupFirst ? sourceGroup : targetGroup,
  };
  const root = replaceEditorGroup(workspace.root, input.sourceGroupId, split);
  return root === workspace.root
    ? workspace
    : { root, focusedGroupId: targetGroup.id, maximizedGroupId: null };
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
  return { root, focusedGroupId: input.targetGroupId, maximizedGroupId: null };
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
  return focusedGroupId
    ? {
        root,
        focusedGroupId,
        maximizedGroupId: workspace.maximizedGroupId ? focusedGroupId : null,
      }
    : workspace;
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

function collectEditorWorkspaceLayout(
  node: EditorWorkspaceNode,
  bounds: EditorWorkspaceBounds,
  groups: EditorWorkspaceGroupLayout[],
  splits: EditorWorkspaceSplitLayout[],
): void {
  if (node._tag === "Group") {
    groups.push({ group: node, bounds });
    return;
  }
  splits.push({ split: node, bounds });
  if (node.orientation === "horizontal") {
    const splitAt = bounds.left + (bounds.right - bounds.left) * node.ratio;
    collectEditorWorkspaceLayout(node.first, { ...bounds, right: splitAt }, groups, splits);
    collectEditorWorkspaceLayout(node.second, { ...bounds, left: splitAt }, groups, splits);
    return;
  }
  const splitAt = bounds.top + (bounds.bottom - bounds.top) * node.ratio;
  collectEditorWorkspaceLayout(node.first, { ...bounds, bottom: splitAt }, groups, splits);
  collectEditorWorkspaceLayout(node.second, { ...bounds, top: splitAt }, groups, splits);
}

function findDirectionalEditorGroup(
  groups: readonly EditorWorkspaceGroupLayout[],
  source: EditorWorkspaceGroupLayout,
  direction: EditorSplitDirection,
): EditorGroupId | null {
  const candidates = groups.flatMap((candidate, order) => {
    if (candidate.group.id === source.group.id) return [];
    const verticalOverlap =
      Math.min(source.bounds.bottom, candidate.bounds.bottom) -
      Math.max(source.bounds.top, candidate.bounds.top);
    const horizontalOverlap =
      Math.min(source.bounds.right, candidate.bounds.right) -
      Math.max(source.bounds.left, candidate.bounds.left);
    const overlap =
      direction === "left" || direction === "right" ? verticalOverlap : horizontalOverlap;
    if (overlap <= 0) return [];
    const distance = editorGroupDistance(source.bounds, candidate.bounds, direction);
    return distance < 0 ? [] : [{ groupId: candidate.group.id, distance, overlap, order }];
  });
  candidates.sort((left, right) =>
    left.distance !== right.distance
      ? left.distance - right.distance
      : left.overlap !== right.overlap
        ? right.overlap - left.overlap
        : left.order - right.order,
  );
  return candidates[0]?.groupId ?? null;
}

function editorGroupDistance(
  source: EditorWorkspaceBounds,
  candidate: EditorWorkspaceBounds,
  direction: EditorSplitDirection,
): number {
  switch (direction) {
    case "up":
      return source.top - candidate.bottom;
    case "down":
      return candidate.top - source.bottom;
    case "left":
      return source.left - candidate.right;
    case "right":
      return candidate.left - source.right;
  }
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
