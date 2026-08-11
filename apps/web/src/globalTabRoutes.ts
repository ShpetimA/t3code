import { EnvironmentId, ProjectId } from "@t3tools/contracts";

import type { GlobalSettingsSection, GlobalTab } from "./globalTabs";

const SETTINGS_SECTION_BY_PATHNAME: Readonly<Record<string, GlobalSettingsSection>> = {
  "/settings/general": "general",
  "/settings/appearance": "appearance",
  "/settings/keybindings": "keybindings",
  "/settings/providers": "providers",
  "/settings/source-control": "source-control",
  "/settings/connections": "connections",
  "/settings/archived": "archived",
  "/settings/diagnostics": "diagnostics",
};

/** Resolves the application tab represented by a non-thread route. */
export function resolveGlobalRouteTab(input: {
  readonly pathname: string;
  readonly searchStr: string;
  readonly primaryEnvironmentId: EnvironmentId | null;
}): GlobalTab | null {
  const settingsSection = SETTINGS_SECTION_BY_PATHNAME[input.pathname];
  if (settingsSection !== undefined) {
    return { _tag: "Settings", section: settingsSection };
  }

  if (input.pathname === "/usage") {
    return { _tag: "Usage" };
  }

  if (input.pathname !== "/pull-requests") {
    return null;
  }

  const search = new URLSearchParams(input.searchStr);
  const repository = search.get("repository");
  const rawNumber = search.get("number");
  const rawProjectId = search.get("selectedProjectId");
  const number = rawNumber === null ? Number.NaN : Number(rawNumber);
  if (
    input.primaryEnvironmentId === null ||
    repository === null ||
    repository.length === 0 ||
    rawProjectId === null ||
    rawProjectId.length === 0 ||
    !Number.isSafeInteger(number) ||
    number <= 0
  ) {
    return { _tag: "PullRequests" };
  }

  const host = search.get("host");
  return {
    _tag: "PullRequest",
    environmentId: input.primaryEnvironmentId,
    projectId: ProjectId.make(rawProjectId),
    repository,
    number,
    ...(host === null || host.length === 0 ? {} : { host }),
  };
}
