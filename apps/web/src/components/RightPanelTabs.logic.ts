import type { ContextMenuItem } from "@t3tools/contracts";

import type { AdjacentEditorGroups, EditorSplitDirection } from "~/editorWorkspace";
import type { RightPanelSurface } from "~/rightPanelStore";

export type EditorTabContextTarget =
  | { readonly _tag: "Thread" }
  | { readonly _tag: "Surface"; readonly surface: RightPanelSurface };

export type TabContextMenuAction =
  | "copy-path"
  | "close"
  | "close-others"
  | "close-to-right"
  | "close-all"
  | "move-tab-left"
  | "move-tab-right"
  | "move-to-group"
  | "move-group-up"
  | "move-group-down"
  | "move-group-left"
  | "move-group-right"
  | "split-right"
  | "split-down"
  | "split-and-move"
  | "move-up"
  | "move-down"
  | "move-left"
  | "move-right"
  | "merge-group"
  | "merge-group-up"
  | "merge-group-down"
  | "merge-group-left"
  | "merge-group-right";

/** A non-splitting tab or group operation selected from a tab context menu. */
export type EditorTabLayoutAction =
  | { readonly _tag: "Reorder"; readonly direction: "left" | "right" }
  | { readonly _tag: "MoveToGroup"; readonly direction: EditorSplitDirection }
  | { readonly _tag: "MergeGroup"; readonly direction: EditorSplitDirection };

export function buildEditorTabContextMenuItems(input: {
  readonly target: EditorTabContextTarget;
  readonly surfaceCount: number;
  readonly surfaceIndex: number;
  readonly tabCount: number;
  readonly tabIndex: number;
  readonly adjacentGroups: AdjacentEditorGroups;
  readonly reorderAvailable: boolean;
  readonly moveToGroupAvailable: boolean;
  readonly mergeGroupAvailable: boolean;
  readonly copyToSplitAvailable: boolean;
  readonly moveToSplitAvailable: boolean;
}): readonly ContextMenuItem<TabContextMenuAction>[] {
  const items: ContextMenuItem<TabContextMenuAction>[] = [];
  if (input.target._tag === "Surface") {
    if (input.target.surface.kind === "file") {
      items.push({ id: "copy-path", label: "Copy path" });
    }
    items.push(
      { id: "close", label: "Close" },
      {
        id: "close-others",
        label: "Close others",
        disabled: input.surfaceCount <= 1,
      },
      {
        id: "close-to-right",
        label: "Close to the right",
        disabled: input.surfaceIndex >= input.surfaceCount - 1,
      },
      {
        id: "close-all",
        label: "Close all",
        disabled: input.surfaceCount === 0,
      },
    );
  }
  if (input.reorderAvailable) {
    items.push(
      { id: "move-tab-left", label: "Move Left", disabled: input.tabIndex <= 0 },
      {
        id: "move-tab-right",
        label: "Move Right",
        disabled: input.tabIndex < 0 || input.tabIndex >= input.tabCount - 1,
      },
    );
  }
  const moveGroupItems = directionalGroupItems("move", input.adjacentGroups);
  if (input.moveToGroupAvailable && moveGroupItems.length > 0) {
    items.push({ id: "move-to-group", label: "Move into Group", children: moveGroupItems });
  }
  if (input.copyToSplitAvailable || input.moveToSplitAvailable) {
    items.push(
      { id: "split-right", label: "Split Right", disabled: !input.copyToSplitAvailable },
      { id: "split-down", label: "Split Down", disabled: !input.copyToSplitAvailable },
      {
        id: "split-and-move",
        label: "Split & Move",
        disabled: !input.moveToSplitAvailable,
        children: [
          { id: "move-up", label: "Split Up" },
          { id: "move-down", label: "Split Down" },
          { id: "move-left", label: "Split Left" },
          { id: "move-right", label: "Split Right" },
        ],
      },
    );
  }
  const mergeGroupItems = directionalGroupItems("merge", input.adjacentGroups);
  if (input.mergeGroupAvailable && mergeGroupItems.length > 0) {
    items.push({ id: "merge-group", label: "Merge Group With", children: mergeGroupItems });
  }
  return items;
}

function directionalGroupItems(
  operation: "move" | "merge",
  groups: AdjacentEditorGroups,
): readonly ContextMenuItem<TabContextMenuAction>[] {
  return (["up", "down", "left", "right"] as const).flatMap((direction) => {
    if (!groups[direction]) return [];
    const label =
      direction === "up"
        ? "Above"
        : direction === "down"
          ? "Below"
          : direction === "left"
            ? "Left"
            : "Right";
    return [{ id: directionalGroupActionId(operation, direction), label }];
  });
}

function directionalGroupActionId(
  operation: "move" | "merge",
  direction: EditorSplitDirection,
): TabContextMenuAction {
  if (operation === "move") {
    switch (direction) {
      case "up":
        return "move-group-up";
      case "down":
        return "move-group-down";
      case "left":
        return "move-group-left";
      case "right":
        return "move-group-right";
    }
  }
  switch (direction) {
    case "up":
      return "merge-group-up";
    case "down":
      return "merge-group-down";
    case "left":
      return "merge-group-left";
    case "right":
      return "merge-group-right";
  }
}

export function resolveEditorTabSplitAction(
  action: TabContextMenuAction | null,
): { readonly mode: "copy" | "move"; readonly direction: EditorSplitDirection } | null {
  switch (action) {
    case "split-right":
      return { mode: "copy", direction: "right" };
    case "split-down":
      return { mode: "copy", direction: "down" };
    case "move-up":
      return { mode: "move", direction: "up" };
    case "move-down":
      return { mode: "move", direction: "down" };
    case "move-left":
      return { mode: "move", direction: "left" };
    case "move-right":
      return { mode: "move", direction: "right" };
    default:
      return null;
  }
}

/** Resolves non-splitting context-menu ids into editor layout operations. */
export function resolveEditorTabLayoutAction(
  action: TabContextMenuAction | null,
): EditorTabLayoutAction | null {
  switch (action) {
    case "move-tab-left":
      return { _tag: "Reorder", direction: "left" };
    case "move-tab-right":
      return { _tag: "Reorder", direction: "right" };
    case "move-group-up":
      return { _tag: "MoveToGroup", direction: "up" };
    case "move-group-down":
      return { _tag: "MoveToGroup", direction: "down" };
    case "move-group-left":
      return { _tag: "MoveToGroup", direction: "left" };
    case "move-group-right":
      return { _tag: "MoveToGroup", direction: "right" };
    case "merge-group-up":
      return { _tag: "MergeGroup", direction: "up" };
    case "merge-group-down":
      return { _tag: "MergeGroup", direction: "down" };
    case "merge-group-left":
      return { _tag: "MergeGroup", direction: "left" };
    case "merge-group-right":
      return { _tag: "MergeGroup", direction: "right" };
    default:
      return null;
  }
}
