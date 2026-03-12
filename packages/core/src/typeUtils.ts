export namespace TypeUtils {
  export type PolyfillExactOptionalPropertyTypes<Type> =
    IsUnknown<Type> extends true
      ? unknown
      : {
          [Key in keyof Type]: PolyfillExactOptionalPropertyTypes<
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

  export type DeepPartial<Type> =
    IsUnknown<Type> extends true
      ? unknown
      : {
          [Key in keyof Type]?: DeepPartial<Type[Key]> | undefined;
        };
}
