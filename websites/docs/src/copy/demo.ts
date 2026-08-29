import { langs, type I18n } from "./i18n";

export const ttDemo = {
  "demo-test-runner": [
    demoTab({
      id: "record",
      label: langs({ en: "Recording" }),
      src: "https://asciinema.org/a/ixXpWF5XCyFEMjMo.cast",
    }),

    demoTab({
      id: "run",
      label: langs({ en: "Running" }),
      src: "https://asciinema.org/a/ykvDh9Pkp7U0safp.cast",
    }),

    demoTab({
      id: "self-healing",
      label: langs({ en: "Self-Healing" }),
      src: "https://asciinema.org/a/8vVioaoB2TIsLlAc.cast",
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
