import {
  Columns2Icon,
  Maximize2Icon,
  Minimize2Icon,
  PanelBottomIcon,
  PanelRightIcon,
} from "lucide-react";
import { memo } from "react";

import { Button } from "../ui/button";
import { Toggle } from "../ui/toggle";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

type RightLayoutControl =
  | {
      readonly _tag: "Panel";
      readonly available: boolean;
      readonly open: boolean;
      readonly shortcutLabel: string | null;
      readonly liveAgentCount: number;
      readonly onToggle: () => void;
    }
  | {
      readonly _tag: "Split";
      readonly available: boolean;
      readonly onSplitRight: () => void;
    };

interface PanelLayoutControlsProps {
  terminalAvailable: boolean;
  terminalOpen: boolean;
  terminalShortcutLabel: string | null;
  rightControl: RightLayoutControl;
  onToggleTerminal: () => void;
}

export const PanelLayoutControls = memo(function PanelLayoutControls({
  terminalAvailable,
  terminalOpen,
  terminalShortcutLabel,
  rightControl,
  onToggleTerminal,
}: PanelLayoutControlsProps) {
  return (
    <div
      className="flex h-full shrink-0 items-center gap-1 [-webkit-app-region:no-drag]"
      data-panel-layout-controls
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <Toggle
              className="shrink-0 [-webkit-app-region:no-drag]"
              pressed={terminalOpen}
              onPressedChange={onToggleTerminal}
              aria-label="Toggle terminal drawer"
              variant="ghost"
              size="sm"
              disabled={!terminalAvailable}
            >
              <PanelBottomIcon className="size-3.5" />
            </Toggle>
          }
        />
        <TooltipPopup side="bottom">
          {terminalAvailable
            ? `Toggle terminal drawer${terminalShortcutLabel ? ` (${terminalShortcutLabel})` : ""}`
            : "Terminal drawer is unavailable"}
        </TooltipPopup>
      </Tooltip>
      {rightControl._tag === "Panel" ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <Toggle
                className="shrink-0 [-webkit-app-region:no-drag]"
                pressed={rightControl.open}
                onPressedChange={rightControl.onToggle}
                aria-label={
                  rightControl.liveAgentCount > 0
                    ? `Toggle right panel, ${rightControl.liveAgentCount} ${rightControl.liveAgentCount === 1 ? "agent" : "agents"} working`
                    : "Toggle right panel"
                }
                variant="ghost"
                size="sm"
                disabled={!rightControl.available}
              >
                <PanelRightIcon className="size-3.5" />
                {rightControl.liveAgentCount > 0 ? (
                  <span
                    aria-hidden
                    className="absolute -top-1 -right-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-info px-1 text-[9px] font-semibold tabular-nums text-white"
                  >
                    {rightControl.liveAgentCount}
                  </span>
                ) : null}
              </Toggle>
            }
          />
          <TooltipPopup side="bottom">
            {rightControl.available
              ? `Toggle right panel${rightControl.shortcutLabel ? ` (${rightControl.shortcutLabel})` : ""}${
                  rightControl.liveAgentCount > 0
                    ? ` · ${rightControl.liveAgentCount} ${rightControl.liveAgentCount === 1 ? "agent" : "agents"} working`
                    : ""
                }`
              : "Right panel is unavailable"}
          </TooltipPopup>
        </Tooltip>
      ) : (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                className="shrink-0 [-webkit-app-region:no-drag]"
                onClick={rightControl.onSplitRight}
                aria-label="Split editor right"
                variant="ghost"
                size="icon-sm"
                disabled={!rightControl.available}
              >
                <Columns2Icon className="size-3.5" />
              </Button>
            }
          />
          <TooltipPopup side="bottom">
            {rightControl.available
              ? "Split editor right"
              : "Open a tool tab before splitting the editor"}
          </TooltipPopup>
        </Tooltip>
      )}
    </div>
  );
});

export const WorkspaceModeControl = memo(function WorkspaceModeControl({
  active,
  onToggle,
}: {
  active: boolean;
  onToggle: () => void;
}) {
  const label = active ? "Return to conversation" : "Open workspace";
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Toggle
            className="shrink-0 [-webkit-app-region:no-drag]"
            pressed={active}
            onPressedChange={onToggle}
            aria-label={label}
            variant="ghost"
            size="sm"
          >
            {active ? (
              <Minimize2Icon className="size-3.5" />
            ) : (
              <Maximize2Icon className="size-3.5" />
            )}
          </Toggle>
        }
      />
      <TooltipPopup side="bottom">{label}</TooltipPopup>
    </Tooltip>
  );
});
