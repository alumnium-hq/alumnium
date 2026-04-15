import { z } from "zod";

export namespace PlaySelector {
  export type Css = z.infer<typeof PlaySelector.Css>;

  export type Text = z.infer<typeof PlaySelector.Text>;

  export type Schema = z.infer<typeof PlaySelector.Schema>;
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

  static Schema = z.union([this.Css, this.Text]);
}
