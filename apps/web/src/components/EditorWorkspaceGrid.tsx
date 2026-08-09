import {
  type DragEvent,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  clampEditorSplitRatio,
  findEditorGroup,
  getVisibleEditorWorkspaceRoot,
  type EditorGroupDropZone,
  type EditorGroupId,
  type EditorGroupNode,
  type EditorSplitId,
  type EditorSplitNode,
  type EditorTabDragData,
  type EditorWorkspace,
  type EditorWorkspaceNode,
} from "~/editorWorkspace";
import { cn } from "~/lib/utils";

import {
  calculateEditorSplitRatio,
  resolveEditorGroupDropZone,
  resolveKeyboardResizeDelta,
} from "./EditorWorkspaceGrid.logic";

interface EditorWorkspaceGridProps {
  workspace: EditorWorkspace;
  renderGroup: (group: EditorGroupNode) => ReactNode;
  onFocusGroup: (groupId: EditorGroupId) => void;
  onResizeSplit: (splitId: EditorSplitId, ratio: number) => void;
  draggedTab?: EditorTabDragData | null;
  onDropTab?: (input: {
    readonly draggedTab: EditorTabDragData;
    readonly targetGroupId: EditorGroupId;
    readonly zone: EditorGroupDropZone;
  }) => void;
  className?: string;
}

interface EditorGroupDropPreview {
  readonly groupId: EditorGroupId;
  readonly zone: EditorGroupDropZone;
}

export function EditorWorkspaceGrid(props: EditorWorkspaceGridProps) {
  const visibleRoot = getVisibleEditorWorkspaceRoot(props.workspace);
  const [dropPreview, setDropPreview] = useState<EditorGroupDropPreview | null>(null);
  useEffect(() => {
    if (!props.draggedTab) setDropPreview(null);
  }, [props.draggedTab]);
  return (
    <div
      className={cn("flex min-h-0 min-w-0 flex-1 overflow-hidden", props.className)}
      data-editor-focus-view={props.workspace.maximizedGroupId ? "true" : "false"}
    >
      <EditorWorkspaceBranch
        node={visibleRoot}
        focusedGroupId={props.workspace.focusedGroupId}
        renderGroup={props.renderGroup}
        onFocusGroup={props.onFocusGroup}
        onResizeSplit={props.onResizeSplit}
        workspace={props.workspace}
        draggedTab={props.draggedTab ?? null}
        onDropTab={props.onDropTab}
        dropPreview={dropPreview}
        setDropPreview={setDropPreview}
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
  workspace: EditorWorkspace;
  draggedTab: EditorTabDragData | null;
  onDropTab: EditorWorkspaceGridProps["onDropTab"];
  dropPreview: EditorGroupDropPreview | null;
  setDropPreview: (preview: EditorGroupDropPreview | null) => void;
}

function EditorWorkspaceBranch(props: EditorWorkspaceBranchProps) {
  if (props.node._tag === "Group") {
    const group = props.node;
    return (
      <section
        className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background"
        data-editor-group={group.id}
        data-editor-group-focused={group.id === props.focusedGroupId ? "true" : "false"}
        onPointerDown={() => props.onFocusGroup(group.id)}
      >
        {props.renderGroup(group)}
        {props.draggedTab && props.onDropTab ? (
          <EditorGroupDropTarget
            workspace={props.workspace}
            group={group}
            draggedTab={props.draggedTab}
            preview={props.dropPreview?.groupId === group.id ? props.dropPreview : null}
            onPreviewChange={props.setDropPreview}
            onDrop={props.onDropTab}
          />
        ) : null}
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

function canDropEditorTab(
  workspace: EditorWorkspace,
  draggedTab: EditorTabDragData,
  targetGroupId: EditorGroupId,
  zone: EditorGroupDropZone,
): boolean {
  const sourceGroup = findEditorGroup(workspace.root, draggedTab.sourceGroupId);
  const targetGroup = findEditorGroup(workspace.root, targetGroupId);
  if (!sourceGroup?.tabIds.includes(draggedTab.sourceTabId) || !targetGroup) return false;
  if (zone === "center") return sourceGroup.id !== targetGroup.id;
  return sourceGroup.id !== targetGroup.id || sourceGroup.tabIds.length > 1;
}

function EditorGroupDropTarget(props: {
  readonly workspace: EditorWorkspace;
  readonly group: EditorGroupNode;
  readonly draggedTab: EditorTabDragData;
  readonly preview: EditorGroupDropPreview | null;
  readonly onPreviewChange: (preview: EditorGroupDropPreview | null) => void;
  readonly onDrop: NonNullable<EditorWorkspaceGridProps["onDropTab"]>;
}) {
  const resolveDropZone = (event: DragEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return resolveEditorGroupDropZone({
      clientX: event.clientX,
      clientY: event.clientY,
      bounds: {
        left: bounds.left,
        top: bounds.top,
        width: bounds.width,
        height: bounds.height,
      },
    });
  };
  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    const zone = resolveDropZone(event);
    if (!zone || !canDropEditorTab(props.workspace, props.draggedTab, props.group.id, zone)) {
      event.dataTransfer.dropEffect = "none";
      props.onPreviewChange(null);
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    if (props.preview?.zone !== zone) {
      props.onPreviewChange({ groupId: props.group.id, zone });
    }
  };
  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    const relatedTarget = event.relatedTarget;
    if (relatedTarget instanceof Node && event.currentTarget.contains(relatedTarget)) return;
    props.onPreviewChange(null);
  };
  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    const zone = resolveDropZone(event);
    if (!zone || !canDropEditorTab(props.workspace, props.draggedTab, props.group.id, zone)) return;
    event.preventDefault();
    event.stopPropagation();
    props.onPreviewChange(null);
    props.onDrop({ draggedTab: props.draggedTab, targetGroupId: props.group.id, zone });
  };

  return (
    <div
      className="absolute inset-0 z-50"
      data-editor-group-drop-target={props.group.id}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {props.preview ? <EditorGroupDropOverlay zone={props.preview.zone} /> : null}
    </div>
  );
}

function EditorGroupDropOverlay({ zone }: { readonly zone: EditorGroupDropZone }) {
  const label =
    zone === "center"
      ? "Swap editor groups"
      : zone === "up"
        ? "Split above"
        : zone === "down"
          ? "Split below"
          : zone === "left"
            ? "Split left"
            : "Split right";
  return (
    <div
      className={cn(
        "pointer-events-none absolute flex items-center justify-center rounded-lg bg-primary/20 ring-2 ring-inset ring-primary/80 transition-[inset,width,height,opacity] duration-100 ease-out",
        zone === "center" && "inset-2",
        zone === "left" && "inset-y-2 left-2 w-[calc(50%-0.5rem)]",
        zone === "right" && "inset-y-2 right-2 w-[calc(50%-0.5rem)]",
        zone === "up" && "inset-x-2 top-2 h-[calc(50%-0.5rem)]",
        zone === "down" && "inset-x-2 bottom-2 h-[calc(50%-0.5rem)]",
      )}
      data-editor-drop-zone={zone}
    >
      <span className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground shadow-sm">
        {label}
      </span>
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
