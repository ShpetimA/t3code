import { describe, expect, it } from "vite-plus/test";

import { resolveGlobalRouteTab } from "./globalTabRoutes";

describe("global tab routes", () => {
  it("maps every settings section onto the singleton settings identity", () => {
    expect(
      resolveGlobalRouteTab({
        pathname: "/settings/appearance",
      }),
    ).toEqual({ _tag: "Settings", section: "appearance" });
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
