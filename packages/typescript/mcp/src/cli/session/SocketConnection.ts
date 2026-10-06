import type net from "node:net";
import { Logger } from "../../telemetry/Logger.ts";

const logger = Logger.get(import.meta.url);

export const MAX_LINE_LENGTH = 64 * 1024 * 1024;

/**
 * Newline-delimited JSON messages over a socket.
 */
export class SocketConnection {
  onmessage?: (message: unknown) => void;
  onclose?: () => void;

  #socket: net.Socket;
  #buffer = "";
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
    const start = this.#buffer.length;
    this.#buffer += chunk;
    let end = this.#buffer.indexOf("\n", start);
    while (end !== -1) {
      const line = this.#buffer.slice(0, end);
      this.#buffer = this.#buffer.slice(end + 1);
      if (line) {
        let message: unknown;
        try {
          message = JSON.parse(line);
        } catch (error) {
          logger.debug("Malformed message, closing connection: {error}", {
            error,
          });
          this.#abort();
          return;
        }
        try {
          this.onmessage?.(message);
        } catch (error) {
          logger.error("Message handler failed, closing connection: {error}", {
            error,
          });
          this.#abort();
          return;
        }
        // NOTE: A handler may have closed the connection, drop the rest.
        if (this.#closed) {
          this.#buffer = "";
          return;
        }
      }
      end = this.#buffer.indexOf("\n");
    }
    if (this.#buffer.length > this.#maxLineLength) {
      this.#abort();
    }
  }

  #abort() {
    this.#buffer = "";
    this.close();
  }
}
