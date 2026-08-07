import type { Reporter, TestModule } from "vitest/node";
import { Env } from "../../src/Env.ts";

export default class PassThresholdReporter implements Reporter {
  #threshold: number;

  constructor(threshold: number) {
    this.#threshold = threshold;
  }

  onTestRunEnd(
    testModules: ReadonlyArray<TestModule>,
    unhandledErrors: ReadonlyArray<unknown>,
  ) {
    if (
      unhandledErrors.length ||
      testModules.some((module) => module.errors().length)
    )
      return;

    let passed = 0;
    let failed = 0;
    for (const module of testModules) {
      for (const test of module.children.allTests()) {
        const state = test.result().state;
        if (state === "passed") passed++;
        else if (state === "failed") failed++;
      }
    }

    if (!failed) return;

    const { accepted, message } = this.#evaluate(passed, failed);

    if (accepted) {
      console.log(`\nTest failures accepted: ${message}`);
      if (Env.GITHUB_ACTIONS)
        console.log(`::warning title=Test failures accepted::${message}`);
      process.exitCode = 0;
    } else {
      console.log(`\nTest failures exceeded threshold: ${message}`);
      if (Env.GITHUB_ACTIONS)
        console.log(
          `::error title=Test failures exceeded threshold::${message}`,
        );
    }
  }

  #evaluate(passed: number, failed: number) {
    const total = passed + failed;
    const passRate = total ? (passed / total) * 100 : 0;
    return {
      accepted: total > 0 && passRate >= this.#threshold,
      message: `${passed}/${total} tests passed (${passRate.toFixed(2)}%, required ${this.#threshold}%)`,
    };
  }
}
