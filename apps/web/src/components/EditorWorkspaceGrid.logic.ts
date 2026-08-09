import { clampEditorSplitRatio, type EditorSplitOrientation } from "~/editorWorkspace";

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
