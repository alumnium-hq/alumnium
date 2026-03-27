import { getLogger } from "./logger.js";

const logger = getLogger(import.meta.url);

const DEFAULT_DELAY_SEC = 0.5; // seconds
let DELAY_MS = parseFloat(process.env.ALUMNIUM_DELAY || "0.5") * 1000; // Convert to milliseconds
if (isNaN(DELAY_MS) || DELAY_MS < 0) DELAY_MS = DEFAULT_DELAY_SEC * 1000;

const DEFAULT_RETRIES = 2;
let RETRIES = parseInt(process.env.ALUMNIUM_RETRIES || String(DEFAULT_RETRIES));
if (isNaN(RETRIES) || RETRIES < 0) RETRIES = DEFAULT_RETRIES;

interface RetryOptions {
  maxAttempts?: number;
  backOff?: number;
  doRetry?: (error: Error) => boolean;
}

function wrapWithRetry<T extends (...args: unknown[]) => Promise<unknown>>(
  originalMethod: T,
  options: RetryOptions,
): T {
  const maxAttempts = options.maxAttempts ?? RETRIES;
  const backOff = options.backOff ?? DELAY_MS;

  return async function (this: unknown, ...args: unknown[]): Promise<unknown> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await originalMethod.apply(this, args);
      } catch (error) {
        logger.debug(
          `Error on attempt ${attempt} for method ${originalMethod.name}: {error}`,
          { error },
        );
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
  } as T;
}

// Support both legacy and stage 3 decorators
export function retry(options: RetryOptions = {}): MethodDecorator {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return function (target: any, propertyKey: any, descriptor?: any): any {
    // Stage 3 decorator (receives value and context as first two args)
    if (
      typeof propertyKey === "object" &&
      propertyKey !== null &&
      "kind" in propertyKey
    ) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const context = propertyKey;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const originalMethod = target;

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (context.kind === "method") {
        return wrapWithRetry(originalMethod, options);
      }
      throw new Error("Retry decorator can only be applied to methods");
    }

    // Legacy decorator (receives target, propertyKey, descriptor)
    // Get descriptor if not provided
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const desc =
      descriptor ||
      Object.getOwnPropertyDescriptor(target, propertyKey as string);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (!desc || !desc.value) {
      throw new Error("Retry decorator can only be applied to methods");
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const originalMethod = desc.value;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    desc.value = wrapWithRetry(originalMethod, options);

    return desc;
  };
}
