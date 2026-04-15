import { assert, beforeAll, describe, expect, it } from "vitest";
import "vitest/browser";
import type { PlaySelector } from "../../play/selector.ts";

describe("findSelector", () => {
  beforeAll(async () => {
    await import("./findSelector.js");
  });

  describe("id", () => {
    it("returns id selector", () => {
      document.body.innerHTML = `
        <div>
          List:
          <ul id="things">
            <li>Thing 1</li>
            <li>Thing 2</li>
          </ul>
        </div>
      `;
      const ul = document.body.querySelector("ul");
      assert(ul);
      expect(findSelector(ul)).toEqual({
        kind: "css",
        selector: "#things",
      });
    });

    it("ignores non-unique ids", () => {
      document.body.innerHTML = `
        <div>
          List:
          <ul role="list" id="things" class="stuff">
            <li>Thing 1</li>
            <li id="things">Thing 2</li>
          </ul>
        </div>
      `;
      const ul = document.body.querySelector("ul");
      assert(ul);
      expect(findSelector(ul)).toEqual({
        kind: "css",
        selector: '[role="list"]',
      });
    });

    it("prioritizes id selector", () => {
      document.body.innerHTML = `
        <div>
          List:
          <ul role="list" id="things">
            <li>Thing 1</li>
            <li>Thing 2</li>
          </ul>
        </div>
      `;
      const ul = document.body.querySelector("ul");
      assert(ul);
      expect(findSelector(ul)).toEqual({
        kind: "css",
        selector: "#things",
      });
    });

    it("escapes numeric ids", () => {
      document.body.innerHTML = `
        <div>
          List:
          <ul>
            <li id=1>Thing 1</li>
            <li id=2>Thing 2</li>
          </ul>
        </div>
      `;
      const li = document.body.querySelector("li");
      assert(li);
      expect(findSelector(li)).toEqual({
        kind: "css",
        selector: "#\\31 ",
      });
    });
  });

  describe("role", () => {
    it("returns role selector", () => {
      document.body.innerHTML = `
        <div>
          List:
          <ul role="list">
            <li>Thing 1</li>
            <li>Thing 2</li>
          </ul>
        </div>
      `;
      const ul = document.body.querySelector("ul");
      assert(ul);
      expect(findSelector(ul)).toEqual({
        kind: "css",
        selector: '[role="list"]',
      });
    });
  });

  describe("class", () => {
    it("returns class selector", () => {
      document.body.innerHTML = `
        <div>
          List:
          <ul class="stuff">
            <li>Thing 1</li>
            <li>Thing 2</li>
          </ul>
        </div>
      `;
      const ul = document.body.querySelector("ul");
      assert(ul);
      expect(findSelector(ul)).toEqual({
        kind: "css",
        selector: ".stuff",
      });
    });

    it("returns first unique class selector", () => {
      document.body.innerHTML = `
        <div class="block">
          List:
          <ul class="block stuff other">
            <li>Thing 1</li>
            <li>Thing 2</li>
          </ul>
        </div>
      `;
      const ul = document.body.querySelector("ul");
      assert(ul);
      expect(findSelector(ul)).toEqual({
        kind: "css",
        selector: ".stuff",
      });
    });
  });
});

function findSelector(element: Element): PlaySelector.Type {
  const symbol = Symbol.for("alumnium.findSelector");
  const fn = (window as any)[symbol];
  assert(fn, "findSelector function is not defined on window");
  return fn(element);
}
