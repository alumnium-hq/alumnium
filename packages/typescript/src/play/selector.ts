import { z } from "zod";

export namespace PlaySelector {
  export type Css = z.infer<typeof PlaySelector.Css>;

  export type Text = z.infer<typeof PlaySelector.Text>;

  export type Type = z.infer<typeof PlaySelector.Type>;
}

export abstract class PlaySelector {
  static Css = z.object({
    kind: z.literal("css"),
    selector: z.string(),
  });

  static Text = z.object({
    kind: z.literal("text"),
    base: this.Css,
  });

  static Type = z.union([this.Css, this.Text]);
}
