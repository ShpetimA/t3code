import type { ScopedThreadRef } from "@t3tools/contracts";

import { transitionThreadWorkspace } from "./threadWorkspaceStore";
import { resolvePathLinkTarget } from "./terminal-links";

interface OpenDiffFilePrimaryActionInput {
  readonly threadRef: ScopedThreadRef | null;
  readonly filePath: string;
  readonly activeCwd: string | undefined;
  readonly openInEditor: (targetPath: string) => void;
}

export function openDiffFilePrimaryAction({
  threadRef,
  filePath,
  activeCwd,
  openInEditor,
}: OpenDiffFilePrimaryActionInput): void {
  if (threadRef) {
    transitionThreadWorkspace(threadRef, {
      _tag: "OpenSurface",
      surface: { _tag: "File", relativePath: filePath },
    });
    return;
  }

  openInEditor(activeCwd ? resolvePathLinkTarget(filePath, activeCwd) : filePath);
}
