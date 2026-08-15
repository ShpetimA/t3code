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
export function resolveGlobalRouteTab(input: { readonly pathname: string }): GlobalTab | null {
  const settingsSection = SETTINGS_SECTION_BY_PATHNAME[input.pathname];
  if (settingsSection !== undefined) {
    return { _tag: "Settings", section: settingsSection };
  }

  if (input.pathname === "/usage") {
    return { _tag: "Usage" };
  }

  return input.pathname === "/pull-requests" ? { _tag: "PullRequests" } : null;
}
