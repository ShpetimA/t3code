import { describe, expect, it } from "vite-plus/test";

import { resolveGlobalRouteTab } from "./globalTabRoutes";

describe("global tab routes", () => {
  it("maps the launcher onto the new-tab identity", () => {
    expect(resolveGlobalRouteTab({ pathname: "/new" })).toEqual({ _tag: "NewTab" });
  });

  it("maps every settings section onto the singleton settings identity", () => {
    expect(
      [
        "general",
        "appearance",
        "keybindings",
        "providers",
        "integrations",
        "source-control",
        "connections",
        "archived",
        "diagnostics",
      ].map((section) =>
        resolveGlobalRouteTab({
          pathname: `/settings/${section}`,
        }),
      ),
    ).toEqual([
      { _tag: "Settings", section: "general" },
      { _tag: "Settings", section: "appearance" },
      { _tag: "Settings", section: "keybindings" },
      { _tag: "Settings", section: "providers" },
      { _tag: "Settings", section: "integrations" },
      { _tag: "Settings", section: "source-control" },
      { _tag: "Settings", section: "connections" },
      { _tag: "Settings", section: "archived" },
      { _tag: "Settings", section: "diagnostics" },
    ]);
  });

  it("maps usage onto its singleton identity", () => {
    expect(
      resolveGlobalRouteTab({
        pathname: "/usage",
      }),
    ).toEqual({ _tag: "Usage" });
  });

  it("maps the pull request page onto its singleton list tab", () => {
    expect(
      resolveGlobalRouteTab({
        pathname: "/pull-requests",
      }),
    ).toEqual({ _tag: "PullRequests" });
  });
});
