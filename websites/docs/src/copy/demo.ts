import { langs, type I18n } from "./i18n";

export const ttDemo = {
  "demo-test-runner": [
    demoTab({
      id: "run",
      label: langs({ en: "Run Tests" }),
      src: "https://asciinema.org/a/569727.cast",
    }),

    demoTab({
      id: "self-healing",
      label: langs({ en: "Self-Healing" }),
      src: "https://asciinema.org/a/418574.cast",
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
  }

  export type DemoSrc = keyof typeof import("#/data/asciinema/metadata.json");
}

function demoTab<Id extends string>(tab: TtDemo.Tab<Id>): TtDemo.Tab<Id> {
  return tab;
}
