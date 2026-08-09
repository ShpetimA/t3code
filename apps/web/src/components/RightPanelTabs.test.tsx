import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { RightPanelTabBar } from "./RightPanelTabs";

const NOOP = () => {};

describe("RightPanelTabBar", () => {
  it("renders the current thread as a pinned active tab in the maximized workspace", () => {
    const markup = renderToStaticMarkup(
      <RightPanelTabBar
        mode="inline"
        maximized
        threadTab={{
          title: "New thread",
          active: true,
          status: {
            label: "Working",
            colorClass: "text-sky-600",
            dotClass: "bg-sky-500",
            pulse: true,
          },
          onActivate: NOOP,
        }}
        surfaces={[]}
        activeSurfaceId={null}
        pendingSurfaceIds={new Set()}
        previewSessions={{}}
        terminalLabelsById={new Map()}
        onActivate={NOOP}
        onCloseSurface={NOOP}
        onCloseOtherSurfaces={NOOP}
        onCloseSurfacesToRight={NOOP}
        onCloseAllSurfaces={NOOP}
        onCopyFilePath={NOOP}
        onAddBrowser={NOOP}
        onAddTerminal={NOOP}
        onAddDiff={NOOP}
        onAddFiles={NOOP}
        onAddAgents={NOOP}
        browserAvailable
        diffAvailable
        filesAvailable
        liveAgentCount={0}
      />,
    );

    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain("New thread");
    expect(markup).toContain('aria-label="Working"');
    expect(markup).toContain("animate-status-pulse");
    expect(markup).toContain('aria-label="Add panel surface"');
    expect(markup).not.toContain('aria-label="Close New thread"');
  });
});
