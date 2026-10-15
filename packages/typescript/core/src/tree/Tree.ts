export namespace Tree {
  export type SimplifiedId = number & { [simplifiedIdBrand]: true };

  export type RawId = number & { [rawIdBrand]: true };

  export interface Node {
    id: Tree.SimplifiedId;
    role: string;
    ignored: boolean;
    name?: string | undefined;
    attrs: NodeAttrs;
    children: Node[];
    addressable: boolean;
    backendId?: number | undefined;
  }

  export type NodeAttrs = Record<string, string>;
}

declare const simplifiedIdBrand: unique symbol;
declare const rawIdBrand: unique symbol;
