import fsSync from "node:fs";
import fs from "node:fs/promises";
import net from "node:net";
import z from "zod";
import type { McpTool } from "../../mcp/tools/McpTool.ts";
import { ALUMNIUM_VERSION } from "../../package.ts";
import { Telemetry } from "../../telemetry/Telemetry.ts";
import { CliProtocol } from "./CliProtocol.ts";
import type { CliSessionRegistry } from "./CliSessionRegistry.ts";
import { SocketConnection } from "./SocketConnection.ts";

const { logger, tracer } = Telemetry.get(import.meta.url);

const StartOutput = z.object({ id: z.string(), platform_name: z.string() });

export namespace CliSessionDaemon {
  export type Tool = (
    input: Record<string, unknown>,
  ) => Promise<McpTool.Output>;

  export interface Props {
    session: string;
    registry: CliSessionRegistry;
    start: Tool;
    startInput: Record<string, unknown>;
    stop: Tool;
    tools: Record<string, Tool>;
    /** Milliseconds without requests before stopping; 0 disables. */
    idleTimeoutMs: number;
    onExit: (code: number) => void | Promise<void>;
  }
}

/**
 * Owns a started driver and serves session requests over a local socket.
 */
export class CliSessionDaemon {
  #props: CliSessionDaemon.Props;
  #server = net.createServer((socket) => this.#onConnection(socket));
  #driverId = "";
  #queue: Promise<unknown> = Promise.resolve();
  #idleTimer: ReturnType<typeof setTimeout> | undefined;
  #watchTimer: ReturnType<typeof setInterval> | undefined;
  #socketIno: number | undefined;
  #closed = false;
  #terminating = false;

  constructor(props: CliSessionDaemon.Props) {
    this.#props = props;
  }

  get driverId(): string {
    return this.#driverId;
  }

  async start(): Promise<string> {
    const { session, registry, start, startInput, stop } = this.#props;

    const startOutput = outputText(await start(startInput));
    const { id, platform_name: platform } = StartOutput.parse(
      JSON.parse(startOutput),
    );
    this.#driverId = id;

    const socketPath = registry.socketPath(session);
    try {
      if (process.platform !== "win32")
        await fs.rm(socketPath, { force: true });
      await new Promise<void>((resolve, reject) => {
        this.#server.once("error", reject);
        this.#server.listen(socketPath, resolve);
      });
    } catch (error) {
      await stop({ id }).catch(() => {});
      throw error;
    }

    await registry.writeEntry({
      name: session,
      version: ALUMNIUM_VERSION,
      pid: process.pid,
      socketPath,
      driverId: id,
      platform,
      startedAt: Date.now(),
      startOutput,
    });

    this.#pokeIdleTimer();
    this.#watchSocket(socketPath);
    logger.info(`Session ${session} listening on ${socketPath}`);

    return startOutput;
  }

  async terminate(stopDriver: boolean): Promise<void> {
    if (this.#closed || this.#terminating) return;
    this.#terminating = true;

    try {
      await this.#enqueue(async () => {
        if (stopDriver) await this.#stop(false);
        else await this.#close();
      });
    } catch (error) {
      logger.error("Failed to stop session: {error}", { error });
    } finally {
      await this.#props.onExit(0);
    }
  }

  #onConnection(socket: net.Socket) {
    const connection = new SocketConnection(socket);
    connection.onmessage = (message) =>
      void this.#onMessage(connection, message).catch((error) =>
        logger.error("Failed to handle request: {error}", { error }),
      );
  }

  async #onMessage(connection: SocketConnection, message: unknown) {
    const parsed = CliProtocol.Request.safeParse(message);
    if (!parsed.success) {
      connection.close();
      return;
    }

    const request = parsed.data;
    let exitCode = 0;
    this.#pokeIdleTimer();

    try {
      const text = await this.#enqueue(() =>
        tracer.span(
          "cli.session.request",
          {
            "cli.session.name": this.#props.session,
            "cli.session.method": request.method,
          },
          () =>
            request.method === "stop"
              ? this.#stop(request.params.saveCache)
              : this.#run(request.params.tool, request.params.input),
        ),
      );
      await connection
        .send({ id: request.id, result: { text } })
        .catch(() => {});
    } catch (error) {
      exitCode = 1;
      await connection
        .send({
          id: request.id,
          error: error instanceof Error ? error.message : String(error),
        })
        .catch(() => {});
    } finally {
      this.#pokeIdleTimer();
    }

    if (request.method === "stop") await this.#props.onExit(exitCode);
  }

  async #run(
    toolName: string,
    input: Record<string, unknown>,
  ): Promise<string> {
    const tool = this.#props.tools[toolName];
    if (!tool) throw new Error(`Unknown tool: ${toolName}`);
    return outputText(await tool({ ...input, id: this.#driverId }));
  }

  async #stop(saveCache: boolean): Promise<string> {
    await this.#close();
    return outputText(
      await this.#props.stop({ id: this.#driverId, save_cache: saveCache }),
    );
  }

  async #close() {
    this.#closed = true;
    clearTimeout(this.#idleTimer);
    clearInterval(this.#watchTimer);

    // NOTE: A successor daemon may have taken over the session, so remove
    // only what this daemon still owns.
    const { registry, session } = this.#props;
    if (await this.#ownsSocket()) {
      // NOTE: Closing the server also unlinks its socket file.
      this.#server.close();
    } else {
      this.#server.unref();
    }
    const entry = await registry.readEntry(session);
    if (entry?.pid === process.pid) await registry.removeEntryFile(session);
  }

  async #ownsSocket(): Promise<boolean> {
    if (this.#socketIno === undefined) return true;
    const socketPath = this.#props.registry.socketPath(this.#props.session);
    const stat = await fs.stat(socketPath).catch(() => undefined);
    return stat?.ino === this.#socketIno;
  }

  #enqueue<Type>(fn: () => Promise<Type>): Promise<Type> {
    const result = this.#queue.then(fn);
    this.#queue = result.catch(() => {});
    return result;
  }

  #pokeIdleTimer() {
    clearTimeout(this.#idleTimer);
    if (this.#closed || !this.#props.idleTimeoutMs) return;

    this.#idleTimer = setTimeout(() => {
      logger.info(`Session ${this.#props.session} is idle, stopping`);
      void this.terminate(true);
    }, this.#props.idleTimeoutMs);
  }

  #watchSocket(socketPath: string) {
    // NOTE: Windows removes named pipes together with the owning process.
    if (process.platform === "win32") return;

    const { ino } = fsSync.statSync(socketPath);
    this.#socketIno = ino;
    this.#watchTimer = setInterval(() => {
      if (fsSync.statSync(socketPath, { throwIfNoEntry: false })?.ino === ino)
        return;
      logger.info(`Socket ${socketPath} was removed, stopping`);
      void this.terminate(true);
    }, 1000);
  }
}

function outputText(output: McpTool.Output): string {
  return output.map((content) => content.text).join("\n");
}
