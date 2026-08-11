import { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { resolveGlobalRouteTab } from "./globalTabRoutes";

const environmentId = EnvironmentId.make("environment-1");

describe("global tab routes", () => {
  it("maps every settings section onto the singleton settings identity", () => {
    expect(
      resolveGlobalRouteTab({
        pathname: "/settings/appearance",
        searchStr: "",
        primaryEnvironmentId: environmentId,
      }),
    ).toEqual({ _tag: "Settings", section: "appearance" });
  });

  it("maps usage onto its singleton identity", () => {
    expect(
      resolveGlobalRouteTab({
        pathname: "/usage",
        searchStr: "",
        primaryEnvironmentId: environmentId,
      }),
    ).toEqual({ _tag: "Usage" });
  });

  it("maps the pull request list without a selected review", () => {
    expect(
      resolveGlobalRouteTab({
        pathname: "/pull-requests",
        searchStr: "?state=open&involvement=all",
        primaryEnvironmentId: environmentId,
      }),
    ).toEqual({ _tag: "PullRequests" });
  });

  it("maps a selected review onto an environment and project scoped tab", () => {
    expect(
      resolveGlobalRouteTab({
        pathname: "/pull-requests",
        searchStr:
          "?state=all&involvement=all&repository=pingdotgg%2Ft3code&number=6194&selectedProjectId=project-1&host=github.com",
        primaryEnvironmentId: environmentId,
      }),
    ).toEqual({
      _tag: "PullRequest",
      environmentId,
      projectId: ProjectId.make("project-1"),
      repository: "pingdotgg/t3code",
      number: 6194,
      host: "github.com",
    });
  });

  it("does not manufacture a review tab from incomplete selection state", () => {
    expect(
      resolveGlobalRouteTab({
        pathname: "/pull-requests",
        searchStr: "?repository=pingdotgg%2Ft3code&number=6194",
        primaryEnvironmentId: environmentId,
      }),
    ).toEqual({ _tag: "PullRequests" });
  });
});
