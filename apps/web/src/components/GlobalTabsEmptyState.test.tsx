import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { GlobalTabsEmptyState } from "./GlobalTabsEmptyState";

describe("GlobalTabsEmptyState", () => {
  it("offers deliberate ways forward without creating a thread", () => {
    const html = renderToStaticMarkup(
      <GlobalTabsEmptyState onNewThread={() => undefined} onOpenCommandCenter={() => undefined} />,
    );

    expect(html).toContain("No open tabs");
    expect(html).toContain("New thread");
    expect(html).toContain("Open command center");
  });
});
