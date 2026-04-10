export namespace Keys {
  export type Key = (typeof Keys)["enum"][number];
}

export abstract class Keys {
  static enum = ["Backspace", "Enter", "Escape", "Tab"] as const;
}
