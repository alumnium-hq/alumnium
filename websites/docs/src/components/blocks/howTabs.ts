import { tt } from "#/copy";
import type { TtCode } from "#/copy/code";

export function createHowTab<Base extends string>() {
  return function tab<
    Id extends TtCode.FilterKey<Base>,
    SubId extends TtCode.FilterKey<Id> extends `${Id}-${infer Rest}`
      ? Rest
      : never,
  >(id: Id, sub?: SubId[]) {
    if (sub)
      return {
        id,
        label: tt.code[id].tab,
        items: sub.map((subIdPost) => {
          const subId = `${id}-${subIdPost}` as TtCode.CodeVariantKey;
          return {
            id: subId,
            label: tt.code[subId].tab,
          };
        }),
      };

    return {
      id,
      label: tt.code[id].tab,
    };
  };
}
