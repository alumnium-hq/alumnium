const IGNORED_RESOURCE_TYPES = new Set([
  "CSPViolationReport",
  "EventSource",
  "Manifest",
  "Media",
  "Ping",
  "Prefetch",
  "WebSocket",
]);
const STREAMING_CONTENT_TYPES = new Set([
  "text/event-stream",
  "multipart/x-mixed-replace",
]);

interface RequestEvent {
  requestId?: string;
  type?: string;
  request?: { url?: string };
}

interface ResponseEvent {
  requestId?: string;
  response?: {
    headers?: Record<string, unknown>;
    mimeType?: string;
  };
}

interface WaiterSnapshot {
  lastMutationAt: number;
  now: number;
  pendingTimeouts: number;
  readyState: "loading" | "interactive" | "complete";
}

export const WAITER_SNAPSHOT_SCRIPT =
  "window[Symbol.for('alumnium')]?.snapshot()";

export class CdpNetworkMonitor {
  #pending = new Map<string, string>();
  #lastActivityAt = performance.now();

  process(method: string, params: object, sessionId = ""): void {
    if (method === "Network.requestWillBeSent") {
      const event = params as RequestEvent;
      if (!event.requestId) return;
      const key = `${sessionId}:${event.requestId}`;
      if (event.type && IGNORED_RESOURCE_TYPES.has(event.type)) {
        this.#pending.delete(key);
        return;
      }
      this.#pending.set(key, event.request?.url ?? "");
      this.#lastActivityAt = performance.now();
    } else if (method === "Network.responseReceived") {
      const event = params as ResponseEvent;
      const headers = event.response?.headers ?? {};
      const contentTypeHeader = Object.entries(headers).find(
        ([name]) => name.toLowerCase() === "content-type",
      )?.[1];
      const contentType = String(
        contentTypeHeader ?? event.response?.mimeType ?? "",
      )
        .split(";", 1)[0]
        ?.trim()
        .toLowerCase();
      if (contentType && STREAMING_CONTENT_TYPES.has(contentType)) {
        this.finish(event.requestId, sessionId);
      }
    } else if (
      method === "Network.loadingFinished" ||
      method === "Network.loadingFailed"
    ) {
      this.finish((params as { requestId?: string }).requestId, sessionId);
    }
  }

  get pending(): string[] {
    return [...this.#pending.values()];
  }

  get idleFor(): number {
    return performance.now() - this.#lastActivityAt;
  }

  clear(): void {
    this.#pending.clear();
    this.#lastActivityAt = performance.now();
  }

  clearSession(sessionId: string): void {
    for (const key of this.#pending.keys()) {
      if (key.startsWith(`${sessionId}:`)) this.#pending.delete(key);
    }
    this.#lastActivityAt = performance.now();
  }

  private finish(requestId: string | undefined, sessionId: string): void {
    if (!requestId) return;
    if (this.#pending.delete(`${sessionId}:${requestId}`)) {
      this.#lastActivityAt = performance.now();
    }
  }
}

export async function waitForPageStability(
  monitor: CdpNetworkMonitor,
  snapshot: () => Promise<WaiterSnapshot | null>,
  idleMs = 25,
  timeoutMs = 10_000,
): Promise<{ loaded: boolean; pending: string[] }> {
  const startedAt = performance.now();
  const deadline = startedAt + timeoutMs;

  while (performance.now() < deadline) {
    if (
      !monitor.pending.length &&
      performance.now() - startedAt >= idleMs &&
      monitor.idleFor >= idleMs
    ) {
      const state = await snapshot();
      if (
        state?.readyState === "complete" &&
        state.now - state.lastMutationAt >= idleMs &&
        !state.pendingTimeouts &&
        monitor.idleFor >= idleMs &&
        !monitor.pending.length
      ) {
        return { loaded: true, pending: [] };
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  return { loaded: false, pending: monitor.pending };
}
