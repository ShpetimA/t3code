import type { ThreadWorkspaceState } from "./threadWorkspace";

/**
 * Thread-scoped surface catalog and legacy right-panel presentation state.
 *
 * This is intentionally a shallow workspace model: it owns an ordered set of
 * surface descriptors and the active surface, while each feature continues to
 * own its durable resource state. Browser surfaces point at preview tab ids,
 * terminal surfaces point at terminal session ids, file surfaces point at
 * workspace paths, and diff/files remain singleton surfaces.
 */
export const RIGHT_PANEL_KINDS = [
  "diff",
  "files",
  "file",
  "preview",
  "terminal",
  "agents",
] as const;
export type RightPanelKind = (typeof RIGHT_PANEL_KINDS)[number];

/** Whether opening a surface should reveal the inline conversation panel. */
export type RightPanelSurfacePresentation = "show-panel" | "preserve-panel";

export type RightPanelSurface =
  | { id: `browser:${string}`; kind: "preview"; resourceId: string }
  | { id: "browser:new"; kind: "preview"; resourceId: null }
  | {
      id: `terminal:${string}`;
      kind: "terminal";
      resourceId: string;
      terminalIds: string[];
      activeTerminalId: string;
      splitDirection?: "horizontal" | "vertical";
    }
  | { id: "diff"; kind: "diff" }
  | { id: "files"; kind: "files" }
  | {
      id: `file:${string}`;
      kind: "file";
      relativePath: string;
      revealLine: number | null;
      revealRequestId: number;
    }
  | { id: "agents"; kind: "agents" };

/** Internal surface fields owned by the thread workspace aggregate. */
export type ThreadWorkspaceSurfaceFields = Pick<
  ThreadWorkspaceState,
  "isRightPanelOpen" | "activeSurfaceId" | "surfaces"
>;

/** Describes one pure change to a thread's surface catalog and panel presentation. */
export type ThreadWorkspaceSurfaceTransition =
  | {
      readonly _tag: "OpenKind";
      readonly kind: Exclude<RightPanelKind, "file" | "terminal">;
      readonly presentation?: RightPanelSurfacePresentation;
    }
  | {
      readonly _tag: "OpenBrowser";
      readonly tabId: string | null;
      readonly presentation?: RightPanelSurfacePresentation;
    }
  | {
      readonly _tag: "OpenFile";
      readonly relativePath: string;
      readonly line?: number;
      readonly presentation?: RightPanelSurfacePresentation;
    }
  | {
      readonly _tag: "OpenTerminal";
      readonly terminalId: string;
      readonly presentation?: RightPanelSurfacePresentation;
    }
  | {
      readonly _tag: "SplitTerminal";
      readonly surfaceId: string;
      readonly terminalId: string;
      readonly direction?: "horizontal" | "vertical";
    }
  | { readonly _tag: "ActivateTerminal"; readonly surfaceId: string; readonly terminalId: string }
  | { readonly _tag: "CloseTerminal"; readonly surfaceId: string; readonly terminalId: string }
  | { readonly _tag: "ActivateSurface"; readonly surfaceId: string }
  | { readonly _tag: "SelectSurface"; readonly surfaceId: string }
  | { readonly _tag: "CloseSurface"; readonly surfaceId: string }
  | { readonly _tag: "CloseOtherSurfaces"; readonly surfaceId: string }
  | { readonly _tag: "CloseSurfacesToRight"; readonly surfaceId: string }
  | { readonly _tag: "CloseAllSurfaces" }
  | { readonly _tag: "ReconcileBrowserSurfaces"; readonly tabIds: readonly string[] }
  | { readonly _tag: "ReconcileFileSurfaces"; readonly workspaceAvailable: boolean }
  | { readonly _tag: "ShowPanel" }
  | { readonly _tag: "ClosePanel" }
  | { readonly _tag: "TogglePanelVisibility" }
  | {
      readonly _tag: "ToggleKind";
      readonly kind: Exclude<RightPanelKind, "file" | "terminal">;
    };

export const EMPTY_THREAD_WORKSPACE_SURFACE_FIELDS: ThreadWorkspaceSurfaceFields = {
  isRightPanelOpen: false,
  activeSurfaceId: null,
  surfaces: [],
};

const singletonSurface = (
  kind: Exclude<RightPanelKind, "file" | "preview" | "terminal">,
): RightPanelSurface => {
  switch (kind) {
    case "diff":
      return { id: "diff", kind };
    case "files":
      return { id: "files", kind };
    case "agents":
      return { id: "agents", kind };
  }
};

const browserSurface = (tabId: string | null): RightPanelSurface =>
  tabId
    ? { id: `browser:${tabId}`, kind: "preview", resourceId: tabId }
    : { id: "browser:new", kind: "preview", resourceId: null };

const fileSurface = (
  relativePath: string,
  revealLine: number | null,
  revealRequestId: number,
): RightPanelSurface => ({
  id: `file:${relativePath}`,
  kind: "file",
  relativePath,
  revealLine,
  revealRequestId,
});

const terminalSurface = (terminalId: string): RightPanelSurface => ({
  id: `terminal:${terminalId}`,
  kind: "terminal",
  resourceId: terminalId,
  terminalIds: [terminalId],
  activeTerminalId: terminalId,
});

const upsertSurface = (
  current: ThreadWorkspaceSurfaceFields,
  surface: RightPanelSurface,
  activate = true,
  presentation: RightPanelSurfacePresentation = "show-panel",
): ThreadWorkspaceSurfaceFields => ({
  isRightPanelOpen: presentation === "show-panel" ? true : current.isRightPanelOpen,
  surfaces: current.surfaces.some((entry) => entry.id === surface.id)
    ? current.surfaces
    : [...current.surfaces, surface],
  activeSurfaceId: activate ? surface.id : current.activeSurfaceId,
});

function normalizeRevealLine(line: number | undefined): number | null {
  if (line === undefined || !Number.isFinite(line)) return null;
  return Math.max(1, Math.trunc(line));
}

export function parsePersistedThreadWorkspaceSurfaces(persistedState: unknown): {
  byThreadKey: Record<string, ThreadWorkspaceSurfaceFields>;
} {
  if (!persistedState || typeof persistedState !== "object") {
    return { byThreadKey: {} };
  }
  const byThreadKey =
    "byThreadKey" in persistedState &&
    persistedState.byThreadKey &&
    typeof persistedState.byThreadKey === "object"
      ? Object.fromEntries(
          Object.entries(persistedState.byThreadKey as Record<string, ThreadWorkspaceSurfaceFields>).map(
            ([threadKey, threadState]) => {
              const validThreadState =
                threadState && typeof threadState === "object" ? threadState : null;
              const surfaces = Array.isArray(validThreadState?.surfaces)
                ? validThreadState.surfaces.flatMap<RightPanelSurface>((surface) => {
                    // Dropped surface kind: plans now render inline in the
                    // transcript (v9).
                    if ((surface as { kind?: string }).kind === "plan") return [];
                    if (surface.kind === "file") {
                      const revealLine =
                        typeof surface.revealLine === "number" &&
                        Number.isFinite(surface.revealLine)
                          ? Math.max(1, Math.trunc(surface.revealLine))
                          : null;
                      const revealRequestId =
                        typeof surface.revealRequestId === "number" &&
                        Number.isSafeInteger(surface.revealRequestId) &&
                        surface.revealRequestId >= 0
                          ? surface.revealRequestId
                          : 0;
                      return [{ ...surface, revealLine, revealRequestId }];
                    }
                    if (surface.kind !== "terminal") return [surface];
                    if (
                      !("resourceId" in surface) ||
                      typeof surface.resourceId !== "string" ||
                      surface.id !== `terminal:${surface.resourceId}`
                    ) {
                      return [];
                    }
                    const terminalIds =
                      "terminalIds" in surface && Array.isArray(surface.terminalIds)
                        ? [
                            ...new Set(
                              surface.terminalIds.filter(
                                (terminalId: unknown): terminalId is string =>
                                  typeof terminalId === "string",
                              ),
                            ),
                          ]
                        : [surface.resourceId];
                    const activeTerminalId =
                      "activeTerminalId" in surface &&
                      typeof surface.activeTerminalId === "string" &&
                      terminalIds.includes(surface.activeTerminalId)
                        ? surface.activeTerminalId
                        : (terminalIds[0] ?? surface.resourceId);
                    return [
                      {
                        ...surface,
                        terminalIds: terminalIds.length > 0 ? terminalIds : [surface.resourceId],
                        activeTerminalId,
                      },
                    ];
                  })
                : [];
              const persistedActiveSurfaceId = surfaces.some(
                (surface) => surface.id === validThreadState?.activeSurfaceId,
              )
                ? (validThreadState?.activeSurfaceId ?? null)
                : null;
              // A migration that dropped every surface (e.g. plan-only panels
              // in v9) must not reopen an empty panel.
              const isRightPanelOpen =
                surfaces.length > 0 &&
                (typeof validThreadState?.isRightPanelOpen === "boolean"
                  ? validThreadState.isRightPanelOpen
                  : persistedActiveSurfaceId !== null);
              // An open panel needs an active surface: if migration dropped
              // the persisted one (e.g. plan was active), fall back to the
              // first survivor instead of rendering an open empty panel.
              const activeSurfaceId =
                persistedActiveSurfaceId ?? (isRightPanelOpen ? (surfaces[0]?.id ?? null) : null);
              return [threadKey, { isRightPanelOpen, surfaces, activeSurfaceId }];
            },
          ),
        )
      : {};
  return { byThreadKey };
}

/** Applies one surface-catalog or right-panel presentation transition without side effects. */
export function transitionThreadWorkspaceSurfaces(
  current: ThreadWorkspaceSurfaceFields,
  input: ThreadWorkspaceSurfaceTransition,
): ThreadWorkspaceSurfaceFields {
  switch (input._tag) {
    case "OpenKind": {
      if (input.kind === "preview") {
        const existing = current.surfaces.find((surface) => surface.kind === "preview");
        return upsertSurface(current, existing ?? browserSurface(null), true, input.presentation);
      }
      return upsertSurface(current, singletonSurface(input.kind), true, input.presentation);
    }
    case "OpenBrowser": {
      const surface = browserSurface(input.tabId);
      const surfaces = input.tabId
        ? current.surfaces.filter((entry) => entry.id !== "browser:new")
        : current.surfaces;
      return upsertSurface({ ...current, surfaces }, surface, true, input.presentation);
    }
    case "OpenFile": {
      const surfaces = current.surfaces.filter((surface) => surface.kind !== "files");
      const surfaceId = `file:${input.relativePath}` as const;
      const existing = surfaces.find(
        (surface): surface is Extract<RightPanelSurface, { kind: "file" }> =>
          surface.id === surfaceId && surface.kind === "file",
      );
      const surface = fileSurface(
        input.relativePath,
        normalizeRevealLine(input.line),
        (existing?.revealRequestId ?? 0) + 1,
      );
      return {
        isRightPanelOpen: input.presentation === "preserve-panel" ? current.isRightPanelOpen : true,
        activeSurfaceId: surface.id,
        surfaces: existing
          ? surfaces.map((entry) => (entry.id === surface.id ? surface : entry))
          : [...surfaces, surface],
      };
    }
    case "OpenTerminal":
      return upsertSurface(current, terminalSurface(input.terminalId), true, input.presentation);
    case "SplitTerminal":
      return {
        ...current,
        isRightPanelOpen: true,
        activeSurfaceId: input.surfaceId,
        surfaces: current.surfaces.map((surface) => {
          if (surface.id !== input.surfaceId || surface.kind !== "terminal") return surface;
          const { splitDirection: _splitDirection, ...baseSurface } = surface;
          return {
            ...baseSurface,
            terminalIds: surface.terminalIds.includes(input.terminalId)
              ? surface.terminalIds
              : [...surface.terminalIds, input.terminalId],
            activeTerminalId: input.terminalId,
            ...(input.direction === "vertical" ? { splitDirection: "vertical" as const } : {}),
          };
        }),
      };
    case "ActivateTerminal":
      return {
        ...current,
        activeSurfaceId: input.surfaceId,
        surfaces: current.surfaces.map((surface) =>
          surface.id === input.surfaceId &&
          surface.kind === "terminal" &&
          surface.terminalIds.includes(input.terminalId)
            ? { ...surface, activeTerminalId: input.terminalId }
            : surface,
        ),
      };
    case "CloseTerminal": {
      const surface = current.surfaces.find(
        (entry) => entry.id === input.surfaceId && entry.kind === "terminal",
      );
      if (!surface || surface.kind !== "terminal") return current;
      const terminalIds = surface.terminalIds.filter((id) => id !== input.terminalId);
      if (terminalIds.length === 0) {
        return closeRightPanelSurface(current, input.surfaceId);
      }
      return {
        ...current,
        surfaces: current.surfaces.map((entry) => {
          if (entry.id !== input.surfaceId || entry.kind !== "terminal") return entry;
          const activeTerminalId =
            entry.activeTerminalId === input.terminalId
              ? (terminalIds.at(-1) ?? terminalIds[0])
              : entry.activeTerminalId;
          if (!activeTerminalId) return entry;
          return { ...entry, terminalIds, activeTerminalId };
        }),
      };
    }
    case "ActivateSurface":
      return current.surfaces.some((surface) => surface.id === input.surfaceId)
        ? { ...current, isRightPanelOpen: true, activeSurfaceId: input.surfaceId }
        : current;
    case "SelectSurface":
      return current.surfaces.some((surface) => surface.id === input.surfaceId)
        ? { ...current, activeSurfaceId: input.surfaceId }
        : current;
    case "CloseSurface":
      return closeRightPanelSurface(current, input.surfaceId);
    case "CloseOtherSurfaces": {
      const surface = current.surfaces.find((entry) => entry.id === input.surfaceId);
      if (!surface || current.surfaces.length === 1) return current;
      return { ...current, isRightPanelOpen: true, surfaces: [surface], activeSurfaceId: surface.id };
    }
    case "CloseSurfacesToRight": {
      const index = current.surfaces.findIndex((surface) => surface.id === input.surfaceId);
      if (index < 0 || index === current.surfaces.length - 1) return current;
      const surfaces = current.surfaces.slice(0, index + 1);
      const activeStillExists = surfaces.some((surface) => surface.id === current.activeSurfaceId);
      return {
        ...current,
        surfaces,
        activeSurfaceId: activeStillExists ? current.activeSurfaceId : input.surfaceId,
      };
    }
    case "CloseAllSurfaces":
      return current.surfaces.length === 0
        ? current
        : { ...current, isRightPanelOpen: false, surfaces: [], activeSurfaceId: null };
    case "ReconcileBrowserSurfaces": {
      const validIds = new Set(input.tabIds.map((tabId) => `browser:${tabId}`));
      const nonBrowser = current.surfaces.filter((surface) => surface.kind !== "preview");
      const existingBrowser = current.surfaces.filter(
        (surface): surface is Extract<RightPanelSurface, { kind: "preview" }> =>
          surface.kind === "preview" && surface.id !== "browser:new" && validIds.has(surface.id),
      );
      const knownIds = new Set(existingBrowser.map((surface) => surface.id));
      const added = input.tabIds
        .filter((tabId) => !knownIds.has(`browser:${tabId}`))
        .map((tabId) => browserSurface(tabId));
      const surfaces = [...nonBrowser, ...existingBrowser, ...added];
      const activeStillExists = surfaces.some((surface) => surface.id === current.activeSurfaceId);
      const fallbackBrowser = surfaces.find((surface) => surface.kind === "preview");
      return {
        ...current,
        surfaces,
        activeSurfaceId: activeStillExists
          ? current.activeSurfaceId
          : (fallbackBrowser?.id ?? surfaces[0]?.id ?? null),
      };
    }
    case "ReconcileFileSurfaces": {
      if (input.workspaceAvailable) return current;
      const surfaces = current.surfaces.filter(
        (surface) => surface.kind !== "files" && surface.kind !== "file",
      );
      if (surfaces.length === current.surfaces.length) return current;
      const activeStillExists = surfaces.some((surface) => surface.id === current.activeSurfaceId);
      return {
        ...current,
        isRightPanelOpen: surfaces.length > 0 ? current.isRightPanelOpen : false,
        surfaces,
        activeSurfaceId: activeStillExists
          ? current.activeSurfaceId
          : (surfaces.at(-1)?.id ?? null),
      };
    }
    case "ShowPanel":
      return current.isRightPanelOpen ? current : { ...current, isRightPanelOpen: true };
    case "ClosePanel":
      return current.isRightPanelOpen ? { ...current, isRightPanelOpen: false } : current;
    case "TogglePanelVisibility":
      return { ...current, isRightPanelOpen: !current.isRightPanelOpen };
    case "ToggleKind": {
      const active = current.surfaces.find((surface) => surface.id === current.activeSurfaceId);
      if (current.isRightPanelOpen && active?.kind === input.kind) {
        return { ...current, isRightPanelOpen: false };
      }
      if (input.kind === "preview") {
        const existing = current.surfaces.find((surface) => surface.kind === "preview");
        return upsertSurface(current, existing ?? browserSurface(null));
      }
      return upsertSurface(current, singletonSurface(input.kind));
    }
  }
}

function closeRightPanelSurface(
  current: ThreadWorkspaceSurfaceFields,
  surfaceId: string,
): ThreadWorkspaceSurfaceFields {
  const index = current.surfaces.findIndex((surface) => surface.id === surfaceId);
  if (index < 0) return current;
  const surfaces = current.surfaces.filter((surface) => surface.id !== surfaceId);
  if (current.activeSurfaceId !== surfaceId) {
    return { ...current, isRightPanelOpen: surfaces.length > 0 && current.isRightPanelOpen, surfaces };
  }
  const fallback = surfaces[Math.min(index, surfaces.length - 1)] ?? null;
  return {
    ...current,
    isRightPanelOpen: surfaces.length > 0 && current.isRightPanelOpen,
    surfaces,
    activeSurfaceId: fallback?.id ?? null,
  };
}
