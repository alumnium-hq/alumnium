export namespace I18n {
  export type LangCode = (typeof langCodes)[number];

  export type LangsMap<Value> = {
    [Lang_ in Exclude<LangCode, "en">]: Value;
  };

  export type FullLangsMap<Value> = {
    [Code in LangCode]: Value;
  };
}

export const langCodes = ["en"] as const;

export function langs<Value, Extra>(
  // NOTE: `{ en: Value } & ` allows to use en as the reference type
  // and force all other languages to have the same structure.
  obj: { en: Value } & I18n.LangsMap<NoInfer<Value>> & Extra,
) {
  return obj;
}

export function anyLang<Value>(value: Value): I18n.FullLangsMap<Value> {
  return new Proxy(
    {},
    {
      get(target, prop) {
        if (langCodes.includes(prop as I18n.LangCode)) return value;
        return Reflect.get(target, prop);
      },
    },
  ) as I18n.FullLangsMap<Value>;
}
