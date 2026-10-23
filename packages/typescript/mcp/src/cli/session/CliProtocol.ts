import z from "zod";

export namespace CliProtocol {
  export type Request = z.infer<typeof CliProtocol.Request>;

  export type Response = z.infer<typeof CliProtocol.Response>;
}

/**
 * Messages exchanged between `alumnium cli` and its session daemon.
 */
export abstract class CliProtocol {
  static Request = z.discriminatedUnion("method", [
    z.object({
      id: z.number(),
      method: z.literal("run"),
      params: z.object({
        tool: z.string(),
        input: z.record(z.string(), z.unknown()),
      }),
    }),
    z.object({
      id: z.number(),
      method: z.literal("stop"),
      params: z.object({ saveCache: z.boolean() }),
    }),
  ]);

  static Response = z.union([
    z.object({ id: z.number(), result: z.object({ text: z.string() }) }),
    z.object({ id: z.number(), error: z.string() }),
  ]);
}
