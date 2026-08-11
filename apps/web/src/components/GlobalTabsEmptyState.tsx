import { PanelsTopLeftIcon, SquarePenIcon } from "lucide-react";

import { Button } from "./ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "./ui/empty";
import { SidebarInset } from "./ui/sidebar";

/** Landing surface shown when top-tabs mode has no route-backed view open. */
export function GlobalTabsEmptyState(props: {
  readonly onNewThread: () => void;
  readonly onOpenCommandCenter: () => void;
}) {
  return (
    <SidebarInset className="h-full min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground">
      <Empty className="flex-1">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <PanelsTopLeftIcon />
          </EmptyMedia>
          <EmptyTitle>No open tabs</EmptyTitle>
          <EmptyDescription className="text-pretty">
            Start a thread or open another view from the tab bar.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent className="flex-row justify-center gap-2">
          <Button size="sm" onClick={props.onNewThread}>
            <SquarePenIcon />
            New thread
          </Button>
          <Button size="sm" variant="outline" onClick={props.onOpenCommandCenter}>
            <PanelsTopLeftIcon />
            Open command center
          </Button>
        </EmptyContent>
      </Empty>
    </SidebarInset>
  );
}
