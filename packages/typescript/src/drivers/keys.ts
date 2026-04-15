import { z } from "zod";

export namespace Keys {
  export type Key = z.infer<typeof Keys.Key>;
}

export abstract class Keys {
  static enum = ["Backspace", "Enter", "Escape", "Tab"] as const;

  static Key = z.enum(this.enum);
}
