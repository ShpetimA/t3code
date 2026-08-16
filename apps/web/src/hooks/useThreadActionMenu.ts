import { scopeProjectRef, scopedThreadKey } from "@t3tools/client-runtime/environment";
import {
  type AtomCommandResult,
  isAtomCommandInterrupted,
  settlePromise,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import {
  canSnooze,
  effectiveSettled,
  effectiveSnoozed,
  type ChangeRequestStateLike,
} from "@t3tools/client-runtime/state/thread-settled";
import type { ScopedThreadRef, ThreadId } from "@t3tools/contracts";
import type { TimestampFormat } from "@t3tools/contracts/settings";
import { useCallback } from "react";

import { resolveSnoozePresets, snoozeWakeDescription } from "../components/Sidebar.snooze";
import {
  buildThreadActionMenuItems,
  buildThreadTabLifecycleMenuItems,
  dispatchThreadTabLifecycleAction,
  type ThreadActionMenuId,
  type ThreadLifecycleMenuId,
  type ThreadTabLifecycleMenuId,
} from "../components/threadActionMenu.logic";
import { stackedThreadToast, toastManager } from "../components/ui/toast";
import { threadEnvironment } from "../state/threads";
import { useAtomCommand } from "../state/use-atom-command";
import {
  readEnvironmentSupportsPinning,
  readEnvironmentSupportsSettlement,
  readEnvironmentSupportsSnooze,
  readEnvironmentSupportsTitleRegeneration,
  readThreadShell,
} from "../state/entities";
import { readLocalApi } from "../localApi";
import { resolveGlobalThreadTabLifecycle } from "../globalTabs";
import { useUiStateStore } from "../uiStateStore";
import { useCopyToClipboard } from "./useCopyToClipboard";
import { useNewThreadHandler } from "./useHandleNewThread";
import { useClientSettings } from "./useSettings";
import { useThreadActions } from "./useThreadActions";
import { useThreadRemovalNavigation } from "./useThreadRemovalNavigation";

function failureToast(title: string, error: unknown) {
  toastManager.add(
    stackedThreadToast({
      type: "error",
      title,
      description: error instanceof Error ? error.message : "An error occurred.",
    }),
  );
}

function lifecycleCommandSucceeded(
  title: string,
  result: AtomCommandResult<unknown, unknown>,
): boolean {
  if (result._tag === "Success") return true;
  if (!isAtomCommandInterrupted(result)) {
    failureToast(title, squashAtomCommandFailure(result));
  }
  return false;
}

type ThreadLifecycleActions = Pick<
  ReturnType<typeof useThreadActions>,
  | "settleThread"
  | "unsettleThread"
  | "snoozeThread"
  | "unsnoozeThread"
  | "pinThread"
  | "unpinThread"
>;

function isThreadLifecycleMenuAction(action: ThreadActionMenuId): action is ThreadLifecycleMenuId {
  return (
    action === "pin" ||
    action === "unpin" ||
    action === "settle" ||
    action === "unsettle" ||
    action === "snooze" ||
    action === "unsnooze" ||
    action.startsWith("snooze:")
  );
}

function isSnoozePresetMenuAction(action: ThreadLifecycleMenuId): action is `snooze:${string}` {
  return action.startsWith("snooze:");
}

async function runThreadLifecycleMenuAction(input: {
  readonly action: ThreadLifecycleMenuId;
  readonly threadRef: ScopedThreadRef;
  readonly snoozePresets: ReturnType<typeof resolveSnoozePresets>;
  readonly timestampFormat: TimestampFormat;
  readonly actions: ThreadLifecycleActions;
}): Promise<boolean> {
  if (input.action === "snooze") return false;
  if (isSnoozePresetMenuAction(input.action)) {
    const preset = input.snoozePresets.find(
      (candidate) => `snooze:${candidate.id}` === input.action,
    );
    if (!preset) return false;
    const succeeded = lifecycleCommandSucceeded(
      "Failed to snooze thread",
      await input.actions.snoozeThread(input.threadRef, preset.snoozedUntil),
    );
    if (!succeeded) return false;
    toastManager.add(
      stackedThreadToast({
        type: "success",
        title: `Snoozed until ${snoozeWakeDescription(preset.snoozedUntil, new Date(), input.timestampFormat)}`,
        timeout: 5_000,
        actionProps: {
          children: "Undo",
          onClick: () => {
            void input.actions.unsnoozeThread(input.threadRef).then((undone) => {
              if (undone._tag === "Failure" && !isAtomCommandInterrupted(undone)) {
                failureToast("Failed to wake thread", squashAtomCommandFailure(undone));
              }
            });
          },
        },
      }),
    );
    return true;
  }

  switch (input.action) {
    case "settle":
      return lifecycleCommandSucceeded(
        "Failed to settle thread",
        await input.actions.settleThread(input.threadRef),
      );
    case "unsettle":
      return lifecycleCommandSucceeded(
        "Failed to un-settle thread",
        await input.actions.unsettleThread(input.threadRef),
      );
    case "unsnooze":
      return lifecycleCommandSucceeded(
        "Failed to wake thread",
        await input.actions.unsnoozeThread(input.threadRef),
      );
    case "pin":
      return lifecycleCommandSucceeded(
        "Failed to pin thread",
        await input.actions.pinThread(input.threadRef),
      );
    case "unpin":
      return lifecycleCommandSucceeded(
        "Failed to unpin thread",
        await input.actions.unpinThread(input.threadRef),
      );
  }
}

/**
 * The per-thread action menu (pin, settle, snooze, rename, copy, delete…) as
 * a self-contained hook, for surfaces other than the sidebar row — today the
 * chat header. Renders through the native context-menu bridge and dispatches
 * through the same mutations the sidebar uses.
 *
 * Unlike the sidebar, settle and snooze here never navigate away: the caller
 * is acting on the thread they are reading, and ChatView's parked-thread
 * banner already offers the way back.
 */
export function useThreadActionMenu(input: {
  readonly threadRef: ScopedThreadRef | null;
  /** Fallback for "Copy path" when the thread has no worktree. */
  readonly projectCwd: string | null;
  /** PR state feeding auto-settle classification, as resolved by the caller. */
  readonly changeRequestState: ChangeRequestStateLike | null;
  readonly onStartRename: () => void;
}) {
  const { threadRef, projectCwd, changeRequestState, onStartRename } = input;
  const {
    settleThread,
    unsettleThread,
    snoozeThread,
    unsnoozeThread,
    pinThread,
    unpinThread,
    archiveThread,
    deleteThread,
  } = useThreadActions();
  const updateThreadMetadata = useAtomCommand(threadEnvironment.updateMetadata, {
    reportFailure: false,
  });
  const planThreadRemovalNavigation = useThreadRemovalNavigation();
  const handleNewThread = useNewThreadHandler();
  const markThreadUnread = useUiStateStore((s) => s.markThreadUnread);
  const autoSettleAfterDays = useClientSettings((s) => s.sidebarAutoSettleAfterDays);
  const autoSettleOnMerge = useClientSettings((s) => s.sidebarAutoSettleOnMerge);
  const confirmThreadDelete = useClientSettings((s) => s.confirmThreadDelete);
  const confirmThreadArchive = useClientSettings((s) => s.confirmThreadArchive);
  const timestampFormat = useClientSettings((s) => s.timestampFormat);
  const { copyToClipboard: copyPathToClipboard } = useCopyToClipboard<{ path: string }>({
    onCopy: ({ path }) => {
      toastManager.add({ type: "success", title: "Path copied", description: path });
    },
    onError: (error) => failureToast("Failed to copy path", error),
  });
  const { copyToClipboard: copyBranchToClipboard } = useCopyToClipboard<{ branch: string }>({
    target: "branch name",
    onCopy: ({ branch }) => {
      toastManager.add({ type: "success", title: "Branch copied", description: branch });
    },
    onError: (error) => failureToast("Failed to copy branch", error),
  });
  const { copyToClipboard: copyThreadIdToClipboard } = useCopyToClipboard<{ threadId: ThreadId }>({
    onCopy: ({ threadId }) => {
      toastManager.add({ type: "success", title: "Thread ID copied", description: threadId });
    },
    onError: (error) => failureToast("Failed to copy thread ID", error),
  });

  const openMenu = useCallback(
    (position: { x: number; y: number }) => {
      if (threadRef === null) return;
      void (async () => {
        const api = readLocalApi();
        if (!api) return;
        // Snapshot at open time — the menu is modal, so state read now is
        // what the user is looking at.
        const thread = readThreadShell(threadRef);
        if (!thread) return;
        const now = new Date();
        const supports = {
          settlement: readEnvironmentSupportsSettlement(threadRef.environmentId),
          snooze: readEnvironmentSupportsSnooze(threadRef.environmentId),
          pinning: readEnvironmentSupportsPinning(threadRef.environmentId),
          titleRegeneration: readEnvironmentSupportsTitleRegeneration(threadRef.environmentId),
        };
        const isRegeneratingTitle = thread.titleRegeneration != null;
        const snoozePresets = resolveSnoozePresets(now, timestampFormat);
        const items = buildThreadActionMenuItems({
          branch: thread.branch ?? null,
          isPinned: thread.pinnedAt != null,
          isSettled:
            supports.settlement &&
            effectiveSettled(thread, {
              // Minute-quantized like useNowMinute, so this classification
              // can never disagree with the sidebar partition or ChatView's
              // parked-thread banner within the same minute.
              now: `${now.toISOString().slice(0, 16)}:00.000Z`,
              autoSettleAfterDays,
              autoSettleOnMerge,
              changeRequestState,
            }),
          isSnoozed: supports.snooze && effectiveSnoozed(thread, { now: now.toISOString() }),
          canSnoozeNow: canSnooze(thread, { now: now.toISOString() }),
          isRegeneratingTitle,
          isRunning: thread.session?.status === "running" && thread.session.activeTurnId != null,
          supports,
          snoozePresets,
        });
        const clicked = await settlePromise(() => api.contextMenu.show(items, position));
        if (clicked._tag === "Failure" || clicked.value === null) return;
        const action: ThreadActionMenuId = clicked.value;
        if (isThreadLifecycleMenuAction(action)) {
          await runThreadLifecycleMenuAction({
            action,
            threadRef,
            snoozePresets,
            timestampFormat,
            actions: {
              settleThread,
              unsettleThread,
              snoozeThread,
              unsnoozeThread,
              pinThread,
              unpinThread,
            },
          });
          return;
        }
        const reportFailure = async (
          title: string,
          run: () => Promise<AtomCommandResult<unknown, unknown>>,
        ) => {
          const result = await run();
          if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
            failureToast(title, squashAtomCommandFailure(result));
          }
        };
        switch (action) {
          case "new-thread-on-branch": {
            // Explicit branch carry-over: reuse the thread's worktree when it
            // has one, otherwise its branch on the local checkout.
            const result = await settlePromise(() =>
              handleNewThread(scopeProjectRef(threadRef.environmentId, thread.projectId), {
                branch: thread.branch,
                worktreePath: thread.worktreePath,
                envMode: thread.worktreePath ? "worktree" : "local",
                startFromOrigin: false,
              }),
            );
            if (result._tag === "Failure") {
              failureToast("Could not create thread", squashAtomCommandFailure(result));
            }
            return;
          }
          case "rename":
            onStartRename();
            return;
          case "regenerate-title":
            if (isRegeneratingTitle) return;
            await reportFailure("Failed to regenerate thread title", () =>
              updateThreadMetadata({
                environmentId: threadRef.environmentId,
                input: { threadId: threadRef.threadId, regenerateTitle: true },
              }),
            );
            return;
          case "mark-unread":
            markThreadUnread(scopedThreadKey(threadRef), thread.latestTurn?.completedAt);
            return;
          case "copy-path": {
            const workspacePath = thread.worktreePath ?? projectCwd;
            if (!workspacePath) {
              toastManager.add(
                stackedThreadToast({
                  type: "error",
                  title: "Path unavailable",
                  description: "This thread does not have a workspace path to copy.",
                }),
              );
              return;
            }
            copyPathToClipboard(workspacePath, { path: workspacePath });
            return;
          }
          case "copy-branch":
            if (thread.branch) {
              copyBranchToClipboard(thread.branch, { branch: thread.branch });
            }
            return;
          case "copy-thread-id":
            copyThreadIdToClipboard(thread.id, { threadId: thread.id });
            return;
          case "archive": {
            if (confirmThreadArchive) {
              const confirmed = await settlePromise(() =>
                api.dialogs.confirm(`Archive thread "${thread.title}"?`),
              );
              if (confirmed._tag === "Failure" || !confirmed.value) return;
            }
            let didArchive = false;
            const result = await archiveThread(threadRef, {
              onArchived: () => {
                didArchive = true;
              },
            });
            if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
              failureToast(
                didArchive ? "Thread archived, but navigation failed" : "Failed to archive thread",
                squashAtomCommandFailure(result),
              );
            }
            return;
          }
          case "delete": {
            if (confirmThreadDelete) {
              const confirmed = await settlePromise(() =>
                api.dialogs.confirm(
                  [
                    `Delete thread "${thread.title}"?`,
                    "This permanently clears conversation history for this thread.",
                  ].join("\n"),
                  { variant: "destructive" },
                ),
              );
              if (confirmed._tag === "Failure" || !confirmed.value) return;
            }
            const navigateAfterDelete = planThreadRemovalNavigation({
              _tag: "Delete",
              threadRef,
            });
            const deleted = await deleteThread(threadRef);
            if (deleted._tag === "Success") {
              await navigateAfterDelete?.();
            } else if (!isAtomCommandInterrupted(deleted)) {
              failureToast("Failed to delete thread", squashAtomCommandFailure(deleted));
            }
            return;
          }
          default:
            return;
        }
      })();
    },
    [
      archiveThread,
      autoSettleAfterDays,
      autoSettleOnMerge,
      changeRequestState,
      confirmThreadArchive,
      confirmThreadDelete,
      copyBranchToClipboard,
      copyPathToClipboard,
      copyThreadIdToClipboard,
      deleteThread,
      handleNewThread,
      markThreadUnread,
      onStartRename,
      pinThread,
      planThreadRemovalNavigation,
      projectCwd,
      settleThread,
      snoozeThread,
      threadRef,
      timestampFormat,
      unpinThread,
      unsettleThread,
      unsnoozeThread,
      updateThreadMetadata,
    ],
  );

  return { openMenu };
}

/** Opens the lightweight lifecycle menu used by top server-thread tabs. The
 * tab strip supplies view closure so successful lifecycle commands and tab
 * selection remain ordered. */
export function useThreadTabLifecycleMenu(input: {
  readonly closeThreadTab: (threadRef: ScopedThreadRef) => void;
}) {
  const { closeThreadTab } = input;
  const {
    archiveThread,
    settleThread,
    unsettleThread,
    snoozeThread,
    unsnoozeThread,
    pinThread,
    unpinThread,
  } = useThreadActions();
  const confirmThreadArchive = useClientSettings((s) => s.confirmThreadArchive);
  const autoSettleAfterDays = useClientSettings((s) => s.sidebarAutoSettleAfterDays);
  const timestampFormat = useClientSettings((s) => s.timestampFormat);

  const openMenu = useCallback(
    (threadRef: ScopedThreadRef, position: { x: number; y: number }) => {
      void (async () => {
        const api = readLocalApi();
        if (!api) return;
        const thread = readThreadShell(threadRef);
        if (!thread) return;
        const now = new Date();
        const nowIso = now.toISOString();
        const supports = {
          settlement: readEnvironmentSupportsSettlement(threadRef.environmentId),
          snooze: readEnvironmentSupportsSnooze(threadRef.environmentId),
          pinning: readEnvironmentSupportsPinning(threadRef.environmentId),
        };
        const lifecycle = resolveGlobalThreadTabLifecycle(thread, {
          now: nowIso,
          autoSettleAfterDays,
          supportsSettlement: supports.settlement,
          supportsSnooze: supports.snooze,
        });
        const snoozePresets = resolveSnoozePresets(now, timestampFormat);
        const items = buildThreadTabLifecycleMenuItems({
          isPinned: thread.pinnedAt != null,
          isSettled: lifecycle.isSettled,
          isSnoozed: supports.snooze && effectiveSnoozed(thread, { now: nowIso }),
          canSnoozeNow: canSnooze(thread, { now: nowIso }),
          canArchiveNow: !(
            thread.session?.status === "running" && thread.session.activeTurnId != null
          ),
          supports,
          snoozePresets,
          closePolicy: lifecycle.closePolicy,
        });
        const clicked = await settlePromise(() => api.contextMenu.show(items, position));
        if (clicked._tag === "Failure" || clicked.value === null) return;
        const action: ThreadTabLifecycleMenuId = clicked.value;
        await dispatchThreadTabLifecycleAction({
          action,
          closeTab: () => closeThreadTab(threadRef),
          run: async (selectedAction) => {
            if (selectedAction === "archive") {
              if (confirmThreadArchive) {
                const confirmed = await settlePromise(() =>
                  api.dialogs.confirm(`Archive thread "${thread.title}"?`),
                );
                if (confirmed._tag === "Failure" || !confirmed.value) return false;
              }
              return lifecycleCommandSucceeded(
                "Failed to archive thread",
                await archiveThread(threadRef),
              );
            }
            return runThreadLifecycleMenuAction({
              action: selectedAction,
              threadRef,
              snoozePresets,
              timestampFormat,
              actions: {
                settleThread,
                unsettleThread,
                snoozeThread,
                unsnoozeThread,
                pinThread,
                unpinThread,
              },
            });
          },
        });
      })();
    },
    [
      archiveThread,
      autoSettleAfterDays,
      closeThreadTab,
      confirmThreadArchive,
      pinThread,
      settleThread,
      snoozeThread,
      timestampFormat,
      unpinThread,
      unsettleThread,
      unsnoozeThread,
    ],
  );

  const settleAndClose = useCallback(
    async (threadRef: ScopedThreadRef): Promise<void> => {
      const succeeded = lifecycleCommandSucceeded(
        "Failed to settle thread",
        await settleThread(threadRef),
      );
      if (succeeded) closeThreadTab(threadRef);
    },
    [closeThreadTab, settleThread],
  );

  const wakeThread = useCallback(
    async (threadRef: ScopedThreadRef): Promise<boolean> =>
      lifecycleCommandSucceeded("Failed to wake thread", await unsnoozeThread(threadRef)),
    [unsnoozeThread],
  );

  return { openMenu, settleAndClose, wakeThread };
}
