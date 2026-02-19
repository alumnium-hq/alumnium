import { mock } from "bun:test";

mock.module("difflib", () => {
  return {
    unifiedDiff: (a: string[], b: string[]) => {
      return [];
    },
  };
});
