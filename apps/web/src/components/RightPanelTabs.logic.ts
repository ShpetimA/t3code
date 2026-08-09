import type { ContextMenuItem } from "@t3tools/contracts";

import type { EditorSplitDirection } from "~/editorWorkspace";
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
  | "split-right"
  | "split-down"
  | "split-and-move"
  | "move-up"
  | "move-down"
  | "move-left"
  | "move-right";

export function buildEditorTabContextMenuItems(input: {
  readonly target: EditorTabContextTarget;
  readonly surfaceCount: number;
  readonly surfaceIndex: number;
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
  return items;
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
