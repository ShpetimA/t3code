import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { PanelLayoutControls } from "./PanelLayoutControls";

const NOOP = () => {};

describe("PanelLayoutControls", () => {
  it("renders the inline right-panel toggle in conversation mode", () => {
    const markup = renderToStaticMarkup(
      <PanelLayoutControls
        terminalAvailable
        terminalOpen={false}
        terminalShortcutLabel={null}
        rightControl={{
          _tag: "Panel",
          available: true,
          open: true,
          shortcutLabel: "⌘⇧B",
          liveAgentCount: 0,
          onToggle: NOOP,
        }}
        onToggleTerminal={NOOP}
      />,
    );

    expect(markup).toContain('aria-label="Toggle right panel"');
    expect(markup).toContain('data-pressed=""');
    expect(markup).not.toContain('aria-label="Split editor right"');
  });

  it("renders a split action instead of a panel toggle in workspace mode", () => {
    const markup = renderToStaticMarkup(
      <PanelLayoutControls
        terminalAvailable
        terminalOpen={false}
        terminalShortcutLabel={null}
        rightControl={{ _tag: "Split", available: true, onSplitRight: NOOP }}
        onToggleTerminal={NOOP}
      />,
    );

    expect(markup).toContain('aria-label="Split editor right"');
    expect(markup).toContain("[--control-icon-color:currentColor]");
    expect(markup).not.toContain('aria-label="Toggle right panel"');
  });
});
