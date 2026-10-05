import type net from "node:net";

/**
 * Newline-delimited JSON messages over a socket.
 */
export class SocketConnection {
  onmessage?: (message: unknown) => void;
  onclose?: () => void;

  #socket: net.Socket;
  #buffer = "";

  constructor(socket: net.Socket) {
    this.#socket = socket;
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
        let message: unknown;
        try {
          message = JSON.parse(line);
        } catch {
          this.close();
          return;
        }
        this.onmessage?.(message);
      }
      end = this.#buffer.indexOf("\n");
    }
  }
}
