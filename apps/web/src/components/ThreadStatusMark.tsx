import { CircleDashedIcon, CircleDotIcon } from "lucide-react";

import { cn } from "../lib/utils";
import type { ThreadStatusPill } from "./Sidebar.logic";

function threadStatusGlyph(label: ThreadStatusPill["label"]): string {
  switch (label) {
    case "Connecting":
      return ">_";
    case "Monitoring":
      return "~";
    case "Pending Approval":
      return "!";
    case "Awaiting Input":
      return "?";
    case "Failed":
      return "×";
    case "Plan Ready":
      return "≡";
    case "Completed":
    case "Working":
      return "";
  }
}

/** Renders the canonical compact mark for a resolved thread status. */
export function ThreadStatusMark(props: {
  readonly status: ThreadStatusPill;
  readonly decorative?: boolean;
  readonly animatePulse?: boolean;
}) {
  const { status, decorative = false, animatePulse = true } = props;
  return (
    <span
      aria-hidden={decorative ? true : undefined}
      aria-label={decorative ? undefined : status.label}
      className={cn(
        "inline-flex size-3 shrink-0 items-center justify-center font-mono text-[10px] leading-none font-semibold",
        status.colorClass,
        animatePulse && status.pulse && "animate-status-pulse motion-reduce:animate-none",
      )}
      role={decorative ? undefined : "img"}
    >
      {status.label === "Working" ? (
        <CircleDashedIcon className="size-3" />
      ) : status.label === "Completed" ? (
        <CircleDotIcon className="size-3" />
      ) : (
        threadStatusGlyph(status.label)
      )}
    </span>
  );
}
