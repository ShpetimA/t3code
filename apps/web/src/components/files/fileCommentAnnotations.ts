import type { LineAnnotation, SelectedLineRange } from "@pierre/diffs";

import type { ReviewCommentContext } from "~/reviewCommentContext";

export interface FileCommentAnnotationEntry {
  id: string;
  kind: "draft" | "comment";
  startLine: number;
  endLine: number;
  text: string;
}

export interface FileCommentAnnotationGroup {
  entries: FileCommentAnnotationEntry[];
}

export type FileCommentLineAnnotation = LineAnnotation<FileCommentAnnotationGroup>;

let fileCommentSequence = 0;

export function nextFileCommentId(): string {
  fileCommentSequence += 1;
  return `file-comment-${Date.now()}-${fileCommentSequence}`;
}

export function normalizeFileCommentRange(range: SelectedLineRange): {
  startLine: number;
  endLine: number;
} {
  return {
    startLine: Math.min(range.start, range.end),
    endLine: Math.max(range.start, range.end),
  };
}

export function formatFileCommentRange(startLine: number, endLine: number): string {
  return startLine === endLine ? `L${startLine}` : `L${startLine} to L${endLine}`;
}

function appendFileCommentEntry(
  annotations: ReadonlyArray<FileCommentLineAnnotation>,
  entry: FileCommentAnnotationEntry,
): FileCommentLineAnnotation[] {
  const existingIndex = annotations.findIndex(
    (annotation) => annotation.lineNumber === entry.endLine,
  );
  if (existingIndex < 0) {
    return [
      ...annotations,
      {
        lineNumber: entry.endLine,
        metadata: { entries: [entry] },
      },
    ];
  }
  return annotations.map((annotation, index) =>
    index === existingIndex
      ? {
          ...annotation,
          metadata: { entries: [...annotation.metadata.entries, entry] },
        }
      : annotation,
  );
}

export function buildFileCommentAnnotations(
  reviewComments: ReadonlyArray<ReviewCommentContext>,
  filePath: string,
): FileCommentLineAnnotation[] {
  const sectionId = `file:${filePath}`;
  return reviewComments.reduce<FileCommentLineAnnotation[]>((annotations, comment) => {
    if (comment.sectionId !== sectionId || comment.filePath !== filePath) {
      return annotations;
    }
    const startLine = comment.startIndex + 1;
    const endLine = comment.endIndex + 1;
    return appendFileCommentEntry(annotations, {
      id: comment.id,
      kind: "comment",
      startLine,
      endLine,
      text: comment.text,
    });
  }, []);
}

export function remapFileCommentAnnotations(
  annotations: ReadonlyArray<FileCommentLineAnnotation>,
): FileCommentLineAnnotation[] {
  return annotations.map((annotation) => ({
    ...annotation,
    metadata: {
      entries: annotation.metadata.entries.map((entry) => {
        const lineCount = entry.endLine - entry.startLine;
        return {
          ...entry,
          endLine: annotation.lineNumber,
          startLine: Math.max(1, annotation.lineNumber - lineCount),
        };
      }),
    },
  }));
}
