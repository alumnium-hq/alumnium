import { Element, Text } from "domhandler";
import { describe, expect, it } from "vitest";
import { Xml } from "./Xml.ts";

function el(
  tag: string,
  attrs: Record<string, string>,
  children: Xml.AnyElement[] = [],
): Element {
  const e = new Element(tag, attrs);
  e.children = children as any;
  return e;
}

function text(data: string): Text {
  return new Text(data);
}

describe("Xml.format", () => {
  it("preserves unicode text content without encoding", () => {
    const xml = Xml.format([el("root", {}, [text("1701–1870")])]);
    expect(xml).toContain("1701–1870");
    expect(xml).not.toContain("&#x2013;");
  });

  it("escapes < and & in text nodes", () => {
    const xml = Xml.format([el("root", {}, [text("<< Back & done")])]);
    expect(xml).toContain("&lt;&lt; Back &amp; done");
  });

  it("escapes control characters in attribute values", () => {
    const xml = Xml.format([el("root", { name: "hello\nworld" })]);
    expect(xml).toContain('name="hello&#xA;world"');
    expect(xml).not.toContain("hello\nworld");
  });

  it("escapes < and & in attribute values", () => {
    const xml = Xml.format([el("root", { label: "a < b & c" })]);
    expect(xml).toContain('label="a &lt; b &amp; c"');
  });

  it("escapes double-quotes in attribute values", () => {
    const xml = Xml.format([el("root", { name: 'say "hi"' })]);
    expect(xml).toContain('name="say &quot;hi&quot;"');
  });

  it("does not escape apostrophes in text nodes", () => {
    const xml = Xml.format([el("root", {}, [text("We're happy")])]);
    expect(xml).toContain("We're happy");
    expect(xml).not.toContain("&apos;");
  });

  it("produces parseable XML when text contains angle brackets", () => {
    const xml = Xml.format([el("root", {}, [text("<< Back")])]);
    expect(() => Xml.parseRootChildren(xml)).not.toThrow();
  });

  it("produces parseable XML when attribute contains a newline", () => {
    const xml = Xml.format([el("root", { name: "line1\nline2" })]);
    expect(() => Xml.parseRootChildren(xml)).not.toThrow();
  });

  it("formats nested elements", () => {
    const xml = Xml.format([
      el("root", { id: "1" }, [el("button", { name: "OK" })]),
    ]);
    expect(xml).toContain('<root id="1">');
    expect(xml).toContain('<button name="OK"/>');
  });
});
