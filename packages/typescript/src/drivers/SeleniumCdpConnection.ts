import { CdpNetworkMonitor } from "./CdpNetworkMonitor.ts";

const NETWORK_EVENTS = new Set([
  "Network.requestWillBeSent",
  "Network.responseReceived",
  "Network.dataReceived",
  "Network.loadingFinished",
  "Network.loadingFailed",
]);

const AUTO_ATTACH_PARAMS = {
  autoAttach: true,
  waitForDebuggerOnStart: true,
  flatten: true,
};
const TIMEOUT_MS = 5000;

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
  #socket: WebSocket;
  #waiterScript: string;
  #nextId = 1;
  #pending = new Map<number, PendingCommand>();
  #targetSessions = new Map<string, string>();
  #sessionParents = new Map<string, string>();
  #sessionConfigurations = new Map<string, Promise<void>>();
  #activeSession = "";
  #targetMonitors = new Map<string, CdpNetworkMonitor>();
  #closed = false;

  private constructor(socket: WebSocket, waiterScript: string) {
    this.#socket = socket;
    this.#waiterScript = waiterScript;
    socket.addEventListener("message", (event) => this.#onMessage(event.data));
    socket.addEventListener("close", () => this.#failConnection());
    socket.addEventListener("error", () => this.#failConnection());
  }

  static async connect(
    capabilities: { get(key: string): unknown },
    waiterScript: string,
  ): Promise<SeleniumCdpConnection> {
    const url = await websocketUrl(capabilities);
    const socket = new WebSocket(url);
    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error("Timed out connecting to Chrome CDP")),
          TIMEOUT_MS,
        );
        socket.addEventListener(
          "open",
          () => {
            clearTimeout(timeout);
            resolve();
          },
          { once: true },
        );
        socket.addEventListener(
          "error",
          () => {
            clearTimeout(timeout);
            reject(new Error("Could not connect to Chrome CDP"));
          },
          { once: true },
        );
      });
    } catch (error) {
      socket.close();
      throw error;
    }
    const connection = new SeleniumCdpConnection(socket, waiterScript);
    try {
      await connection.#send("Target.setAutoAttach", AUTO_ATTACH_PARAMS);
      await connection.#send("Target.setDiscoverTargets", { discover: true });
      const targets = (await connection.#send("Target.getTargets")) as {
        targetInfos?: Array<{ targetId: string; type: string }>;
      };
      for (const target of targets.targetInfos ?? []) {
        if (target.type === "page")
          await connection.#awaitSession(target.targetId);
      }
      return connection;
    } catch (error) {
      connection.close();
      throw error;
    }
  }

  async activate(windowHandle: string): Promise<void> {
    const targetId = windowHandle.replace(/^CDwindow-/, "");
    this.#activeSession = await this.#awaitSession(targetId);
  }

  get activeMonitor(): CdpNetworkMonitor {
    return this.#monitorForSession(this.#activeSession);
  }

  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#failPending(new Error("CDP connection closed"));
    this.#socket.close();
    this.#targetSessions.clear();
    this.#sessionParents.clear();
    this.#sessionConfigurations.clear();
    this.#targetMonitors.clear();
    this.#activeSession = "";
  }

  #send(
    method: string,
    params: object = {},
    sessionId = "",
    wait = true,
  ): Promise<Record<string, unknown>> {
    if (this.#closed) return Promise.reject(new Error("CDP connection closed"));
    const id = this.#nextId++;
    const message = { id, method, params, ...(sessionId ? { sessionId } : {}) };
    if (!wait) {
      this.#socket.send(JSON.stringify(message));
      return Promise.resolve({});
    }
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error(`Timed out sending CDP command ${method}`));
      }, TIMEOUT_MS);
      this.#pending.set(id, { resolve, reject, timeout });
      try {
        this.#socket.send(JSON.stringify(message));
      } catch (error) {
        clearTimeout(timeout);
        this.#pending.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  #onMessage(data: string | ArrayBuffer | Blob): void {
    if (data instanceof Blob) {
      void data.text().then((text) => this.#onMessage(text));
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
      this.#monitorForSession(sessionId).process(method, params, sessionId);
    } else if (method === "Target.attachedToTarget") {
      const targetInfo = params.targetInfo as
        | { targetId?: string; type?: string }
        | undefined;
      if (targetInfo?.type === "page" || targetInfo?.type === "iframe") {
        const sessionId = String(params.sessionId);
        if (targetInfo.targetId)
          this.#targetSessions.set(targetInfo.targetId, sessionId);
        this.#sessionParents.set(sessionId, message.sessionId ?? "");
        void this.#configureSession(sessionId).catch(() => undefined);
      }
    } else if (method === "Target.detachedFromTarget") {
      this.#detachSession(String(params.sessionId ?? ""));
    }
  }

  #configureSession(sessionId: string): Promise<void> {
    const existing = this.#sessionConfigurations.get(sessionId);
    if (existing) return existing;
    const configuration = this.#configureNewSession(sessionId);
    this.#sessionConfigurations.set(sessionId, configuration);
    return configuration;
  }

  async #configureNewSession(sessionId: string): Promise<void> {
    await this.#send("Target.setAutoAttach", AUTO_ATTACH_PARAMS, sessionId);
    await this.#send("Page.enable", {}, sessionId);
    await this.#send("Network.enable", {}, sessionId);
    await this.#send(
      "Page.addScriptToEvaluateOnNewDocument",
      { source: this.#waiterScript, runImmediately: true },
      sessionId,
    );
    await this.#send("Runtime.runIfWaitingForDebugger", {}, sessionId);
  }

  async #awaitSession(targetId: string): Promise<string> {
    const deadline = Date.now() + TIMEOUT_MS;
    while (Date.now() < deadline) {
      const sessionId = this.#targetSessions.get(targetId);
      const configuration = sessionId
        ? this.#sessionConfigurations.get(sessionId)
        : undefined;
      if (sessionId && configuration) {
        await configuration;
        return sessionId;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    return "";
  }

  #detachSession(sessionId: string): void {
    if (!sessionId) return;
    const root = this.#rootSession(sessionId);
    const detached = new Set([sessionId]);
    for (const candidate of this.#sessionParents.keys()) {
      if (this.#isDescendant(candidate, sessionId)) detached.add(candidate);
    }
    const monitor = this.#targetMonitors.get(root);
    for (const detachedSession of detached) {
      monitor?.clearSession(detachedSession);
      this.#sessionParents.delete(detachedSession);
      this.#sessionConfigurations.delete(detachedSession);
    }
    for (const [targetId, attachedSession] of this.#targetSessions) {
      if (detached.has(attachedSession)) this.#targetSessions.delete(targetId);
    }
    if (sessionId === root) this.#targetMonitors.delete(root);
    if (detached.has(this.#activeSession)) this.#activeSession = "";
  }

  #rootSession(sessionId: string): string {
    let current = sessionId;
    const visited = new Set<string>();
    while (!visited.has(current)) {
      visited.add(current);
      const parent = this.#sessionParents.get(current);
      if (!parent) break;
      current = parent;
    }
    return current;
  }

  #isDescendant(sessionId: string, ancestor: string): boolean {
    let current = sessionId;
    const visited = new Set<string>();
    while (!visited.has(current)) {
      visited.add(current);
      const parent = this.#sessionParents.get(current);
      if (!parent) return false;
      if (parent === ancestor) return true;
      current = parent;
    }
    return false;
  }

  #monitorForSession(sessionId: string): CdpNetworkMonitor {
    const rootSession = this.#rootSession(sessionId);
    let monitor = this.#targetMonitors.get(rootSession);
    if (!monitor) {
      monitor = new CdpNetworkMonitor();
      this.#targetMonitors.set(rootSession, monitor);
    }
    return monitor;
  }

  #failConnection(): void {
    this.#closed = true;
    this.#failPending(new Error("CDP connection closed"));
  }

  #failPending(error: Error): void {
    for (const command of this.#pending.values()) {
      clearTimeout(command.timeout);
      command.reject(error);
    }
    this.#pending.clear();
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
    {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    },
  );
  if (!response.ok) throw new Error(`CDP discovery failed: ${response.status}`);
  const version = (await response.json()) as { webSocketDebuggerUrl: string };
  return version.webSocketDebuggerUrl;
}
