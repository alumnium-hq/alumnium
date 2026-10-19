export namespace Params {
  export type Values = Record<string, string>;
}

export abstract class Params {
  static substitute(text: string, params: Params.Values = {}): string {
    return text.replace(/\{(\w+)\}/g, (token, name: string) =>
      Object.hasOwn(params, name) ? params[name]! : token,
    );
  }

  static mask(text: string, params: Params.Values = {}): string {
    return Object.entries(params)
      .filter(([, value]) => value)
      .sort(([, a], [, b]) => b.length - a.length)
      .reduce(
        (text, [name, value]) => text.replaceAll(value, `{${name}}`),
        text,
      );
  }

  static mapStrings<Type extends Record<string, unknown>>(
    record: Type,
    fn: (value: string) => string,
  ): Type {
    return Object.fromEntries(
      Object.entries(record).map(([key, value]) => [
        key,
        typeof value === "string" ? fn(value) : value,
      ]),
    ) as Type;
  }
}
