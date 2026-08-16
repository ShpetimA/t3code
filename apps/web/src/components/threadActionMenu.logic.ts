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

/** Actions available from a server thread's top-tab lifecycle menu. */
export type ThreadTabLifecycleMenuId = ThreadLifecycleMenuId | "archive" | "close-tab";

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

/** Availability state used only by the top-tab lifecycle menu. */
export interface ThreadTabLifecycleMenuState extends ThreadLifecycleMenuState {
  readonly canArchiveNow: boolean;
  /** Unsettled inbox tabs must complete settlement before the view can close. */
  readonly closePolicy: "direct" | "settle-first";
}

/**
 * Single source for the per-thread action menu: the sidebar row's right-click
 * menu and the chat header menu both render exactly this list, so labels,
 * ordering, and capability gating cannot drift between the two surfaces.
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

/** Lifecycle-only menu for a server-thread tab. Parking or archiving a thread
 * also closes that view, while the ordinary tab close remains view-only. */
export function buildThreadTabLifecycleMenuItems(
  state: ThreadTabLifecycleMenuState,
): ReadonlyArray<ContextMenuItem<ThreadTabLifecycleMenuId>> {
  return [
    ...buildThreadLifecycleMenuItems(state, {
      settle: "Settle & close tab",
      snooze: "Snooze & close tab",
    }),
    { id: "archive", label: "Archive & close tab", disabled: !state.canArchiveNow },
    ...(state.closePolicy === "direct"
      ? [{ id: "close-tab" as const, label: "Close tab (keep thread)" }]
      : []),
  ];
}

/** Runs one tab-menu action and applies the close policy only after a
 * close-coupled backend action succeeds. */
export async function dispatchThreadTabLifecycleAction(input: {
  readonly action: ThreadTabLifecycleMenuId;
  readonly run: (action: Exclude<ThreadTabLifecycleMenuId, "close-tab">) => Promise<boolean>;
  readonly closeTab: () => void;
}): Promise<void> {
  if (input.action === "close-tab") {
    input.closeTab();
    return;
  }
  if (input.action === "snooze") return;
  const succeeded = await input.run(input.action);
  if (
    succeeded &&
    (input.action === "settle" || input.action === "archive" || input.action.startsWith("snooze:"))
  ) {
    input.closeTab();
  }
}
