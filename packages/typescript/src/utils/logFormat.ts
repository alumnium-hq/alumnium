import { capitalCase } from "case-anything";
import { z } from "zod";
import { getLogger, type LogMethod } from "./logger.ts";

const logger = getLogger(import.meta.url);

export type LogBlocks = {
  [Property: string]: LogBlocks.Block;
};

export namespace LogBlocks {
  export type Block = Json | Payload;

  export interface Base {
    label?: string;
  }

  export interface Json extends Base {
    json: unknown;
  }

  export interface Payload extends Base {
    data: unknown;
  }
}

export function logBlocks(
  method: LogMethod,
  message: string,
  blocks: LogBlocks,
) {
  const payload: Record<string, unknown> = {};
  const entries = Object.entries(blocks);
  const lines = entries.length
    ? entries.flatMap(([property, block]) => {
        let value: unknown;
        const label = block.label ?? capitalCase(property);
        if ("data" in block) {
          value = block.data;
        } else {
          value = JSON.stringify(block.json, null, 2);
        }
        return [
          "---",
          `${label}:
${value}`,
        ];
      })
    : [];

  const content = `${message}${lines.length ? "\n" : ""}${lines.join("\n")}`;
  console.log(content);

  logger[method](content, payload);
}

/**
 * Prints a Zod schema parse error in a consistent format, including the input
 * that failed to parse and the error details.
 *
 * Also returns a human-readable message summarizing the error to optionally
 * use in an error.
 */
export function logSchemaParseError(
  name: string,
  input: unknown,
  result: z.ZodSafeParseError<unknown>,
): string {
  const { error } = result;
  const message = z.prettifyError(error);
  logBlocks("error", `Failed to parse ${name}: "${message}"`, {
    input: { json: input },
  });
  return message;
}
