import { Telemetry } from "@alumnium/core/internal";
import { findMasks, maskSegment } from "./maskerUtils.ts";
import { ResponsePaths } from "./ResponsePaths.ts";
import { SubstringMasker } from "./SubstringMasker.ts";

const { logger } = Telemetry.get(import.meta.url);

const SECRET_MASK_PREFIX = "<secret.";
const SECRET_MASK_PATTERN = /<secret\.\w+(?:\.\w+)+(?::json)?>/g;

/**
 * Masks secrets tool calls return at configured JSON paths
 * (`maskResponsePaths`) as `<secret.id.path>` wherever they occur, the stored
 * result included, so a recording never holds them in clear. Replay
 * substitutes the secrets the fresh calls return.
 *
 * Owned by `ToolCallMasker`, which decides which leaves are secrets and
 * registers them here on top of its own whole-value masking.
 */
export class SecretMasker extends SubstringMasker {
  static PREFIX = SECRET_MASK_PREFIX;

  #paths: ResponsePaths;
  // `<secret.id>` of calls with response paths but unreadable output.
  #unreadOutputs = new Set<string>();

  /**
   * Finds secret masks anywhere in a value.
   *
   * @param value - Value to scan.
   * @returns Masks, in order of appearance.
   */
  static findMasks(value: unknown): string[] {
    return findMasks(value, SECRET_MASK_PATTERN);
  }

  /**
   * @param maskResponsePaths - Response paths by tool key, see
   *   `Masker.Props.maskResponsePaths`.
   */
  constructor(maskResponsePaths: Record<string, string[]> = {}) {
    super(SECRET_MASK_PATTERN);

    this.#paths = new ResponsePaths(maskResponsePaths);
  }

  /**
   * Tells whether a tool has response paths configured.
   *
   * @param toolKey - Tool key, see `Recording.toolKey`.
   */
  hasPaths(toolKey: string | undefined): boolean {
    return this.#paths.has(toolKey);
  }

  /**
   * Tells whether a JSON leaf of a tool's output is a secret, see
   * `ResponsePaths.covers`.
   *
   * @param toolKey - Tool key, see `Recording.toolKey`.
   * @param path - JSON leaf path.
   */
  isSecret(toolKey: string | undefined, path: string[]): boolean {
    return this.#paths.covers(toolKey, path);
  }

  /**
   * Registers a secret a tool call produced.
   *
   * @param mask - Secret mask, `<secret.id.path>`.
   * @param value - Secret value.
   */
  registerSecret(mask: string, value: string) {
    this.register(mask, value);
  }

  /**
   * Marks the output of a call with response paths as unreadable: its secrets
   * cannot be told apart, so they are still in it in clear.
   *
   * @param callId - Id of the tool call, as the host agent assigned it.
   */
  markUnread(callId: string) {
    logger.warn(
      `Tool call ${callId} has response paths to mask, but its output is not JSON`,
    );
    this.#unreadOutputs.add(`${SECRET_MASK_PREFIX}${maskSegment(callId)}>`);
  }

  /**
   * An unreadable output (see `markUnread`) is always reported, as `<secret.id>`.
   */
  override findLeaks(value: unknown): string[] {
    return [...this.#unreadOutputs, ...super.findLeaks(value)];
  }
}
