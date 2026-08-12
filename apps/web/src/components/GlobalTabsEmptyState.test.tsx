import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { GlobalTabsEmptyState } from "./GlobalTabsEmptyState";

describe("GlobalTabsEmptyState", () => {
  it("offers deliberate ways forward without creating a thread", () => {
    const html = renderToStaticMarkup(
      <GlobalTabsEmptyState
        onNewThread={() => undefined}
        onOpenPullRequests={() => undefined}
        onOpenSettings={() => undefined}
        onOpenUsage={() => undefined}
        onOpenThread={() => undefined}
        pullRequestsSupported
        recentProjects={[]}
      />,
    );

    expect(html).toContain("New tab");
    expect(html).toContain("New thread");
    expect(html).toContain("Pull requests");
    expect(html).toContain("Usage");
    expect(html).toContain("Settings");
    expect(html).toContain("No recent threads yet.");
    expect(html).toContain('data-global-tabs-landing-backdrop=""');
  });
});
