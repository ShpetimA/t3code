import { type ReactNode } from "react";

export type PreviewPanelMode = "sheet" | "embedded";

/**
 * Shared shell for preview surfaces whose parent owns their size.
 */
export function PreviewPanelShell(props: { mode: PreviewPanelMode; children: ReactNode }) {
  return (
    <div
      className="relative flex h-full min-h-0 w-full min-w-0 flex-col self-stretch bg-background"
      data-preview-panel-mode={props.mode}
    >
      {props.children}
    </div>
  );
}
