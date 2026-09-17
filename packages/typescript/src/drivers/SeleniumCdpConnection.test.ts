import { afterEach, describe, expect, it, vi } from "vitest";
import { SeleniumCdpConnection } from "./SeleniumCdpConnection.ts";

describe("SeleniumCdpConnection", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("configures auto-attached targets without attaching them explicitly", async () => {
    const { connection, socket } = await connect();
    await connection.activate("CDwindow-page");

    expect(socket.commands).not.toContain("Target.attachToTarget");
    expect(
      socket.commands.filter((method) => method === "Target.setAutoAttach"),
    ).toHaveLength(2);
    expect(socket.commands).toContain("Page.addScriptToEvaluateOnNewDocument");
    expect(socket.commands).toContain("Runtime.runIfWaitingForDebugger");
    connection.close();
  });

  it.each(["page", "iframe", "worker", "shared_worker", "service_worker"])(
    "resumes attached %s targets after any required setup",
    async (type) => {
      const { connection, socket } = await connect();
      try {
        socket.attachTarget(type, "new-session");
        await vi.waitFor(() => {
          expect(socket.sessionCommands("new-session").at(-1)).toBe(
            "Runtime.runIfWaitingForDebugger",
          );
        });
        const commands = socket.sessionCommands("new-session");
        if (type === "page" || type === "iframe") {
          expect(commands.at(-2)).toBe("Page.addScriptToEvaluateOnNewDocument");
        } else {
          expect(commands).toEqual(["Runtime.runIfWaitingForDebugger"]);
        }
      } finally {
        connection.close();
      }
    },
  );

  it("resumes a target even if configuration fails", async () => {
    const { connection, socket } = await connect();
    try {
      socket.failMethod = "Page.enable";
      socket.attachTarget("page", "new-session");
      await vi.waitFor(() => {
        expect(socket.sessionCommands("new-session")).toEqual([
          "Target.setAutoAttach",
          "Page.enable",
          "Runtime.runIfWaitingForDebugger",
        ]);
      });
    } finally {
      connection.close();
    }
  });
});

async function connect() {
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
  if (!socket) throw new Error("WebSocket was not created");
  return { connection, socket };
}

type Listener = (event: { data: string }) => void;

class FakeWebSocket {
  commands: string[] = [];
  failMethod: string | undefined;
  #sentCommands: Array<{ method: string; sessionId?: string }> = [];
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
    this.#sentCommands.push(command);
    queueMicrotask(() => {
      if (command.method === "Target.setAutoAttach" && !command.sessionId) {
        this.#attachPage();
      }
      if (command.method === this.failMethod) {
        this.#emit(
          "message",
          JSON.stringify({
            id: command.id,
            error: { message: "Configuration failed" },
          }),
        );
      } else if (command.method === "Target.getTargets") {
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

  sessionCommands(sessionId: string): string[] {
    return this.#sentCommands
      .filter((command) => command.sessionId === sessionId)
      .map((command) => command.method);
  }

  attachTarget(type: string, sessionId: string): void {
    this.#emit(
      "message",
      JSON.stringify({
        method: "Target.attachedToTarget",
        params: {
          sessionId,
          targetInfo: { targetId: sessionId, type },
        },
      }),
    );
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
