import { afterEach, describe, expect, it, vi } from "vitest";
import { SeleniumCdpConnection } from "./SeleniumCdpConnection.ts";

describe("SeleniumCdpConnection", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("configures auto-attached targets without attaching them explicitly", async () => {
    let socket: FakeWebSocket | undefined;
    vi.stubGlobal(
      "WebSocket",
      class {
        constructor() {
          socket = new FakeWebSocket();
          return socket;
        }
      },
    );

    const connection = await SeleniumCdpConnection.connect(
      { get: (key) => (key === "se:cdp" ? "ws://cdp" : undefined) },
      "waiter",
    );
    await connection.activate("CDwindow-page");
    if (!socket) throw new Error("WebSocket was not created");

    expect(socket.commands).not.toContain("Target.attachToTarget");
    expect(
      socket.commands.filter((method) => method === "Target.setAutoAttach"),
    ).toHaveLength(2);
    expect(socket.commands).toContain("Page.addScriptToEvaluateOnNewDocument");
    expect(socket.commands).toContain("Runtime.runIfWaitingForDebugger");
    connection.close();
  });
});

type Listener = (event: { data: string }) => void;

class FakeWebSocket {
  commands: string[] = [];
  #listeners: Partial<Record<string, Listener[]>> = {};
  #attached = false;

  constructor() {
    queueMicrotask(() => this.#emit("open"));
  }

  addEventListener(type: string, listener: Listener): void {
    const listeners = this.#listeners[type] ?? [];
    listeners.push(listener);
    this.#listeners[type] = listeners;
  }

  send(data: string): void {
    const command = JSON.parse(data) as {
      id: number;
      method: string;
      sessionId?: string;
    };
    this.commands.push(command.method);
    queueMicrotask(() => {
      if (command.method === "Target.setAutoAttach" && !command.sessionId) {
        this.#attachPage();
      }
      if (command.method === "Target.getTargets") {
        this.#emit(
          "message",
          JSON.stringify({
            id: command.id,
            result: {
              targetInfos: [{ targetId: "page", type: "page" }],
            },
          }),
        );
      } else {
        this.#emit("message", JSON.stringify({ id: command.id, result: {} }));
      }
    });
  }

  close(): void {
    this.#emit("close");
  }

  #attachPage(): void {
    if (this.#attached) return;
    this.#attached = true;
    const event = JSON.stringify({
      method: "Target.attachedToTarget",
      params: {
        sessionId: "page-session",
        targetInfo: { targetId: "page", type: "page" },
      },
    });
    this.#emit("message", event);
    this.#emit("message", event);
  }

  #emit(type: string, data = ""): void {
    for (const listener of this.#listeners[type] ?? []) listener({ data });
  }
}
