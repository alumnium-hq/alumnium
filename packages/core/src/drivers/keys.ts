export namespace Keys {
  export type Key = (typeof Keys)["enum"][number];
}

export abstract class Keys {
  static enum = ["backspace", "enter", "escape", "tab"] as const;
}
