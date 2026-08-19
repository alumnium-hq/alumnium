import { describe, expect, it } from "vitest";
import { Xml } from "./Xml.ts";
import { XmlRenderer } from "./XmlRenderer.ts";

describe("XmlRenderer", () => {
  it("formats nested elements with two spaces by default", () => {
    const root = Xml.tag("root", { id: "1" }, [
      Xml.tag("button", { name: "OK" }),
    ]);

    expect(XmlRenderer.render([root])).toMatchInlineSnapshot(`
      "<root id=1>
        <button name="OK" />
      </root>"
    `);
  });

  it("supports custom indentation", () => {
    const root = Xml.tag("root", {}, [Xml.tag("child")]);

    expect(XmlRenderer.render([root], { indentation: "\t" }))
      .toMatchInlineSnapshot(`
        "<root>
        	<child />
        </root>"
      `);
  });

  it("aliases tag names when rendering", () => {
    const generic = Xml.tag("generic", { id: "1" }, [Xml.text("Text")]);

    expect(
      XmlRenderer.render(generic, { tagAliases: { generic: "div" } }),
    ).toBe("<div id=1>Text</div>");
    expect(generic.tagName).toBe("generic");
  });

  it("removes formatting whitespace when minified", () => {
    const root = Xml.tag("root", {}, [Xml.tag("child")]);

    expect(XmlRenderer.render([root], { minify: true })).toMatchInlineSnapshot(
      `"<root><child /></root>"`,
    );
  });

  it("sanitizes raw text and attributes", () => {
    const root = Xml.tag("root", { label: 'a < b & "c"\n' }, [
      Xml.text("<< Back & done"),
    ]);

    expect(XmlRenderer.render([root])).toMatchInlineSnapshot(
      `"<root label="a &lt; b &amp; &quot;c&quot;&#xA;">&lt;&lt; Back &amp; done</root>"`,
    );
  });

  it("renders a sole single-line text child inline", () => {
    const button = Xml.tag("Button", { id: "53", clickable: "true" }, [
      Xml.text(" = "),
    ]);

    expect(XmlRenderer.render(button)).toBe(
      "<Button id=53 clickable>=</Button>",
    );
  });

  it("sanitizes sole single-line text rendered inline", () => {
    const button = Xml.tag("Button", {}, [Xml.text("< Back & done")]);

    expect(XmlRenderer.render(button)).toBe(
      "<Button>&lt; Back &amp; done</Button>",
    );
  });

  it("indents every line of a sole multiline text child", () => {
    const root = Xml.tag("root", {}, [
      Xml.tag("div", { id: "33" }, [
        Xml.text(
          "IP address: 158.140.129.251\r\nTime: now\r\n\r\nURL: example\n",
        ),
      ]),
    ]);

    expect(XmlRenderer.render(root)).toMatchInlineSnapshot(`
      "<root>
        <div id=33>
          IP address: 158.140.129.251
          Time: now
          
          URL: example
        </div>
      </root>"
    `);
  });

  it("renders empty attributes explicitly", () => {
    const root = Xml.tag("root", { empty: "" });

    expect(XmlRenderer.render([root])).toMatchInlineSnapshot(`"<root />"`);
  });

  it("renders compact attributes", () => {
    const root = Xml.tag("root", {
      enabled: "true",
      disabled: "false",
      empty: "",
      count: "123",
      offset: "-12",
      ratio: "1.25",
      paddedId: "00123",
      trailingDecimal: "1.",
      leadingDecimal: ".5",
      exponent: "1e3",
      label: "Hello world",
    });

    expect(
      XmlRenderer.render([root], { compactAttrs: true }),
    ).toMatchInlineSnapshot(
      `"<root enabled count=123 offset=-12 ratio=1.25 paddedId="00123" trailingDecimal="1." leadingDecimal=".5" exponent="1e3" label="Hello world" />"`,
    );
  });

  it("preserves content under xml:space preserve", () => {
    const elements = Xml.parseRootChildren(
      '<root xml:space="preserve"> before <child> inside </child> after </root>',
    );

    expect(
      XmlRenderer.render(elements as Xml.AnyElement[]),
    ).toMatchInlineSnapshot(
      `"<root xml:space="preserve"> before <child> inside </child> after </root>"`,
    );
  });

  it("parses valueless attributes without nesting self-closing siblings", () => {
    const elements = Xml.parseRootChildren(
      '<link focusable/><StaticText name="Explore GitHub Copilot"/>',
    );

    expect(XmlRenderer.render(elements as Xml.AnyElement[]))
      .toMatchInlineSnapshot(`
        "<link focusable />
        <StaticText name="Explore GitHub Copilot" />"
      `);
  });

  it("round-trips compact unquoted numeric IDs as sibling self-closing tags", () => {
    const rendered = XmlRenderer.render(
      [Xml.tag("LineBreak", { id: "13" }), Xml.tag("button", { id: "14" })],
      { minify: true },
    );

    const elements = Xml.parseRootChildren(rendered);
    const first = Xml.nodeAsTag(elements[0]!);
    const second = Xml.nodeAsTag(elements[1]!);

    expect(first?.attribs.id).toBe("13");
    expect(second?.attribs.id).toBe("14");
    expect(second?.children).toHaveLength(0);
  });

  it("formats multiple roots, comments, CDATA, and directives", () => {
    const elements = Xml.parseRootChildren(
      "<?target value?><one><!-- note --><![CDATA[ content ]]></one><two/>",
    );

    expect(XmlRenderer.render(elements as Xml.AnyElement[]))
      .toMatchInlineSnapshot(`
        "<?target value?>
        <one>
          <!-- note -->
          <![CDATA[ content ]]>
        </one>
        <two />"
      `);
  });

  it("minifies multiple roots and special nodes", () => {
    const elements = Xml.parseRootChildren(
      "<?target value?><one><!-- note --><![CDATA[ content ]]></one><two/>",
    );

    expect(
      XmlRenderer.render(elements as Xml.AnyElement[], { minify: true }),
    ).toMatchInlineSnapshot(
      `"<?target value?><one><!-- note --><![CDATA[ content ]]></one><two />"`,
    );
  });
});
