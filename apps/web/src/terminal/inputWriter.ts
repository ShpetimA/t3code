const MAX_TERMINAL_WRITE_LENGTH = 65_536;

export interface TerminalInputWriterOptions {
  readonly send: (data: string) => Promise<void>;
  readonly onError: (cause: unknown) => void;
}

/**
 * Preserves PTY input order without making every key wait for a full RPC round trip.
 * Input received during an active write is combined into the next wire-sized batch.
 */
export class TerminalInputWriter {
  private pending = "";
  private sending = false;
  private accepting = true;

  constructor(private readonly options: TerminalInputWriterOptions) {}

  write(data: string): void {
    if (!this.accepting || data.length === 0) return;
    this.pending += data;
    if (!this.sending) this.startDrain();
  }

  /** Stops accepting new input while allowing already accepted keystrokes to finish. */
  dispose(): void {
    this.accepting = false;
  }

  private startDrain(): void {
    this.sending = true;
    void this.drain();
  }

  private async drain(): Promise<void> {
    while (this.pending.length > 0) {
      const end = terminalWriteBoundary(this.pending);
      const data = this.pending.slice(0, end);
      this.pending = this.pending.slice(end);
      try {
        await this.options.send(data);
      } catch (cause) {
        try {
          this.options.onError(cause);
        } catch {
          // Error reporting must not wedge input that was already accepted.
        }
      }
    }
    this.sending = false;
    // A write cannot interleave with the synchronous lines above, but keeping
    // this guard makes the invariant explicit if the drain implementation moves.
    if (this.pending.length > 0) this.startDrain();
  }
}

function terminalWriteBoundary(data: string): number {
  let end = Math.min(data.length, MAX_TERMINAL_WRITE_LENGTH);
  const lastCodeUnit = data.charCodeAt(end - 1);
  if (end < data.length && lastCodeUnit >= 0xd800 && lastCodeUnit <= 0xdbff) {
    end -= 1;
  }
  return end;
}
