import {
  clampEditorSplitRatio,
  type EditorGroupDropZone,
  type EditorGroupNode,
  type EditorSplitOrientation,
  type EditorSplitNode,
  type EditorWorkspaceNode,
} from "~/editorWorkspace";

const EDITOR_GROUP_EDGE_DROP_RATIO = 0.25;

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

/** Projects the split tree into stable, normalized group and divider geometry. */
export function calculateEditorWorkspaceLayout(root: EditorWorkspaceNode): EditorWorkspaceLayout {
  const groups: EditorWorkspaceGroupLayout[] = [];
  const splits: EditorWorkspaceSplitLayout[] = [];
  collectEditorWorkspaceLayout(root, { top: 0, right: 1, bottom: 1, left: 0 }, groups, splits);
  return { groups, splits };
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

/** Resolves the pane action preview from a pointer position inside a group. */
export function resolveEditorGroupDropZone(input: {
  readonly clientX: number;
  readonly clientY: number;
  readonly bounds: {
    readonly left: number;
    readonly top: number;
    readonly width: number;
    readonly height: number;
  };
}): EditorGroupDropZone | null {
  if (
    !Number.isFinite(input.bounds.width) ||
    !Number.isFinite(input.bounds.height) ||
    input.bounds.width <= 0 ||
    input.bounds.height <= 0
  ) {
    return null;
  }
  const horizontal = (input.clientX - input.bounds.left) / input.bounds.width;
  const vertical = (input.clientY - input.bounds.top) / input.bounds.height;
  if (horizontal < 0 || horizontal > 1 || vertical < 0 || vertical > 1) return null;

  let nearestZone: Exclude<EditorGroupDropZone, "center"> = "left";
  let nearestDistance = horizontal;
  const rightDistance = 1 - horizontal;
  if (rightDistance < nearestDistance) {
    nearestZone = "right";
    nearestDistance = rightDistance;
  }
  if (vertical < nearestDistance) {
    nearestZone = "up";
    nearestDistance = vertical;
  }
  const downDistance = 1 - vertical;
  if (downDistance < nearestDistance) {
    nearestZone = "down";
    nearestDistance = downDistance;
  }
  return nearestDistance <= EDITOR_GROUP_EDGE_DROP_RATIO ? nearestZone : "center";
}

export function calculateEditorSplitRatio(
  pointerPosition: number,
  containerStart: number,
  containerSize: number,
): number | null {
  if (!Number.isFinite(containerSize) || containerSize <= 0) return null;
  return clampEditorSplitRatio((pointerPosition - containerStart) / containerSize);
}

export function resolveKeyboardResizeDelta(
  key: string,
  orientation: EditorSplitOrientation,
): number | null {
  if (orientation === "horizontal") {
    if (key === "ArrowLeft") return -0.05;
    if (key === "ArrowRight") return 0.05;
    return null;
  }
  if (key === "ArrowUp") return -0.05;
  if (key === "ArrowDown") return 0.05;
  return null;
}
