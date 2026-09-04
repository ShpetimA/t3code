import { describe, expect, it } from "vite-plus/test";

import { EnvironmentId, TerminalSessionSnapshot, ThreadId } from "@t3tools/contracts";

import {
  applyTerminalAttachStreamEvent,
  applyTerminalMetadataStreamEvent,
  combineTerminalSessionState,
  EMPTY_TERMINAL_BUFFER_STATE,
  selectRunningSubprocessTerminalIds,
  terminalBufferUpdateSince,
} from "./terminalSession.ts";

const TARGET = {
  environmentId: EnvironmentId.make("env-local"),
  threadId: ThreadId.make("thread-1"),
  terminalId: "term-1",
} as const;

const BASE_SNAPSHOT: TerminalSessionSnapshot = {
  threadId: TARGET.threadId,
  terminalId: TARGET.terminalId,
  cwd: "/repo",
  worktreePath: null,
  status: "running",
  pid: 123,
  history: "hello",
  exitCode: null,
  exitSignal: null,
  label: "Terminal 1",
  updatedAt: "2026-04-01T00:00:00.000Z",
};

describe("terminal session reducers", () => {
  it("prefers live attach status over stale metadata after the attach stream starts", () => {
    const summary = applyTerminalMetadataStreamEvent([], {
      type: "snapshot",
      terminals: [
        {
          threadId: BASE_SNAPSHOT.threadId,
          terminalId: BASE_SNAPSHOT.terminalId,
          cwd: BASE_SNAPSHOT.cwd,
          worktreePath: BASE_SNAPSHOT.worktreePath,
          status: "running",
          pid: BASE_SNAPSHOT.pid,
          exitCode: BASE_SNAPSHOT.exitCode,
          exitSignal: BASE_SNAPSHOT.exitSignal,
          updatedAt: BASE_SNAPSHOT.updatedAt,
          hasRunningSubprocess: false,
          label: BASE_SNAPSHOT.label,
        },
      ],
    })[0]!;
    const attached = applyTerminalAttachStreamEvent(EMPTY_TERMINAL_BUFFER_STATE, {
      type: "error",
      threadId: TARGET.threadId,
      terminalId: TARGET.terminalId,
      message: "Terminal disconnected.",
    });

    expect(combineTerminalSessionState(summary, attached)).toMatchObject({
      status: "error",
      error: "Terminal disconnected.",
      version: 1,
    });
  });

  it("uses metadata status before an attach stream has emitted", () => {
    const summary = applyTerminalMetadataStreamEvent([], {
      type: "snapshot",
      terminals: [
        {
          threadId: BASE_SNAPSHOT.threadId,
          terminalId: BASE_SNAPSHOT.terminalId,
          cwd: BASE_SNAPSHOT.cwd,
          worktreePath: BASE_SNAPSHOT.worktreePath,
          status: "running",
          pid: BASE_SNAPSHOT.pid,
          exitCode: BASE_SNAPSHOT.exitCode,
          exitSignal: BASE_SNAPSHOT.exitSignal,
          updatedAt: BASE_SNAPSHOT.updatedAt,
          hasRunningSubprocess: false,
          label: BASE_SNAPSHOT.label,
        },
      ],
    })[0]!;

    expect(combineTerminalSessionState(summary, EMPTY_TERMINAL_BUFFER_STATE).status).toBe(
      "running",
    );
  });

  it("does not treat an idle running shell as a running subprocess", () => {
    const idleSession = {
      target: TARGET,
      state: {
        ...combineTerminalSessionState(null, EMPTY_TERMINAL_BUFFER_STATE),
        status: "running" as const,
        hasRunningSubprocess: false,
      },
    };
    const activeSession = {
      target: { ...TARGET, terminalId: "term-2" },
      state: {
        ...idleSession.state,
        hasRunningSubprocess: true,
      },
    };

    expect(selectRunningSubprocessTerminalIds([idleSession, activeSession])).toEqual(["term-2"]);
  });

  it("reduces attach snapshots and output without an imperative session manager", () => {
    const snapshot = applyTerminalAttachStreamEvent(EMPTY_TERMINAL_BUFFER_STATE, {
      type: "snapshot",
      snapshot: BASE_SNAPSHOT,
    });
    const output = applyTerminalAttachStreamEvent(
      snapshot,
      {
        type: "output",
        threadId: TARGET.threadId,
        terminalId: TARGET.terminalId,
        data: " world",
      },
      8,
    );

    expect(output).toMatchObject({
      buffer: "lo world",
      bufferStartOffset: 3,
      bufferEndOffset: 11,
      status: "running",
      error: null,
      version: 2,
    });
  });

  it("reduces terminal metadata snapshots, upserts, and removals", () => {
    const initial = applyTerminalMetadataStreamEvent([], {
      type: "snapshot",
      terminals: [
        {
          threadId: BASE_SNAPSHOT.threadId,
          terminalId: BASE_SNAPSHOT.terminalId,
          cwd: BASE_SNAPSHOT.cwd,
          worktreePath: BASE_SNAPSHOT.worktreePath,
          status: BASE_SNAPSHOT.status,
          pid: BASE_SNAPSHOT.pid,
          exitCode: BASE_SNAPSHOT.exitCode,
          exitSignal: BASE_SNAPSHOT.exitSignal,
          updatedAt: BASE_SNAPSHOT.updatedAt,
          hasRunningSubprocess: false,
          label: BASE_SNAPSHOT.label,
        },
      ],
    });
    const updated = applyTerminalMetadataStreamEvent(initial, {
      type: "upsert",
      terminal: {
        ...initial[0]!,
        hasRunningSubprocess: true,
      },
    });
    const removed = applyTerminalMetadataStreamEvent(updated, {
      type: "remove",
      threadId: TARGET.threadId,
      terminalId: TARGET.terminalId,
    });

    expect(updated).toHaveLength(1);
    expect(updated[0]?.hasRunningSubprocess).toBe(true);
    expect(removed).toEqual([]);
  });

  it("caps retained output by UTF-8 byte length", () => {
    const state = applyTerminalAttachStreamEvent(
      EMPTY_TERMINAL_BUFFER_STATE,
      {
        type: "output",
        threadId: TARGET.threadId,
        terminalId: TARGET.terminalId,
        data: "🙂🙂",
      },
      4,
    );

    expect(state.buffer).toBe("🙂");
    expect(state.bufferStartOffset).toBe(4);
    expect(state.bufferEndOffset).toBe(8);
  });

  it("appends across a rolling retained-buffer window without resetting terminal state", () => {
    const previous = applyTerminalAttachStreamEvent(
      EMPTY_TERMINAL_BUFFER_STATE,
      {
        type: "output",
        threadId: TARGET.threadId,
        terminalId: TARGET.terminalId,
        data: "abcdef",
      },
      6,
    );
    const current = applyTerminalAttachStreamEvent(
      previous,
      {
        type: "output",
        threadId: TARGET.threadId,
        terminalId: TARGET.terminalId,
        data: "ghi",
      },
      6,
    );

    expect(current.buffer).toBe("defghi");
    expect(terminalBufferUpdateSince(previous, current)).toEqual({
      type: "append",
      data: "ghi",
    });
  });

  it("uses byte offsets without splitting multibyte output while the window rolls", () => {
    const previous = applyTerminalAttachStreamEvent(
      EMPTY_TERMINAL_BUFFER_STATE,
      {
        type: "output",
        threadId: TARGET.threadId,
        terminalId: TARGET.terminalId,
        data: "a🙂",
      },
      5,
    );
    const current = applyTerminalAttachStreamEvent(
      previous,
      {
        type: "output",
        threadId: TARGET.threadId,
        terminalId: TARGET.terminalId,
        data: "界",
      },
      7,
    );

    expect(current.buffer).toBe("🙂界");
    expect(terminalBufferUpdateSince(previous, current)).toEqual({
      type: "append",
      data: "界",
    });
  });

  it("resets replay when the consumer falls behind the retained-buffer window", () => {
    const previous = applyTerminalAttachStreamEvent(
      EMPTY_TERMINAL_BUFFER_STATE,
      {
        type: "output",
        threadId: TARGET.threadId,
        terminalId: TARGET.terminalId,
        data: "abc",
      },
      3,
    );
    const current = applyTerminalAttachStreamEvent(
      previous,
      {
        type: "output",
        threadId: TARGET.threadId,
        terminalId: TARGET.terminalId,
        data: "defghi",
      },
      3,
    );

    expect(terminalBufferUpdateSince(previous, current)).toEqual({
      type: "reset",
      buffer: "ghi",
    });
  });
});
