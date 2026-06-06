export namespace I18n {
  export type Lang = "en";

  export type LangsMap<Snippets> = {
    [Lang_ in Exclude<Lang, "en">]: Snippets;
  };
}

export function langs<Snippets>(
  // NOTE: `{ en: Snippets } & ` allows to use en as the reference type
  // and force all other languages to have the same structure.
  obj: { en: Snippets } & I18n.LangsMap<NoInfer<Snippets>>,
) {
  return obj;
}
