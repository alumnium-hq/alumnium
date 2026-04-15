export namespace TypeUtils {
  export type ToExactOptional<Type> =
    IsUnknown<Type> extends true
      ? unknown
      : {
          [Key in keyof Type]: ToExactOptional<
            Type[Key] extends Required<Type>[Key]
              ? Type[Key]
              : Type[Key] | undefined
          >;
        };

  export type IsUnknown<Type> = [Type] extends [unknown]
    ? unknown extends Type
      ? true
      : false
    : false;

  export type IsNever<Type> = [Type] extends [never] ? true : false;

  export type DeepPartial<Type> =
    IsUnknown<Type> extends true
      ? unknown
      : Type extends Array<infer ItemType>
        ? Array<ItemType>
        : {
            [Key in keyof Type]?: DeepPartial<Type[Key]> | undefined;
          };

  export type PartialKeys<Type, Keys extends keyof Type> = Omit<Type, Keys> & {
    [Key in Keys]?: Type[Key] | undefined;
  };

  export type RequiredKeys<Type, Keys extends keyof Type> = Omit<Type, Keys> & {
    [Key in Keys]-?: Exclude<Type[Key], undefined>;
  };
}

export abstract class TypeUtils {
  static fromExactOptionalTypes<Type>(
    value: TypeUtils.ToExactOptional<Type>,
  ): Type {
    return value as Type;
  }
}
