import type net from "node:net";

const MAX_LINE_LENGTH = 64 * 1024 * 1024;

/**
 * Newline-delimited JSON messages over a socket.
 */
export class SocketConnection {
  onmessage?: (message: unknown) => void;
  onclose?: () => void;

  #socket: net.Socket;
  #buffer = "";
  #maxLineLength: number;

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
    this.#socket.destroy();
  }

  #onData(chunk: string) {
    this.#buffer += chunk;
    let end = this.#buffer.indexOf("\n");
    while (end !== -1) {
      const line = this.#buffer.slice(0, end);
      this.#buffer = this.#buffer.slice(end + 1);
      if (line) {
        try {
          const message: unknown = JSON.parse(line);
          this.onmessage?.(message);
        } catch {
          // NOTE: Malformed input or a throwing handler, stop processing.
          this.#buffer = "";
          this.close();
          return;
        }
      }
      end = this.#buffer.indexOf("\n");
    }
    if (this.#buffer.length > this.#maxLineLength) {
      this.#buffer = "";
      this.close();
    }
  }
}
