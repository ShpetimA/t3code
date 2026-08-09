import { type KeyboardEvent, type PointerEvent, type ReactNode, useCallback, useRef } from "react";

import {
  clampEditorSplitRatio,
  type EditorGroupId,
  type EditorGroupNode,
  type EditorSplitId,
  type EditorSplitNode,
  type EditorWorkspace,
  type EditorWorkspaceNode,
} from "~/editorWorkspace";
import { cn } from "~/lib/utils";

interface EditorWorkspaceGridProps {
  workspace: EditorWorkspace;
  renderGroup: (group: EditorGroupNode) => ReactNode;
  onFocusGroup: (groupId: EditorGroupId) => void;
  onResizeSplit: (splitId: EditorSplitId, ratio: number) => void;
  className?: string;
}

export function EditorWorkspaceGrid(props: EditorWorkspaceGridProps) {
  return (
    <div className={cn("flex min-h-0 min-w-0 flex-1 overflow-hidden", props.className)}>
      <EditorWorkspaceBranch
        node={props.workspace.root}
        focusedGroupId={props.workspace.focusedGroupId}
        renderGroup={props.renderGroup}
        onFocusGroup={props.onFocusGroup}
        onResizeSplit={props.onResizeSplit}
      />
    </div>
  );
}

interface EditorWorkspaceBranchProps {
  node: EditorWorkspaceNode;
  focusedGroupId: EditorGroupId;
  renderGroup: (group: EditorGroupNode) => ReactNode;
  onFocusGroup: (groupId: EditorGroupId) => void;
  onResizeSplit: (splitId: EditorSplitId, ratio: number) => void;
}

function EditorWorkspaceBranch(props: EditorWorkspaceBranchProps) {
  if (props.node._tag === "Group") {
    const group = props.node;
    return (
      <section
        className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background"
        data-editor-group={group.id}
        data-editor-group-focused={group.id === props.focusedGroupId ? "true" : "false"}
        onPointerDown={() => props.onFocusGroup(group.id)}
      >
        {props.renderGroup(group)}
      </section>
    );
  }

  const horizontal = props.node.orientation === "horizontal";
  return (
    <div
      className={cn(
        "flex min-h-0 min-w-0 flex-1 overflow-hidden",
        horizontal ? "flex-row" : "flex-col",
      )}
      data-editor-split={props.node.id}
      data-editor-split-orientation={props.node.orientation}
    >
      <div
        className="flex min-h-0 min-w-0 shrink-0 overflow-hidden"
        style={{ flexBasis: `${props.node.ratio * 100}%` }}
      >
        <EditorWorkspaceBranch {...props} node={props.node.first} />
      </div>
      <EditorSplitHandle split={props.node} onResize={props.onResizeSplit} />
      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <EditorWorkspaceBranch {...props} node={props.node.second} />
      </div>
    </div>
  );
}

interface DragState {
  readonly pointerId: number;
  readonly start: number;
  readonly size: number;
  readonly startRatio: number;
  pendingRatio: number;
  frameId: number | null;
  readonly target: HTMLDivElement;
}

function EditorSplitHandle(props: {
  split: EditorSplitNode;
  onResize: (splitId: EditorSplitId, ratio: number) => void;
}) {
  const { split, onResize } = props;
  const dragStateRef = useRef<DragState | null>(null);
  const horizontal = split.orientation === "horizontal";

  const releasePointer = useCallback((pointerId: number) => {
    const dragState = dragStateRef.current;
    if (!dragState) return;
    if (dragState.frameId !== null) cancelAnimationFrame(dragState.frameId);
    try {
      if (dragState.target.hasPointerCapture(pointerId)) {
        dragState.target.releasePointerCapture(pointerId);
      }
    } catch {
      // Pointer capture may already have ended when the window loses focus.
    }
    document.body.style.removeProperty("cursor");
    document.body.style.removeProperty("user-select");
    dragStateRef.current = null;
  }, []);

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      const container = event.currentTarget.parentElement;
      if (!container) return;
      const bounds = container.getBoundingClientRect();
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        return;
      }
      dragStateRef.current = {
        pointerId: event.pointerId,
        start: horizontal ? bounds.left : bounds.top,
        size: horizontal ? bounds.width : bounds.height,
        startRatio: split.ratio,
        pendingRatio: split.ratio,
        frameId: null,
        target: event.currentTarget,
      };
      document.body.style.cursor = horizontal ? "col-resize" : "row-resize";
      document.body.style.userSelect = "none";
      event.preventDefault();
      event.stopPropagation();
    },
    [horizontal, split.ratio],
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const dragState = dragStateRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) return;
      const position = horizontal ? event.clientX : event.clientY;
      const ratio = calculateEditorSplitRatio(position, dragState.start, dragState.size);
      if (ratio === null) return;
      dragState.pendingRatio = ratio;
      if (dragState.frameId !== null) return;
      dragState.frameId = requestAnimationFrame(() => {
        const activeDrag = dragStateRef.current;
        if (!activeDrag) return;
        activeDrag.frameId = null;
        onResize(split.id, activeDrag.pendingRatio);
      });
    },
    [horizontal, onResize, split.id],
  );

  const handlePointerUp = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const dragState = dragStateRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) return;
      const finalRatio = dragState.pendingRatio;
      releasePointer(event.pointerId);
      onResize(split.id, finalRatio);
    },
    [onResize, releasePointer, split.id],
  );

  const handlePointerCancel = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const dragState = dragStateRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) return;
      const startRatio = dragState.startRatio;
      releasePointer(event.pointerId);
      onResize(split.id, startRatio);
    },
    [onResize, releasePointer, split.id],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const delta = resolveKeyboardResizeDelta(event.key, split.orientation);
      if (delta === null) return;
      const ratio = clampEditorSplitRatio(split.ratio + delta);
      if (ratio !== null) onResize(split.id, ratio);
      event.preventDefault();
    },
    [onResize, split],
  );

  return (
    <div
      role="separator"
      tabIndex={0}
      aria-label={horizontal ? "Resize editor columns" : "Resize editor rows"}
      aria-orientation={horizontal ? "vertical" : "horizontal"}
      aria-valuemin={10}
      aria-valuemax={90}
      aria-valuenow={Math.round(split.ratio * 100)}
      className={cn(
        "group/split relative z-10 shrink-0 touch-none bg-border outline-none",
        "focus-visible:bg-primary/70",
        horizontal ? "w-px cursor-col-resize" : "h-px cursor-row-resize",
      )}
      onDoubleClick={() => onResize(split.id, 0.5)}
      onKeyDown={handleKeyDown}
      onPointerCancel={handlePointerCancel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <span
        aria-hidden
        className={cn(
          "absolute transition-colors group-hover/split:bg-primary/60 group-focus-visible/split:bg-primary/70",
          horizontal ? "inset-y-0 -left-1 w-[9px]" : "inset-x-0 -top-1 h-[9px]",
        )}
      />
    </div>
  );
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
  orientation: EditorSplitNode["orientation"],
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
