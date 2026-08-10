import {
  mapAtomCommandResult,
  type AtomCommandResult,
} from "@t3tools/client-runtime/state/runtime";
import type { ScopedThreadRef } from "@t3tools/contracts";

import type { OpenPreviewMutation } from "~/browser/openFileInPreview";
import type { RightPanelSurfacePresentation } from "~/threadWorkspaceSurface";
import { transitionThreadWorkspace } from "~/threadWorkspaceStore";

import { openPreviewSession } from "./openPreviewSession";

/** Creates a new browser tab. Reopening an existing tab is a separate UI action. */
export async function addBrowserSurface<E>(input: {
  readonly threadRef: ScopedThreadRef;
  readonly openPreview: OpenPreviewMutation<E>;
  readonly presentation?: RightPanelSurfacePresentation;
}): Promise<AtomCommandResult<void, E>> {
  const result = await openPreviewSession({
    openPreview: input.openPreview,
    threadRef: input.threadRef,
  });
  return mapAtomCommandResult(result, (snapshot) => {
    transitionThreadWorkspace(input.threadRef, {
      _tag: "OpenSurface",
      surface: { _tag: "Browser", tabId: snapshot.tabId },
      ...(input.presentation ? { presentation: input.presentation } : {}),
    });
  });
}
