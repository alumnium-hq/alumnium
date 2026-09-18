import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

const HOST = "127.0.0.1";
const SLOW_TAB_PATH = "/slow-tab";
const SLOW_TAB_DELAY_MS = 2_000;

export class SlowTabServer {
  #server: Server;

  constructor() {
    this.#server = createServer((request, response) => {
      const isSlowTab = request.url === SLOW_TAB_PATH;
      const send = () => {
        response.writeHead(200, {
          "content-type": "text/html",
          "cache-control": "no-store",
        });
        response.end(
          isSlowTab
            ? "<title>Slow Tab</title><h1>Slow Tab</h1>"
            : `<title>Opener</title><h1>Opener</h1>
               <button onclick="window.open('${SLOW_TAB_PATH}', '_blank')">Open Slow Tab</button>`,
        );
      };

      if (isSlowTab) setTimeout(send, SLOW_TAB_DELAY_MS);
      else send();
    });
  }

  async start(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => reject(error);
      this.#server.once("error", onError);
      this.#server.listen(0, HOST, () => {
        this.#server.off("error", onError);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    if (!this.#server.listening) return;

    await new Promise<void>((resolve, reject) => {
      this.#server.close((error) => (error ? reject(error) : resolve()));
      this.#server.closeAllConnections();
    });
  }

  get url(): string {
    const { port } = this.#address();
    return `http://${HOST}:${port}/`;
  }

  get slowTabUrl(): string {
    return new URL(SLOW_TAB_PATH, this.url).toString();
  }

  #address(): AddressInfo {
    const address = this.#server.address();
    if (!address || typeof address === "string") {
      throw new Error("Slow tab server is not running");
    }
    return address;
  }
}
