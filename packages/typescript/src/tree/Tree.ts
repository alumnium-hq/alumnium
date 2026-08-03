export namespace Tree {
  export interface Attr {
    name: string;
    value: string;
  }

  export interface Node {
    id: number;
    role: string;
    ignored: boolean;
    name?: string;
    attrs?: Attr[];
    children?: Node[];
    backendId?: number;
  }
}
