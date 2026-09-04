import type {
  EnvironmentId,
  TerminalAttachStreamEvent,
  TerminalMetadataStreamEvent,
  TerminalSessionSnapshot,
  TerminalSummary,
  ThreadId,
} from "@t3tools/contracts";

export interface TerminalSessionState {
  readonly summary: TerminalSummary | null;
  readonly buffer: string;
  readonly bufferEpoch: number;
  readonly bufferStartOffset: number;
  readonly bufferEndOffset: number;
  readonly status: TerminalSessionSnapshot["status"] | "closed";
  readonly error: string | null;
  readonly hasRunningSubprocess: boolean;
  readonly updatedAt: string | null;
  readonly version: number;
  readonly lifecycleVersion: number;
}

export interface TerminalBufferState {
  readonly buffer: string;
  readonly bufferEpoch: number;
  readonly bufferStartOffset: number;
  readonly bufferEndOffset: number;
  readonly status: TerminalSessionSnapshot["status"] | "closed";
  readonly error: string | null;
  readonly updatedAt: string | null;
  readonly version: number;
  readonly lifecycleVersion: number;
}

export interface KnownTerminalSessionTarget {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly terminalId: string;
}

export interface KnownTerminalSession {
  readonly target: KnownTerminalSessionTarget;
  readonly state: TerminalSessionState;
}

export function selectRunningSubprocessTerminalIds(
  sessions: ReadonlyArray<KnownTerminalSession>,
): ReadonlyArray<string> {
  return sessions
    .filter((session) => session.state.hasRunningSubprocess)
    .map((session) => session.target.terminalId);
}

export const EMPTY_TERMINAL_BUFFER_STATE = Object.freeze<TerminalBufferState>({
  buffer: "",
  bufferEpoch: 0,
  bufferStartOffset: 0,
  bufferEndOffset: 0,
  status: "closed",
  error: null,
  updatedAt: null,
  version: 0,
  lifecycleVersion: 0,
});

export const EMPTY_TERMINAL_SESSION_STATE = Object.freeze<TerminalSessionState>({
  summary: null,
  buffer: "",
  bufferEpoch: 0,
  bufferStartOffset: 0,
  bufferEndOffset: 0,
  status: "closed",
  error: null,
  hasRunningSubprocess: false,
  updatedAt: null,
  version: 0,
  lifecycleVersion: 0,
});

export const DEFAULT_MAX_TERMINAL_BUFFER_BYTES = 512 * 1024;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function trimBufferToBytes(
  buffer: string,
  maxBufferBytes: number,
): { readonly buffer: string; readonly byteLength: number } {
  if (maxBufferBytes <= 0) {
    return { buffer: "", byteLength: 0 };
  }

  const encoded = textEncoder.encode(buffer);
  if (encoded.byteLength <= maxBufferBytes) {
    return { buffer, byteLength: encoded.byteLength };
  }

  let start = encoded.byteLength - maxBufferBytes;
  while (start < encoded.length) {
    const byte = encoded[start];
    if (byte === undefined || (byte & 0b1100_0000) !== 0b1000_0000) {
      break;
    }
    start += 1;
  }

  const retained = encoded.subarray(start);
  return {
    buffer: textDecoder.decode(retained),
    byteLength: retained.byteLength,
  };
}

export function terminalBufferStateFromSnapshot(
  snapshot: TerminalSessionSnapshot,
  maxBufferBytes: number,
  bufferEpoch = 1,
): TerminalBufferState {
  const historyByteLength = textEncoder.encode(snapshot.history).byteLength;
  const retained = trimBufferToBytes(snapshot.history, maxBufferBytes);
  return {
    buffer: retained.buffer,
    bufferEpoch,
    bufferStartOffset: historyByteLength - retained.byteLength,
    bufferEndOffset: historyByteLength,
    status: snapshot.status,
    error: null,
    updatedAt: snapshot.updatedAt,
    version: 1,
    lifecycleVersion: 0,
  };
}

function latestTimestamp(left: string | null, right: string | null): string | null {
  if (left === null) return right;
  if (right === null) return left;
  return Date.parse(left) >= Date.parse(right) ? left : right;
}

export function combineTerminalSessionState(
  summary: TerminalSummary | null,
  buffer: TerminalBufferState,
): TerminalSessionState {
  return {
    summary,
    buffer: buffer.buffer,
    bufferEpoch: buffer.bufferEpoch,
    bufferStartOffset: buffer.bufferStartOffset,
    bufferEndOffset: buffer.bufferEndOffset,
    status: buffer.version > 0 ? buffer.status : (summary?.status ?? buffer.status),
    error: buffer.error,
    hasRunningSubprocess: summary?.hasRunningSubprocess ?? false,
    updatedAt: latestTimestamp(summary?.updatedAt ?? null, buffer.updatedAt),
    version: buffer.version,
    lifecycleVersion: buffer.lifecycleVersion,
  };
}

export function applyTerminalAttachStreamEvent(
  current: TerminalBufferState,
  event: TerminalAttachStreamEvent,
  maxBufferBytes = DEFAULT_MAX_TERMINAL_BUFFER_BYTES,
): TerminalBufferState {
  switch (event.type) {
    case "snapshot":
      return {
        ...terminalBufferStateFromSnapshot(event.snapshot, maxBufferBytes, current.bufferEpoch + 1),
        lifecycleVersion:
          current.version === 0 ? current.lifecycleVersion : current.lifecycleVersion + 1,
      };
    case "restarted":
      return {
        ...terminalBufferStateFromSnapshot(event.snapshot, maxBufferBytes, current.bufferEpoch + 1),
        lifecycleVersion: current.lifecycleVersion + 1,
      };
    case "output": {
      const nextBufferEndOffset =
        current.bufferEndOffset + textEncoder.encode(event.data).byteLength;
      const retained = trimBufferToBytes(`${current.buffer}${event.data}`, maxBufferBytes);
      return {
        ...current,
        buffer: retained.buffer,
        bufferStartOffset: nextBufferEndOffset - retained.byteLength,
        bufferEndOffset: nextBufferEndOffset,
        status: current.status === "closed" ? "running" : current.status,
        error: null,
        version: current.version + 1,
      };
    }
    case "cleared":
      return {
        ...current,
        buffer: "",
        bufferEpoch: current.bufferEpoch + 1,
        bufferStartOffset: 0,
        bufferEndOffset: 0,
        error: null,
        version: current.version + 1,
      };
    case "exited":
      return {
        ...current,
        status: "exited",
        error: null,
        version: current.version + 1,
      };
    case "closed":
      return {
        ...current,
        status: "closed",
        error: null,
        version: current.version + 1,
      };
    case "error":
      return {
        ...current,
        status: "error",
        error: event.message,
        version: current.version + 1,
      };
    case "activity":
      return current;
  }
}

export type TerminalBufferUpdate =
  | { readonly type: "none" }
  | { readonly type: "append"; readonly data: string }
  | { readonly type: "reset"; readonly buffer: string };

export function terminalBufferUpdateSince(
  previous: Pick<TerminalSessionState, "bufferEpoch" | "bufferEndOffset" | "version">,
  current: Pick<
    TerminalSessionState,
    "buffer" | "bufferEpoch" | "bufferStartOffset" | "bufferEndOffset" | "version"
  >,
): TerminalBufferUpdate {
  if (
    current.bufferEpoch !== previous.bufferEpoch ||
    previous.bufferEndOffset < current.bufferStartOffset ||
    previous.bufferEndOffset > current.bufferEndOffset
  ) {
    return { type: "reset", buffer: current.buffer };
  }
  if (current.version === previous.version) {
    return { type: "none" };
  }

  const encoded = textEncoder.encode(current.buffer);
  const unreadOffset = previous.bufferEndOffset - current.bufferStartOffset;
  return {
    type: "append",
    data: textDecoder.decode(encoded.subarray(unreadOffset)),
  };
}

export function applyTerminalMetadataStreamEvent(
  current: ReadonlyArray<TerminalSummary>,
  event: TerminalMetadataStreamEvent,
): ReadonlyArray<TerminalSummary> {
  if (event.type === "snapshot") {
    return event.terminals;
  }
  if (event.type === "remove") {
    return current.filter(
      (terminal) =>
        terminal.threadId !== event.threadId || terminal.terminalId !== event.terminalId,
    );
  }
  const next = current.filter(
    (terminal) =>
      terminal.threadId !== event.terminal.threadId ||
      terminal.terminalId !== event.terminal.terminalId,
  );
  return [...next, event.terminal];
}
