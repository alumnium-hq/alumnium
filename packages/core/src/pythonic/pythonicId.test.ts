import { describe, expect, it } from "bun:test";
import { pythonicId } from "./pythonicId.ts";

describe(pythonicId, () => {
  it("returns the same id for the same object", () => {
    const obj = {};
    const first = pythonicId(obj);
    const second = pythonicId(obj);

    expect(first).toBe(second);
  });

  it("returns different ids for different objects", () => {
    const a = {};
    const b = {};

    expect(pythonicId(a)).not.toBe(pythonicId(b));
  });

  it("works with arrays", () => {
    const arr: any[] = [];

    const id1 = pythonicId(arr);
    const id2 = pythonicId(arr);

    expect(id1).toBe(id2);
  });

  it("works with functions", () => {
    const fn = () => {};

    const id1 = pythonicId(fn);
    const id2 = pythonicId(fn);

    expect(id1).toBe(id2);
  });

  it("does not collide across multiple objects", () => {
    const objects = Array.from({ length: 100 }, () => ({}));
    const ids = objects.map(pythonicId);

    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(objects.length);
  });

  it("ids are monotonically increasing", () => {
    const a = {};
    const b = {};
    const c = {};

    const idA = pythonicId(a);
    const idB = pythonicId(b);
    const idC = pythonicId(c);

    expect(idA).toBeLessThan(idB);
    expect(idB).toBeLessThan(idC);
  });

  it("does not attach properties to the object", () => {
    const obj = {};
    pythonicId(obj);

    expect(Object.keys(obj).length).toBe(0);
    expect(Object.getOwnPropertySymbols(obj).length).toBe(0);
  });

  it("throws if called with a non-object", () => {
    // TypeScript prevents this, but runtime JS still allows it
    expect(() => pythonicId(123 as any)).toThrow();
    expect(() => pythonicId("str" as any)).toThrow();
    expect(() => pythonicId(null as any)).toThrow();
    expect(() => pythonicId(undefined as any)).toThrow();
  });
});
