import type { ContextMenuItem } from "@t3tools/contracts";
import type { SnoozePreset } from "@t3tools/client-runtime/state/thread-settled";

/**
 * Ids for the per-thread action menu. Snooze presets are dispatched as
 * `snooze:<presetId>` so the union stays closed while the preset list
 * remains data-driven.
 */
export type ThreadLifecycleMenuId =
  | "pin"
  | "unpin"
  | "settle"
  | "unsettle"
  | "snooze"
  | `snooze:${string}`
  | "unsnooze";

export type ThreadActionMenuId =
  | ThreadLifecycleMenuId
  | "new-thread-on-branch"
  | "rename"
  | "regenerate-title"
  | "mark-unread"
  | "copy-path"
  | "copy-branch"
  | "copy-thread-id"
  | "archive"
  | "delete";

/** Whether a successful full-menu action removes a server thread from its tab context. */
export function closesThreadTabAfterSuccessfulAction(action: ThreadActionMenuId): boolean {
  return (
    action === "settle" ||
    action === "archive" ||
    action === "delete" ||
    action.startsWith("snooze:")
  );
}

interface ThreadLifecycleMenuState {
  readonly isPinned: boolean;
  readonly isSettled: boolean;
  readonly isSnoozed: boolean;
  readonly canSnoozeNow: boolean;
  readonly supports: {
    readonly settlement: boolean;
    readonly snooze: boolean;
    readonly pinning: boolean;
  };
  readonly snoozePresets: ReadonlyArray<SnoozePreset>;
}

/** State used by the full thread action menu. */
export interface ThreadActionMenuState extends ThreadLifecycleMenuState {
  readonly branch: string | null;
  readonly isRegeneratingTitle: boolean;
  /** Archive rejects a thread with an active turn, so disable it here rather than let the action fail. */
  readonly isRunning: boolean;
  readonly supports: ThreadLifecycleMenuState["supports"] & {
    readonly titleRegeneration: boolean;
  };
}

/**
 * Single source for every single-thread action menu: Sidebar, chat header,
 * and global tabs share labels, ordering, and capability gating.
 */
export function buildThreadActionMenuItems(
  state: ThreadActionMenuState,
): ReadonlyArray<ContextMenuItem<ThreadActionMenuId>> {
  return [
    ...(state.branch
      ? [
          {
            id: "new-thread-on-branch" as const,
            label: `New thread on ${state.branch}`,
          },
        ]
      : []),
    ...buildThreadLifecycleMenuItems(state, {
      settle: "Settle thread",
      snooze: "Snooze",
    }),
    { id: "rename", label: "Rename thread" },
    ...(state.supports.titleRegeneration
      ? [
          {
            id: "regenerate-title" as const,
            label: state.isRegeneratingTitle ? "Regenerating…" : "Regenerate title",
            disabled: state.isRegeneratingTitle,
          },
        ]
      : []),
    { id: "mark-unread", label: "Mark unread" },
    { id: "copy-path", label: "Copy path", icon: "copy" },
    ...(state.branch ? [{ id: "copy-branch" as const, label: "Copy branch", icon: "copy" }] : []),
    { id: "copy-thread-id", label: "Copy thread ID", icon: "copy" },
    // Archive removes the thread from the sidebar while keeping its
    // conversation under Settings > Archived threads — distinct from Settle
    // (stays visible in the Settled shelf) and Delete (clears history for
    // good), so it sits beside Delete without borrowing its destructive
    // styling.
    { id: "archive", label: "Archive thread", disabled: state.isRunning },
    { id: "delete", label: "Delete", destructive: true, icon: "trash" },
  ];
}

function buildThreadLifecycleMenuItems(
  state: ThreadLifecycleMenuState,
  labels: { readonly settle: string; readonly snooze: string },
): ReadonlyArray<ContextMenuItem<ThreadLifecycleMenuId>> {
  return [
    ...(state.supports.pinning
      ? [
          state.isPinned
            ? { id: "unpin" as const, label: "Unpin thread" }
            : { id: "pin" as const, label: "Pin thread" },
        ]
      : []),
    // Both lifecycle actions stay available on pinned threads: settling
    // clears the pin ("done" beats "keep on top"), and snoozing hides the
    // card until wake with the pin intact.
    ...(state.supports.settlement
      ? [
          state.isSettled
            ? { id: "unsettle" as const, label: "Un-settle thread" }
            : { id: "settle" as const, label: labels.settle },
        ]
      : []),
    ...(state.supports.snooze
      ? [
          state.isSnoozed
            ? { id: "unsnooze" as const, label: "Wake thread" }
            : {
                id: "snooze" as const,
                label: labels.snooze,
                disabled: !state.canSnoozeNow,
                children: state.snoozePresets.map((preset) => ({
                  id: `snooze:${preset.id}` as const,
                  label: `${preset.label} (${preset.whenLabel})`,
                })),
              },
        ]
      : []),
  ];
}
