// @ts-expect-error -- TODO: Missing Python API
import { unifiedDiff } from "difflib";

export class AccessibilityTreeDiff {
  beforeXml: string;
  afterXml: string;
  #diff: string = "";

  constructor(beforeXml: string, afterXml: string) {
    this.beforeXml = beforeXml;
    this.afterXml = afterXml;
  }

  compute(): string {
    if (!this.#diff) {
      this.#diff = this.#formatAsGitDiff();
    }

    return this.#diff;
  }

  #formatAsGitDiff(): string {
    // @ts-expect-error -- TODO: Missing Python API
    const beforeLines = this.beforeXml.splitlines({ keepends: true });
    // @ts-expect-error -- TODO: Missing Python API
    const afterLines = this.afterXml.splitlines({ keepends: true });

    // Ensure last lines have newlines for consistent diff output
    const beforeLastIndex = beforeLines.length - 1;
    if (beforeLastIndex >= 0) {
      const beforeLastLine = beforeLines[beforeLastIndex];
      if (beforeLastLine !== undefined && !beforeLastLine.endsWith("\n")) {
        beforeLines[beforeLastIndex] = `${beforeLastLine}\n`;
      }
    }
    const afterLastIndex = afterLines.length - 1;
    if (afterLastIndex >= 0) {
      const afterLastLine = afterLines[afterLastIndex];
      if (afterLastLine !== undefined && !afterLastLine.endsWith("\n")) {
        afterLines[afterLastIndex] = `${afterLastLine}\n`;
      }
    }

    const diff = unifiedDiff(beforeLines, afterLines, {
      fromfile: "before",
      tofile: "after",
    });

    return diff.join("").replace(/\n$/, "");
  }
}
