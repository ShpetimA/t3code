import type { ReactNode } from "react";

import { isElectron } from "../env";
import { cn } from "../lib/utils";
import { COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS } from "../workspaceTitlebar";

/** Page-level workspace header that adapts to parent-owned top-tab chrome. */
export function WorkspacePageHeader({ children }: { readonly children: ReactNode }) {
  return (
    <header
      data-electron={isElectron ? "" : undefined}
      data-workspace-page-header=""
      className={cn(
        "flex h-[var(--workspace-topbar-height)] min-h-[var(--workspace-topbar-height)] shrink-0 items-center transition-[padding-left] duration-200 ease-linear motion-reduce:transition-none",
        isElectron
          ? "drag-region px-5 wco:pr-[calc(100vw-env(titlebar-area-width)-env(titlebar-area-x)+1em)]"
          : "px-3 sm:px-5",
        COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS,
      )}
    >
      {children}
    </header>
  );
}
