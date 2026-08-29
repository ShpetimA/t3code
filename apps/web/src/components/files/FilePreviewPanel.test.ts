import { describe, expect, it } from "vite-plus/test";

import {
  buildFileCommentAnnotations,
  formatFileCommentRange,
  normalizeFileCommentRange,
  remapFileCommentAnnotations,
  resolveFileCommentAnnotationChanges,
} from "./fileCommentAnnotations";
import { isMarkdownPreviewFile, setMarkdownTaskChecked } from "./filePreviewMode";

describe("file comment annotations", () => {
  it("normalizes and formats selected line ranges", () => {
    expect(normalizeFileCommentRange({ start: 16, end: 7 })).toEqual({
      startLine: 7,
      endLine: 16,
    });
    expect(formatFileCommentRange(7, 7)).toBe("L7");
    expect(formatFileCommentRange(7, 16)).toBe("L7 to L16");
  });

  it("keeps an annotation range attached when Pierre remaps its anchor line", () => {
    expect(
      remapFileCommentAnnotations([
        {
          lineNumber: 20,
          metadata: {
            entries: [
              {
                id: "comment-1",
                kind: "comment",
                startLine: 7,
                endLine: 16,
                text: "Keep this guarded.",
              },
            ],
          },
        },
      ]),
    ).toEqual([
      {
        lineNumber: 20,
        metadata: {
          entries: [
            {
              id: "comment-1",
              kind: "comment",
              startLine: 11,
              endLine: 20,
              text: "Keep this guarded.",
            },
          ],
        },
      },
    ]);
  });

  it("rebuilds persisted file annotations from composer review comments", () => {
    expect(
      buildFileCommentAnnotations(
        [
          {
            id: "comment-1",
            sectionId: "file:apps/web/src/example.ts",
            sectionTitle: "File comment",
            filePath: "apps/web/src/example.ts",
            startIndex: 4,
            endIndex: 6,
            rangeLabel: "L5 to L7",
            text: "Keep this visible after remount.",
            diff: "a\nb\nc",
            fenceLanguage: "ts",
          },
          {
            id: "comment-2",
            sectionId: "file:apps/web/src/other.ts",
            sectionTitle: "File comment",
            filePath: "apps/web/src/other.ts",
            startIndex: 1,
            endIndex: 1,
            rangeLabel: "L2",
            text: "Ignore this one.",
            diff: "x",
            fenceLanguage: "ts",
          },
        ],
        "apps/web/src/example.ts",
      ),
    ).toEqual([
      {
        lineNumber: 7,
        metadata: {
          entries: [
            {
              id: "comment-1",
              kind: "comment",
              startLine: 5,
              endLine: 7,
              text: "Keep this visible after remount.",
            },
          ],
        },
      },
    ]);
  });

  it("distinguishes removed and restored Pierre comments", () => {
    const annotation = {
      lineNumber: 5,
      metadata: {
        entries: [
          {
            id: "comment-1",
            kind: "comment" as const,
            startLine: 5,
            endLine: 5,
            text: "Keep this guarded.",
          },
        ],
      },
    };

    const removed = resolveFileCommentAnnotationChanges([annotation], []);
    expect([...removed.removedIds]).toEqual(["comment-1"]);
    expect([...removed.addedIds]).toEqual([]);

    const restored = resolveFileCommentAnnotationChanges([], [annotation]);
    expect([...restored.addedIds]).toEqual(["comment-1"]);
    expect([...restored.removedIds]).toEqual([]);

    const neverRendered = resolveFileCommentAnnotationChanges([], []);
    expect([...neverRendered.addedIds]).toEqual([]);
    expect([...neverRendered.removedIds]).toEqual([]);
  });
});

describe("isMarkdownPreviewFile", () => {
  it("recognizes markdown and MDX files case-insensitively", () => {
    expect(isMarkdownPreviewFile("README.md")).toBe(true);
    expect(isMarkdownPreviewFile("docs/guide.MDX")).toBe(true);
  });

  it("does not treat other text files as markdown", () => {
    expect(isMarkdownPreviewFile("docs/guide.txt")).toBe(false);
    expect(isMarkdownPreviewFile("docs/markdown.ts")).toBe(false);
  });
});

describe("setMarkdownTaskChecked", () => {
  const markdown = "- [ ] First\n- [x] Second\n";

  it("checks and unchecks the task marker at the supplied offset", () => {
    expect(setMarkdownTaskChecked(markdown, 2, true)).toBe("- [x] First\n- [x] Second\n");
    expect(setMarkdownTaskChecked(markdown, 14, false)).toBe("- [ ] First\n- [ ] Second\n");
    expect(setMarkdownTaskChecked("1. [X] Ordered\n", 3, false)).toBe("1. [ ] Ordered\n");
  });

  it("leaves the document unchanged for a stale or invalid marker offset", () => {
    expect(setMarkdownTaskChecked(markdown, 0, true)).toBe(markdown);
    expect(setMarkdownTaskChecked(markdown, 200, true)).toBe(markdown);
  });
});
