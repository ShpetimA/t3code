import { describe, expect, it } from "vite-plus/test";
import { deriveProjectIdentity } from "./projectIdentity";

describe("deriveProjectIdentity", () => {
  it.each([
    ["Hermes", "HS"],
    ["Open Warden", "OW"],
    ["Learn Erlang Actor Model", "LM"],
    ["t3code", "T3"],
    ["T3 Code", "T3"],
    ["X", "XX"],
    ["---", "PR"],
  ])("derives %s as %s", (projectName, expected) => {
    expect(deriveProjectIdentity(projectName).monogram).toBe(expected);
  });

  it("keeps the palette stable across case and surrounding whitespace", () => {
    const canonical = deriveProjectIdentity("Hermes");
    const equivalent = deriveProjectIdentity("  HERMES  ");

    expect(equivalent.background).toBe(canonical.background);
    expect(equivalent.highlight).toBe(canonical.highlight);
  });

  it("generates different hues for different project names", () => {
    const colors = new Set(
      ["Hermes", "T3 Code", "Open Warden", "Codex", "Atlas", "Payments"].map(
        (projectName) => deriveProjectIdentity(projectName).background,
      ),
    );

    expect(colors.size).toBeGreaterThan(1);
  });
});
