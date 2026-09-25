import type { PlayerOptions } from "asciinema-player";
import { langs, type I18n } from "./i18n";

// Recorded at 146x68, which renders tiny text; reflow into a smaller terminal.
const testRunnerOptions = { cols: 70, rows: 20 };

export const ttDemo = {
  "demo-test-runner": [
    demoTab({
      id: "record",
      label: langs({ en: "Recording" }),
      src: "https://asciinema.org/a/Bfj6PLTAuuNT6Arc.cast",
      options: testRunnerOptions,
    }),

    demoTab({
      id: "run",
      label: langs({ en: "Running" }),
      src: "https://asciinema.org/a/WNcWXxKilSzvm6TJ.cast",
      options: testRunnerOptions,
    }),

    demoTab({
      id: "self-healing",
      label: langs({ en: "Self-Healing" }),
      src: "https://asciinema.org/a/1p2JMgXY65jQbTrB.cast",
      options: testRunnerOptions,
    }),
  ] as const,

  "demo-mcp-test": {},
};

export namespace TtDemo {
  export type T = typeof ttDemo;
  export type Id = keyof T extends `demo-${infer Rest}` ? Rest : never;

  export interface Tab<Id extends string> {
    id: Id;
    label: I18n.FullLangsMap<string>;
    src: DemoSrc;
    options?: PlayerOptions;
  }

  export type DemoSrc = keyof typeof import("#/data/asciinema/metadata.json");
}

function demoTab<Id extends string>(tab: TtDemo.Tab<Id>): TtDemo.Tab<Id> {
  return tab;
}
