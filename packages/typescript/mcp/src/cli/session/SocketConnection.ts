import type net from "node:net";
// NOTE: Bounds what the daemon reads (requests), the client reads replies
// without a limit.
const MAX_LINE_LENGTH = 64 * 1024 * 1024;

/**
 * Newline-delimited JSON messages over a socket.
 */
export class SocketConnection {
  onmessage?: (message: unknown) => void;
  onclose?: () => void;
  onerror?: (kind: "malformed" | "handler", error: unknown) => void;

  #socket: net.Socket;
  // NOTE: Chunks of the unterminated line, joined only when it completes, so
  // reading one huge line stays linear.
  #pending: string[] = [];
  #pendingLength = 0;
  #maxLineLength: number;
  #closed = false;

  constructor(socket: net.Socket, maxLineLength = MAX_LINE_LENGTH) {
    this.#socket = socket;
    this.#maxLineLength = maxLineLength;
    socket.setEncoding("utf8");
    socket.on("data", (chunk: string) => this.#onData(chunk));
    socket.on("close", () => this.onclose?.());
    // NOTE: "close" always follows "error", so it is handled there.
    socket.on("error", () => {});
  }

  send(message: unknown): Promise<void> {
    return new Promise((resolve, reject) => {
      this.#socket.write(`${JSON.stringify(message)}\n`, (error) =>
        error ? reject(error) : resolve(),
      );
    });
  }

  close() {
    this.#closed = true;
    this.#socket.destroy();
  }

  #onData(chunk: string) {
    if (this.#closed) return;
    let start = 0;
    let end = chunk.indexOf("\n");
    while (end !== -1) {
      const line = [...this.#pending, chunk.slice(start, end)].join("");
      this.#clearPending();
      start = end + 1;
      if (line) {
        let message: unknown;
        try {
          message = JSON.parse(line);
        } catch (error) {
          this.onerror?.("malformed", error);
          this.#abort();
          return;
        }
        try {
          this.onmessage?.(message);
        } catch (error) {
          this.onerror?.("handler", error);
          this.#abort();
          return;
        }
        // NOTE: A handler may have closed the connection, drop the rest.
        if (this.#closed) return;
      }
      end = chunk.indexOf("\n", start);
    }
    const rest = chunk.slice(start);
    if (!rest) return;
    this.#pending.push(rest);
    this.#pendingLength += rest.length;
    if (this.#pendingLength > this.#maxLineLength) this.#abort();
  }

  #clearPending() {
    this.#pending = [];
    this.#pendingLength = 0;
  }

  #abort() {
    this.#clearPending();
    this.close();
  }
}
