import {
  parseScopedThreadKey,
  scopeProjectRef,
  scopeThreadRef,
} from "@t3tools/client-runtime/environment";
import {
  isAtomCommandInterrupted,
  settlePromise,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { type ScopedProjectRef, type ScopedThreadRef, ThreadId } from "@t3tools/contracts";
import { useRouter } from "@tanstack/react-router";
import { useCallback, useRef } from "react";

import { getFallbackThreadIdAfterDelete } from "../components/Sidebar.logic";
import { stackedThreadToast, toastManager } from "../components/ui/toast";
import { readEnvironmentThreadRefs, readThreadShell } from "../state/entities";
import { useGlobalThreadTabsEnabled } from "../threadNavigationMode";
import { buildThreadRouteParams, resolveThreadRouteRef } from "../threadRoutes";
import { useNewThreadHandler } from "./useHandleNewThread";
import { useClientSettings } from "./useSettings";

type ThreadRemovalNavigationInput =
  | { readonly _tag: "Archive"; readonly threadRef: ScopedThreadRef }
  | {
      readonly _tag: "Delete";
      readonly threadRef: ScopedThreadRef;
      readonly removingThreadKeys?: ReadonlySet<string> | undefined;
    };

type ThreadRemovalDestination =
  | { readonly _tag: "Draft"; readonly projectRef: ScopedProjectRef }
  | { readonly _tag: "Thread"; readonly threadRef: ScopedThreadRef }
  | { readonly _tag: "Landing" };

function sameThreadRef(left: ScopedThreadRef | null, right: ScopedThreadRef): boolean {
  return left?.environmentId === right.environmentId && left.threadId === right.threadId;
}

/** Plans fallback routing for sidebar-style thread removal. Global tabs own
 * the same decision in tabs mode, so no competing navigation is produced. */
export function useThreadRemovalNavigation() {
  const router = useRouter();
  const globalTabsEnabled = useGlobalThreadTabsEnabled();
  const sidebarThreadSortOrder = useClientSettings((settings) => settings.sidebarThreadSortOrder);
  const handleNewThread = useNewThreadHandler();
  const handleNewThreadRef = useRef(handleNewThread);
  handleNewThreadRef.current = handleNewThread;

  return useCallback(
    (input: ThreadRemovalNavigationInput): (() => Promise<void>) | null => {
      if (globalTabsEnabled) return null;
      const currentRouteParams =
        router.state.matches[router.state.matches.length - 1]?.params ?? {};
      if (!sameThreadRef(resolveThreadRouteRef(currentRouteParams), input.threadRef)) return null;

      const thread = readThreadShell(input.threadRef);
      if (!thread) return null;
      const destination: ThreadRemovalDestination =
        input._tag === "Archive"
          ? {
              _tag: "Draft",
              projectRef: scopeProjectRef(thread.environmentId, thread.projectId),
            }
          : (() => {
              const removedThreadIds = new Set<ThreadId>([input.threadRef.threadId]);
              for (const threadKey of input.removingThreadKeys ?? []) {
                const removedRef = parseScopedThreadKey(threadKey);
                if (removedRef?.environmentId === input.threadRef.environmentId) {
                  removedThreadIds.add(removedRef.threadId);
                }
              }
              const threads = readEnvironmentThreadRefs(input.threadRef.environmentId).flatMap(
                (threadRef) => {
                  const shell = readThreadShell(threadRef);
                  return shell === null ? [] : [shell];
                },
              );
              const fallbackThreadId = getFallbackThreadIdAfterDelete({
                threads,
                deletedThreadId: input.threadRef.threadId,
                deletedThreadIds: removedThreadIds,
                sortOrder: sidebarThreadSortOrder,
              });
              return fallbackThreadId === null
                ? { _tag: "Landing" }
                : {
                    _tag: "Thread",
                    threadRef: scopeThreadRef(input.threadRef.environmentId, fallbackThreadId),
                  };
            })();

      return async () => {
        const latestRouteParams =
          router.state.matches[router.state.matches.length - 1]?.params ?? {};
        if (!sameThreadRef(resolveThreadRouteRef(latestRouteParams), input.threadRef)) return;

        const result = await settlePromise(async () => {
          switch (destination._tag) {
            case "Draft":
              await handleNewThreadRef.current(destination.projectRef);
              return;
            case "Thread":
              await (readThreadShell(destination.threadRef) === null
                ? router.navigate({ to: "/", replace: true })
                : router.navigate({
                    to: "/$environmentId/$threadId",
                    params: buildThreadRouteParams(destination.threadRef),
                    replace: true,
                  }));
              return;
            case "Landing":
              await router.navigate({ to: "/", replace: true });
              return;
          }
        });
        if (result._tag === "Success" || isAtomCommandInterrupted(result)) return;
        const error = squashAtomCommandFailure(result);
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: "Thread changed, but navigation failed",
            description: error instanceof Error ? error.message : "An error occurred.",
          }),
        );
      };
    },
    [globalTabsEnabled, router, sidebarThreadSortOrder],
  );
}
