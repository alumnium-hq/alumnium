import { createTwoFilesPatch } from "diff";
import { pythonicSplitlines } from "../../pythonic/pythonicSplitlines.js";

// TODO: This is a direct translation of the Python implementation. An idiomatic TypeScript would be
// a simple function `computeTreeDiff`. Consider refactoring it.

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
    // NOTE: The original Python implementation used difflib that returns an empty string
    // if the inputs are identical.
    if (this.beforeXml === this.afterXml) {
      return "";
    }

    const beforeLines = pythonicSplitlines(this.beforeXml, true);
    const afterLines = pythonicSplitlines(this.afterXml, true);

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

    const diff = createTwoFilesPatch(
      "before",
      "after",
      beforeLines.join(""),
      afterLines.join(""),
      undefined,
      undefined,
      {
        headerOptions: {
          includeUnderline: false,
          includeIndex: true,
          includeFileHeaders: true,
        },
      },
    );

    return diff.replace(/\n$/, "");
  }
}
