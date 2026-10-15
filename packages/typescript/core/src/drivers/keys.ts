export namespace Keys {
  export type Key = (typeof Keys)["enum"][number];
}

export abstract class Keys {
  static enum = [
    "Backspace",
    "Enter",
    "Escape",
    "Space",
    "Tab",
    "ArrowDown",
    "ArrowUp",
    "ArrowLeft",
    "ArrowRight",
  ] as const;
}
