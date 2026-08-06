import { describe, expect, it } from "vitest";
import { Xml } from "./Xml.ts";
import { XmlRenderer } from "./XmlRenderer.ts";

describe("XmlRenderer", () => {
  it("formats nested elements with two spaces by default", () => {
    const root = Xml.element("root", { id: "1" }, [
      Xml.element("button", { name: "OK" }),
    ]);

    expect(XmlRenderer.render([root])).toMatchInlineSnapshot(`
      "<root id=1>
        <button name="OK"/>
      </root>"
    `);
  });

  it("supports custom indentation", () => {
    const root = Xml.element("root", {}, [Xml.element("child")]);

    expect(XmlRenderer.render([root], { indentation: "\t" }))
      .toMatchInlineSnapshot(`
        "<root>
        \t<child/>
        </root>"
      `);
  });

  it("removes formatting whitespace when minified", () => {
    const root = Xml.element("root", {}, [Xml.element("child")]);

    expect(XmlRenderer.render([root], { minify: true })).toMatchInlineSnapshot(
      `"<root><child/></root>"`,
    );
  });

  it("sanitizes raw text and attributes", () => {
    const root = Xml.element("root", { label: 'a < b & "c"\n' }, [
      Xml.text("<< Back & done"),
    ]);

    expect(XmlRenderer.render([root])).toMatchInlineSnapshot(`
      "<root label="a &lt; b &amp; &quot;c&quot;&#xA;">
        &lt;&lt; Back &amp; done
      </root>"
    `);
  });

  it("renders empty attributes explicitly", () => {
    const root = Xml.element("root", { empty: "" });

    expect(XmlRenderer.render([root])).toMatchInlineSnapshot(
      `"<root/>"`,
    );
  });

  it("renders compact attributes", () => {
    const root = Xml.element("root", {
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
      `"<root enabled count=123 offset=-12 ratio=1.25 paddedId="00123" trailingDecimal="1." leadingDecimal=".5" exponent="1e3" label="Hello world"/>"`,
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
        <two/>"
      `);
  });

  it("minifies multiple roots and special nodes", () => {
    const elements = Xml.parseRootChildren(
      "<?target value?><one><!-- note --><![CDATA[ content ]]></one><two/>",
    );

    expect(
      XmlRenderer.render(elements as Xml.AnyElement[], { minify: true }),
    ).toMatchInlineSnapshot(
      `"<?target value?><one><!-- note --><![CDATA[ content ]]></one><two/>"`,
    );
  });
});
