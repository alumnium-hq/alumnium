export namespace Keys {
  export type Key = (typeof Keys)["enum"][number];
}

export abstract class Keys {
  static enum = [
    "ArrowDown",
    "ArrowLeft",
    "ArrowRight",
    "ArrowUp",
    "Backspace",
    "Enter",
    "Escape",
    "F5",
    "Tab",
  ] as const;
}
