import { describe, expect, it } from "bun:test";
import { findOne } from "domutils";
import { parseDocument } from "htmlparser2";
import type { ElementsCache } from "./ElementsCache.js";
import { ElementsCacheTree } from "./ElementsCacheTree.js";

describe("ElementsCacheTree", () => {
  describe("extractElements", () => {
    it("resolves all elements in the tree", () => {
      const xml = `<root>
        <div id="1" class="container">
          <p id="2" class="text">Hello</p>
          <span id="3" class="text">World</span>
        </div>
        <footer id="4" class="footer">Footer content</footer>
      </root>`;
      const tree = new ElementsCacheTree(xml);
      const elements = tree.extractElementsList();
      expect(elements).toHaveLength(5);
      expect(elements[1]?.attribs.id).toBe("1");
      expect(elements[2]?.attribs.id).toBe("2");
      expect(elements[3]?.attribs.id).toBe("3");
      expect(elements[4]?.attribs.id).toBe("4");
    });
  });

  describe("extractAttrs", () => {
    it("extracts attrs replacing id with index", () => {
      const xml = `<root>
        <button id="1" name="Login">Click me</button>
        <input id="2" name="username" type="text"/>
      </root>`;
      const tree = new ElementsCacheTree(xml);

      expect(tree.extractAttrs(1)).toEqual({
        role: "button",
        name: "Login",
        text: "Click me",
        index: 0,
      });
    });

    it("preserves empty attributes", () => {
      const xml = `<root>
        <button id="1" name="">
          Search
        </button>
      </root>`;
      const tree = new ElementsCacheTree(xml);

      expect(tree.extractAttrs(1)).toEqual({
        role: "button",
        text: "Search",
        name: "",
        index: 0,
      });
    });

    it("omits text attr when element has no text", () => {
      const xml = '<button id="1" name="Login" />';
      const tree = new ElementsCacheTree(xml);

      expect(tree.extractAttrs(1)).toEqual({
        role: "button",
        name: "Login",
        index: 0,
      });
    });

    it("extracts nested text when direct text is empty", () => {
      const xml = `<root>
        <button id="1" focusable="true">
          <generic id="2">Search <span>now</span></generic>
        </button>
      </root>`;
      const tree = new ElementsCacheTree(xml);

      expect(tree.extractAttrs(1)).toEqual({
        role: "button",
        focusable: "true",
        text: "Search now",
        index: 0,
      });
    });

    it("extracts direct text when found", () => {
      const xml = `<root>
        <button id="1" focusable="true">
          Find
          <generic id="2">Search <span>now</span></generic>
        </button>
      </root>`;
      const tree = new ElementsCacheTree(xml);

      expect(tree.extractAttrs(1)).toEqual({
        role: "button",
        focusable: "true",
        text: "Find",
        index: 0,
      });
    });

    it("uses text to disambiguate index when attrs otherwise match", () => {
      const xml = `<root>
        <columnheader id="1" readonly="false" required="false">First Name</columnheader>
        <columnheader id="2" readonly="false" required="false">Last Name</columnheader>
        <columnheader id="3" readonly="false" required="false">Email</columnheader>
      </root>`;

      const tree = new ElementsCacheTree(xml);
      const el0 = tree.extractAttrs(1);
      const el1 = tree.extractAttrs(2);
      const el2 = tree.extractAttrs(3);

      expect(el0).toEqual({
        role: "columnheader",
        readonly: "false",
        required: "false",
        text: "First Name",
        index: 0,
      });
      expect(el1).toEqual({
        role: "columnheader",
        readonly: "false",
        required: "false",
        text: "Last Name",
        index: 0,
      });
      expect(el2).toEqual({
        role: "columnheader",
        readonly: "false",
        required: "false",
        text: "Email",
        index: 0,
      });
    });

    it("computes index among duplicates with same attrs", () => {
      const xml = `<root>
        <button id="1" name="Action" class="btn"/>
        <button id="2" name="Action" class="btn"/>
        <button id="3" name="Action" class="btn"/>
      </root>`;
      const tree = new ElementsCacheTree(xml);

      expect(tree.extractAttrs(1)).toEqual({
        role: "button",
        name: "Action",
        class: "btn",
        index: 0,
      });
      expect(tree.extractAttrs(2)).toEqual({
        role: "button",
        name: "Action",
        class: "btn",
        index: 1,
      });
      expect(tree.extractAttrs(3)).toEqual({
        role: "button",
        name: "Action",
        class: "btn",
        index: 2,
      });
    });

    it("returns null when id is not in tree", () => {
      const xml = "<button id='1'>Login</button>";
      const tree = new ElementsCacheTree(xml);

      expect(tree.extractAttrs(999)).toBeNull;
    });

    it("handles attr values with '", () => {
      const xml = `<root><button id="1" name="Bob's account"/></root>`;
      const tree = new ElementsCacheTree(xml);

      expect(tree.extractAttrs(1)).toEqual({
        role: "button",
        name: "Bob's account",
        index: 0,
      });
    });

    it("handles text values with '", () => {
      const xml = `<root><button id="1">Bob's button</button></root>`;
      const tree = new ElementsCacheTree(xml);

      expect(tree.extractAttrs(1)).toEqual({
        role: "button",
        text: "Bob's button",
        index: 0,
      });
    });
  });

  describe("resolveElements", () => {
    it("resolves all elements when all targets are present", () => {
      const elements: ElementsCache.Element[] = [
        { role: "button", index: 0, name: "Login" },
        { role: "input", index: 0, name: "username" },
      ];
      const xml = `<root>
        <button id="1" name="Login"/>
        <input id="2" name="username"/>
        <button id="3" name="Submit"/>
      </root>`;
      const tree = new ElementsCacheTree(xml);

      expect(tree.resolveElements(elements)).toEqual({
        0: 1,
        1: 2,
      });
    });

    it("resolves elements after id changes with same attrs", () => {
      const elements: ElementsCache.Element[] = [
        { role: "button", index: 0, name: "Login" },
        { role: "input", index: 0, name: "username" },
      ];
      const xml = `<root>
        <button id="10" name="Login"/>
        <input id="20" name="username"/>
      </root>`;
      const tree = new ElementsCacheTree(xml);

      expect(tree.resolveElements(elements)).toEqual({
        0: 10,
        1: 20,
      });
    });

    it("resolves by text when role and attrs match", () => {
      const elements: ElementsCache.Element[] = [
        {
          role: "columnheader",
          index: 0,
          readonly: "false",
          required: "false",
          text: "Last Name",
        },
      ];
      const xml = `<root>
        <columnheader id="100" readonly="false" required="false">First Name</columnheader>
        <columnheader id="200" readonly="false" required="false">Last Name</columnheader>
        <columnheader id="300" readonly="false" required="false">Email</columnheader>
      </root>`;
      const tree = new ElementsCacheTree(xml);

      expect(tree.resolveElements(elements)).toEqual({
        0: 200,
      });
    });

    it("resolves with nested text from child nodes", () => {
      const elements: ElementsCache.Element[] = [
        { role: "button", index: 0, name: "", text: "Search" },
      ];
      const xml = `<root>
        <button name="" id="10" focusable="true">
          <generic id="11">Search</generic>
        </button>
        <button name="" id="20" focusable="true">
          <generic id="21">Cancel</generic>
        </button>
      </root>`;
      const tree = new ElementsCacheTree(xml);

      expect(tree.resolveElements(elements)).toEqual({
        0: 10,
      });
    });

    it("returns null when target element is missing", () => {
      const elements: ElementsCache.Element[] = [
        { role: "button", index: 0, name: "Logout" },
      ];
      const xml = '<button id="1" name="Login"/>';
      const tree = new ElementsCacheTree(xml);

      expect(tree.resolveElements(elements)).toBeNull();
    });

    it("returns null when index is out of range", () => {
      const elements: ElementsCache.Element[] = [
        { role: "button", index: 5, name: "Action" },
      ];
      const xml =
        '<button id="1" name="Action"/><button id="2" name="Action"/>';
      const tree = new ElementsCacheTree(xml);

      expect(tree.resolveElements(elements)).toBeNull();
    });

    it("returns empty mapping for an empty elements list", () => {
      const tree = new ElementsCacheTree("<tree/>");
      expect(tree.resolveElements([])).toEqual({});
    });

    it("resolves independent of attr order with equivalent attrs", () => {
      const elements: ElementsCache.Element[] = [
        { role: "button", name: "Login", index: 0, focusable: "true" },
      ];
      const xml = '<root><button id="1" focusable="true" name="Login"/></root>';
      const tree = new ElementsCacheTree(xml);

      expect(tree.resolveElements(elements)).toEqual({
        0: 1,
      });
    });

    it("resolves attrs with '", () => {
      const elements: ElementsCache.Element[] = [
        { role: "button", index: 0, name: "Bob's account" },
      ];
      const xml = `<root><button id="1" name="Bob's account"/></root>`;
      const tree = new ElementsCacheTree(xml);

      expect(tree.resolveElements(elements)).toEqual({
        0: 1,
      });
    });

    it("resolves text with '", () => {
      const elements: ElementsCache.Element[] = [
        { role: "button", index: 0, text: "Bob's button" },
      ];
      const xml = `<root><button id="1">Bob's button</button></root>`;
      const tree = new ElementsCacheTree(xml);

      expect(tree.resolveElements(elements)).toEqual({
        0: 1,
      });
    });
  });

  describe("utils", () => {
    describe("normalizeText", () => {
      it("replaces collapses whitespace and trims the string", () => {
        const input = "  This   is   a   test.  ";
        const expectedOutput = "This is a test.";
        expect(ElementsCacheTree.normalizeText(input)).toBe(expectedOutput);
      });
    });

    describe("extractText", () => {
      it("extracts direct text when present", () => {
        const xml = `<root>
          <button id="1">
            Find
            <generic id="2">Search <span>now</span></generic>
          </button>
        </root>`;
        const doc = parseDocument(xml, { xmlMode: true });
        const button = findOne((el) => el.attribs.id === "1", doc);

        expect(button).toBeDefined();
        expect(ElementsCacheTree.extractText(button!)).toBe("Find");
      });

      it("extracts nested text when direct text is empty", () => {
        const xml = `<root>
          <button id="1">
            <generic id="2">Search <span>now</span></generic>
          </button>
        </root>`;
        const doc = parseDocument(xml, { xmlMode: true });
        const button = findOne((el) => el.attribs.id === "1", doc);

        expect(button).toBeDefined();
        expect(ElementsCacheTree.extractText(button!)).toBe("Search now");
      });
    });
  });
});
