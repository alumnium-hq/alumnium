import { tt } from "#/copy";
import type { TtHow } from "#/copy/how";

export function createHowTab<Base extends string>() {
  return function tab<
    Id extends TtHow.FilterKey<Base>,
    SubId extends TtHow.FilterKey<Id> extends `${Id}-${infer Rest}`
      ? Rest
      : never,
  >(id: Id, sub?: SubId[]) {
    if (sub)
      return {
        id,
        label: tt.how[id].tab,
        items: sub.map((subIdPost) => {
          const subId = `${id}-${subIdPost}` as TtHow.CodeVariantKey;
          return {
            id: subId,
            label: tt.how[subId].tab,
          };
        }),
      };

    return {
      id,
      label: tt.how[id].tab,
    };
  };
}
