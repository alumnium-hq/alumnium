import { CdpNetworkMonitor } from "./CdpNetworkMonitor.ts";

const NETWORK_EVENTS = new Set([
  "Network.requestWillBeSent",
  "Network.responseReceived",
  "Network.loadingFinished",
  "Network.loadingFailed",
]);

interface CdpMessage {
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: { message?: string };
  sessionId?: string;
}

interface PendingCommand {
  resolve: (result: Record<string, unknown>) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

export class SeleniumCdpConnection {
  private socket: WebSocket;
  private waiterScript: string;
  #nextId = 1;
  #pending = new Map<number, PendingCommand>();
  #targetSessions = new Map<string, string>();
  #sessionParents = new Map<string, string>();
  #activeSession = "";
  #attachingTargets = new Set<string>();
  #targetMonitors = new Map<string, CdpNetworkMonitor>();

  private constructor(socket: WebSocket, waiterScript: string) {
    this.socket = socket;
    this.waiterScript = waiterScript;
    socket.addEventListener("message", (event) => this.onMessage(event.data));
    socket.addEventListener("close", () => {
      for (const command of this.#pending.values()) {
        clearTimeout(command.timeout);
        command.reject(new Error("CDP connection closed"));
      }
      this.#pending.clear();
    });
  }

  static async connect(
    capabilities: { get(key: string): unknown },
    waiterScript: string,
  ): Promise<SeleniumCdpConnection> {
    const url = await websocketUrl(capabilities);
    const socket = new WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => resolve(), { once: true });
      socket.addEventListener(
        "error",
        () => reject(new Error("Could not connect to Chrome CDP")),
        {
          once: true,
        },
      );
    });
    const connection = new SeleniumCdpConnection(socket, waiterScript);
    try {
      await connection.send("Target.setAutoAttach", {
        autoAttach: true,
        waitForDebuggerOnStart: false,
        flatten: true,
      });
      const targets = (await connection.send("Target.getTargets")) as {
        targetInfos?: Array<{ targetId: string; type: string }>;
      };
      for (const target of targets.targetInfos ?? []) {
        if (target.type === "page")
          await connection.attachTarget(target.targetId);
      }
      await connection.send("Target.setDiscoverTargets", { discover: true });
      return connection;
    } catch (error) {
      connection.close();
      throw error;
    }
  }

  activate(windowHandle: string): void {
    const targetId = windowHandle.replace(/^CDwindow-/, "");
    this.#activeSession = this.#targetSessions.get(targetId) ?? "";
  }

  get activeMonitor(): CdpNetworkMonitor {
    return this.monitorForSession(this.#activeSession);
  }

  close(): void {
    this.socket.close();
  }

  private send(
    method: string,
    params: object = {},
    sessionId = "",
    wait = true,
  ): Promise<Record<string, unknown>> {
    const id = this.#nextId++;
    const message = { id, method, params, ...(sessionId ? { sessionId } : {}) };
    if (!wait) {
      this.socket.send(JSON.stringify(message));
      return Promise.resolve({});
    }
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error(`Timed out sending CDP command ${method}`));
      }, 5000);
      this.#pending.set(id, { resolve, reject, timeout });
      this.socket.send(JSON.stringify(message));
    });
  }

  private onMessage(data: string | ArrayBuffer | Blob): void {
    if (data instanceof Blob) {
      void data.text().then((text) => this.onMessage(text));
      return;
    }
    const text =
      typeof data === "string" ? data : new TextDecoder().decode(data);
    const message = JSON.parse(text) as CdpMessage;
    if (message.id) {
      const command = this.#pending.get(message.id);
      if (!command) return;
      this.#pending.delete(message.id);
      clearTimeout(command.timeout);
      if (message.error) command.reject(new Error(message.error.message));
      else command.resolve(message.result ?? {});
      return;
    }

    const method = message.method ?? "";
    const params = message.params ?? {};
    if (NETWORK_EVENTS.has(method)) {
      const sessionId = message.sessionId ?? "";
      this.monitorForSession(sessionId).process(method, params, sessionId);
    } else if (method === "Target.attachedToTarget") {
      const targetInfo = params.targetInfo as
        | { targetId?: string; type?: string }
        | undefined;
      if (targetInfo?.type === "page" || targetInfo?.type === "iframe") {
        const sessionId = String(params.sessionId);
        if (targetInfo.targetId)
          this.#targetSessions.set(targetInfo.targetId, sessionId);
        this.#sessionParents.set(sessionId, message.sessionId ?? "");
        if (
          !targetInfo.targetId ||
          !this.#attachingTargets.has(targetInfo.targetId)
        ) {
          void this.configureSession(sessionId, false);
        }
      }
    } else if (method === "Target.detachedFromTarget") {
      const sessionId = String(params.sessionId ?? "");
      this.monitorForSession(sessionId).clearSession(sessionId);
      this.#sessionParents.delete(sessionId);
    } else if (method === "Target.targetCreated") {
      const targetInfo = params.targetInfo as
        | { targetId?: string; type?: string }
        | undefined;
      if (targetInfo?.type === "page" && targetInfo.targetId) {
        void this.attachTarget(targetInfo.targetId);
      }
    }
  }

  private async configureSession(
    sessionId: string,
    wait = true,
  ): Promise<void> {
    await this.send(
      "Target.setAutoAttach",
      { autoAttach: true, waitForDebuggerOnStart: false, flatten: true },
      sessionId,
      wait,
    );
    await this.send("Page.enable", {}, sessionId, wait);
    await this.send("Network.enable", {}, sessionId, wait);
    await this.send(
      "Page.addScriptToEvaluateOnNewDocument",
      { source: this.waiterScript, runImmediately: true },
      sessionId,
      wait,
    );
  }

  private async attachTarget(targetId: string): Promise<void> {
    if (
      this.#targetSessions.has(targetId) ||
      this.#attachingTargets.has(targetId)
    )
      return;
    this.#attachingTargets.add(targetId);
    try {
      const result = await this.send("Target.attachToTarget", {
        targetId,
        flatten: true,
      });
      const sessionId = String(result.sessionId);
      this.#targetSessions.set(targetId, sessionId);
      this.#sessionParents.set(sessionId, "");
      await this.configureSession(sessionId);
    } finally {
      this.#attachingTargets.delete(targetId);
    }
  }

  private rootSession(sessionId: string): string {
    let current = sessionId;
    let parent = this.#sessionParents.get(current);
    while (parent) {
      current = parent;
      parent = this.#sessionParents.get(current);
    }
    return current;
  }

  private monitorForSession(sessionId: string): CdpNetworkMonitor {
    const rootSession = this.rootSession(sessionId);
    let monitor = this.#targetMonitors.get(rootSession);
    if (!monitor) {
      monitor = new CdpNetworkMonitor();
      this.#targetMonitors.set(rootSession, monitor);
    }
    return monitor;
  }
}

async function websocketUrl(capabilities: {
  get(key: string): unknown;
}): Promise<string> {
  const cdpUrl = capabilities.get("se:cdp");
  if (typeof cdpUrl === "string") return cdpUrl;

  const options = (capabilities.get("goog:chromeOptions") ??
    capabilities.get("ms:edgeOptions")) as
    | { debuggerAddress?: string }
    | undefined;
  if (!options?.debuggerAddress) {
    throw new Error("Chromium did not expose a CDP debugger address");
  }
  const response = await fetch(
    `http://${options.debuggerAddress}/json/version`,
  );
  if (!response.ok) throw new Error(`CDP discovery failed: ${response.status}`);
  const version = (await response.json()) as { webSocketDebuggerUrl: string };
  return version.webSocketDebuggerUrl;
}
