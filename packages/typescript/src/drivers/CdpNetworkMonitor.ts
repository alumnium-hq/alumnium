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

interface DataEvent {
  requestId?: string;
  dataLength?: number;
  encodedDataLength?: number;
}

interface PendingRequest {
  url: string;
  contentLength?: number;
  received: number;
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
  #pending = new Map<string, PendingRequest>();
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
      this.#pending.set(key, {
        url: event.request?.url ?? "",
        received: 0,
      });
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
        return;
      }

      const contentLengthHeader = Object.entries(headers).find(
        ([name]) => name.toLowerCase() === "content-length",
      )?.[1];
      const contentLength = Number(contentLengthHeader);
      if (Number.isFinite(contentLength) && contentLength >= 0) {
        const key = this.requestKey(event.requestId, sessionId);
        if (key) {
          const request = this.#pending.get(key);
          if (!request) return;
          request.contentLength = contentLength;
          if (request.received >= contentLength) this.finishKey(key);
        }
      }
    } else if (method === "Network.dataReceived") {
      const event = params as DataEvent;
      const key = this.requestKey(event.requestId, sessionId);
      if (!key) return;
      const request = this.#pending.get(key);
      if (!request) return;
      request.received += event.encodedDataLength || event.dataLength || 0;
      if (
        request.contentLength !== undefined &&
        request.received >= request.contentLength
      ) {
        this.finishKey(key);
      }
    } else if (
      method === "Network.loadingFinished" ||
      method === "Network.loadingFailed"
    ) {
      this.finish((params as { requestId?: string }).requestId, sessionId);
    }
  }

  get pending(): string[] {
    return [...this.#pending.values()].map((request) => request.url);
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
    const key = this.requestKey(requestId, sessionId);
    if (key) this.finishKey(key);
  }

  private finishKey(key: string): void {
    if (this.#pending.delete(key)) this.#lastActivityAt = performance.now();
  }

  private requestKey(
    requestId: string | undefined,
    sessionId: string,
  ): string | undefined {
    if (!requestId) return;
    const key = `${sessionId}:${requestId}`;
    if (this.#pending.has(key)) return key;
    const suffix = `:${requestId}`;
    const transferred = [...this.#pending.keys()].filter((key) =>
      key.endsWith(suffix),
    );
    if (transferred.length === 1) return transferred[0];
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
