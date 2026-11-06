import { Recording } from "../Recording.ts";

export namespace ToolExecutor {
  export type Call = Omit<Recording.ToolCall, "id">;

  export interface ExecuteOptions {
    meta?: Record<string, unknown> | undefined;
  }
}

export interface ToolExecutor {
  handles(call: ToolExecutor.Call): boolean;

  execute(
    call: ToolExecutor.Call,
    options?: ToolExecutor.ExecuteOptions,
  ): Promise<Recording.ToolResult>;

  close?(): Promise<void>;
}

/**
 * Puts executors together into one, which executes a call with the first
 * executor handling it.
 *
 * @param executors - Executors, in order of precedence.
 * @returns Composed executor.
 */
export function composeExecutors(...executors: ToolExecutor[]): ToolExecutor {
  const find = (call: ToolExecutor.Call) =>
    executors.find((executor) => executor.handles(call));

  return {
    handles: (call) => Boolean(find(call)),

    async execute(call, options) {
      const executor = find(call);
      if (!executor)
        throw new Error(
          `No executor handles tool '${Recording.toolKey(call)}'`,
        );
      return executor.execute(call, options);
    },

    async close() {
      await Promise.all(
        executors.map(async (executor) => await executor.close?.()),
      );
    },
  };
}
