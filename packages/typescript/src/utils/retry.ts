interface RetryOptions {
  maxAttempts: number;
  backOff: number;
  doRetry?: (error: Error) => boolean;
}

function wrapWithRetry<T extends (...args: unknown[]) => Promise<unknown>>(
  originalMethod: T,
  options: RetryOptions
): T {
  return async function (this: unknown, ...args: unknown[]): Promise<unknown> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
      try {
        return await originalMethod.apply(this, args);
      } catch (error) {
        lastError = error as Error;

        // Check if we should retry this error
        if (options.doRetry && !options.doRetry(lastError)) {
          throw lastError;
        }

        // Don't wait after the last attempt
        if (attempt < options.maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, options.backOff));
        }
      }
    }

    throw lastError ?? new Error("Retry failed with no error captured");
  } as T;
}

// Support both legacy and stage 3 decorators
export function Retry(options: RetryOptions): MethodDecorator {
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
