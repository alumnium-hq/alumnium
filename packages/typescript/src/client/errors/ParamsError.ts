/**
 * Custom error thrown when goal parameters and their `{placeholder}` tokens
 * don't line up.
 */
export class ParamsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ParamsError";
    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ParamsError);
    }
  }
}
