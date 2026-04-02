import { always } from "alwaysly";
import { getLogger } from "./logger.ts";

const logger = getLogger(import.meta.url);

const DEFAULT_DELAY_SEC = 0.5; // seconds
let DELAY_MS = parseFloat(process.env.ALUMNIUM_DELAY || "0.5") * 1000; // Convert to milliseconds
if (isNaN(DELAY_MS) || DELAY_MS < 0) DELAY_MS = DEFAULT_DELAY_SEC * 1000;

const DEFAULT_RETRIES = 2;
let RETRIES = parseInt(process.env.ALUMNIUM_RETRIES || String(DEFAULT_RETRIES));
if (isNaN(RETRIES) || RETRIES < 0) RETRIES = DEFAULT_RETRIES;

export namespace retry {
  export interface Options {
    maxAttempts?: number;
    backOff?: number;
    doRetry?: (error: Error) => boolean;
  }

  export type Fn<Type> = () => Promise<Type> | Type;
}

export async function retry<Type>(fn: retry.Fn<Type>): Promise<Type>;

export async function retry<Type>(
  options: retry.Options,
  fn: retry.Fn<Type>,
): Promise<Type>;

export async function retry<Type>(
  optionsOrFn: retry.Options | retry.Fn<Type>,
  maybeFn?: () => Promise<Type>,
): Promise<Type> {
  let options: retry.Options;
  let fn: retry.Fn<Type>;
  if (typeof optionsOrFn === "function") {
    options = {};
    fn = optionsOrFn;
  } else {
    options = optionsOrFn;
    always(maybeFn);
    fn = maybeFn!;
  }

  const maxAttempts = options.maxAttempts ?? RETRIES;
  const backOff = options.backOff ?? DELAY_MS;

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      logger.debug(`Error on attempt ${attempt}: {error}`, { error });
      lastError = error as Error;

      // Check if we should retry this error
      if (options.doRetry && !options.doRetry(lastError)) {
        logger.debug(`Not retrying error: ${lastError.message}`, {
          error: lastError,
        });
        throw lastError;
      }

      if (process.env.ALUMNIUM_NO_RETRY) {
        logger.info(
          "ALUMNIUM_NO_RETRY is set, not retrying after error: {error}",
          { error: lastError },
        );
        throw lastError;
      }

      // Don't wait after the last attempt
      if (attempt < maxAttempts) {
        logger.debug(
          `Attempt ${attempt}/${maxAttempts} failed, retrying in ${backOff}ms: ${lastError.message}`,
          { attempt, maxAttempts, backOff, error: lastError },
        );
        await new Promise((resolve) => setTimeout(resolve, backOff));
      } else {
        logger.debug(
          `Attempt ${attempt}/${maxAttempts} failed, no more retries`,
          { attempt, maxAttempts, error: lastError },
        );
      }
    }
  }

  throw lastError ?? new Error("Retry failed with no error captured");
}
