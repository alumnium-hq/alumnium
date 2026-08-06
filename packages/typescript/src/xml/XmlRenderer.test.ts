import { type CheerioOptions, load } from "cheerio";
import { describe, expect, it } from "vitest";
import { Xml } from "./Xml.ts";
import { XmlRenderer } from "./XmlRenderer.ts";

describe("XmlRenderer", () => {
  it("formats nested elements with two spaces by default", () => {
    const root = Xml.element("root", { id: "1" }, [
      Xml.element("button", { name: "OK" }),
    ]);

    expect(XmlRenderer.render([root])).toMatchInlineSnapshot(`
      "<root id="1">
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

  it("renders compact XML when minified", () => {
    const root = Xml.element("root", {}, [Xml.element("child")]);
    expect(
      XmlRenderer.render([root], {
        minify: true,
        xmlMode: true,
        selfClosingTags: true,
      }),
    ).toMatchInlineSnapshot(`"<root><child/></root>"`);
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

  describe("dom-serializer upstream tests", () => {
    describe("render DOM parsed with htmlparser2", () => {
      describe("(html)", () => {
        const htmlFunction = html.bind(null, { _useHtmlParser2: true });

        it("should handle double quotes within single quoted attributes properly", () => {
          const markup = "<hr class='an \"edge\" case' />";
          expect(htmlFunction(markup)).toStrictEqual(
            '<hr class="an &quot;edge&quot; case">',
          );
        });

        it("should escape entities to utf8 if requested", () => {
          const markup = '<a href="a < b &quot; & c">& " &lt; &gt;</a>';
          expect(
            html({ _useHtmlParser2: true, encodeEntities: "utf8" }, markup),
          ).toStrictEqual(
            '<a href="a < b &quot; &amp; c">&amp; " &lt; &gt;</a>',
          );
        });

        it("should stringify non-string attribute values before escaping", () => {
          const options: LoadingOptions = { _useHtmlParser2: true };
          const $ = load("<div></div>", options, true);
          const div = $("div")[0]!;
          (div.attribs as Record<string, unknown>).width = 42;

          expect(XmlRenderer.render($._root, { minify: true })).toStrictEqual(
            '<div width="42"></div>',
          );
        });
      });

      describe(
        "(html, {})",
        testBody.bind(null, html.bind(null, { _useHtmlParser2: true })),
      );

      describe(
        "(html, {decodeEntities: false})",
        testBody.bind(
          null,
          html.bind(null, { _useHtmlParser2: true, decodeEntities: false }),
        ),
      );

      describe("(xml)", () => {
        it("should render CDATA correctly", () => {
          const markup =
            "<a> <b> <![CDATA[ asdf&asdf ]]> <c/> <![CDATA[ asdf&asdf ]]> </b> </a>";
          expect(xml(markup)).toStrictEqual(markup);
        });

        it('should append ="" to attributes with no value', () => {
          expect(xml("<div dropdown-toggle>")).toStrictEqual(
            '<div dropdown-toggle=""/>',
          );
        });

        it('should append ="" to boolean attributes with no value', () => {
          expect(xml("<input disabled>")).toStrictEqual('<input disabled=""/>');
        });

        it("should preserve XML prefixes on attributes", () => {
          const markup =
            '<div xmlns:ex="http://example.com/ns"><p ex:ample="attribute">text</p></div>';
          expect(xml(markup)).toStrictEqual(markup);
        });

        it("should preserve mixed-case XML elements and attributes", () => {
          const markup = '<svg viewBox="0 0 8 8"><radialGradient/></svg>';
          expect(xml(markup)).toStrictEqual(markup);
        });

        it("should encode entities in otherwise special tags", () => {
          expect(xml('<script>"<br/>"</script>')).toStrictEqual(
            "<script>&quot;<br/>&quot;</script>",
          );
        });

        it("should not encode entities if disabled", () => {
          const markup = '<script>"<br/>"</script>';
          expect(xml(markup, { decodeEntities: false })).toStrictEqual(markup);
        });

        it("should stringify non-string SVG attribute values before escaping", () => {
          const $ = load("<svg><rect/></svg>", { xmlMode: true }, true);
          const rect = $("rect")[0]!;
          (rect.attribs as Record<string, unknown>).width = 42;
          (rect.attribs as Record<string, unknown>).height = 24;

          expect(
            XmlRenderer.render($._root, { xmlMode: true, minify: true }),
          ).toStrictEqual('<svg><rect width="42" height="24"/></svg>');
        });
      });
    });

    describe("(xml, {selfClosingTags: false})", () => {
      it("should render childless nodes with an explicit closing tag", () => {
        expect(
          xml("<foo /><bar></bar>", { selfClosingTags: false }),
        ).toStrictEqual("<foo></foo><bar></bar>");
      });
    });

    describe("(html, {selfClosingTags: true})", () => {
      it("should render <br /> tags correctly", () => {
        const markup = "<br />";
        expect(
          html(
            {
              _useHtmlParser2: true,
              decodeEntities: false,
              selfClosingTags: true,
            },
            markup,
          ),
        ).toStrictEqual(markup);
      });
    });

    describe("(html, {selfClosingTags: false})", () => {
      it("should render childless SVG nodes with an explicit closing tag", () => {
        const markup =
          '<svg><circle x="12" y="12"></circle><path d="123M"></path><polygon points="60,20 100,40 100,80 60,100 20,80 20,40"></polygon></svg>';
        expect(
          html(
            {
              _useHtmlParser2: true,
              decodeEntities: false,
              selfClosingTags: false,
            },
            markup,
          ),
        ).toStrictEqual(markup);
      });
    });

    function testBody(
      htmlFunction: (input: string, options?: LoadingOptions) => string,
    ): void {
      it("should render <br /> tags without a slash", () => {
        expect(htmlFunction("<br />")).toStrictEqual("<br>");
      });

      it("should retain encoded HTML content within attributes", () => {
        const markup = '<hr class="cheerio &amp; node = happy parsing" />';
        expect(htmlFunction(markup)).toStrictEqual(
          '<hr class="cheerio &amp; node = happy parsing">',
        );
      });

      it('should shorten the "checked" attribute when it contains the value "checked"', () => {
        expect(htmlFunction("<input checked/>")).toStrictEqual(
          "<input checked>",
        );
      });

      it("should render empty attributes if asked for", () => {
        expect(
          htmlFunction("<input checked/>", { emptyAttrs: true }),
        ).toStrictEqual('<input checked="">');
      });

      it('should not shorten the "name" attribute when it contains the value "name"', () => {
        expect(htmlFunction('<input name="name"/>')).toStrictEqual(
          '<input name="name">',
        );
      });

      it('should not append ="" to attributes with no value', () => {
        expect(htmlFunction("<div dropdown-toggle>")).toStrictEqual(
          "<div dropdown-toggle></div>",
        );
      });

      it("should render comments correctly", () => {
        expect(htmlFunction("<!-- comment -->")).toStrictEqual(
          "<!-- comment -->",
        );
      });

      it("should render whitespace by default", () => {
        const markup =
          '<a href="./haha.html">hi</a> <a href="./blah.html">blah</a>';
        expect(htmlFunction(markup)).toStrictEqual(markup);
      });

      it("should preserve multiple hyphens in data attributes", () => {
        const markup = '<div data-foo-bar-baz="value"></div>';
        expect(htmlFunction(markup)).toStrictEqual(markup);
      });

      it("should not encode characters in script tag", () => {
        const markup = '<script>alert("hello world")</script>';
        expect(htmlFunction(markup)).toStrictEqual(markup);
      });

      it("should not encode tags in script tag", () => {
        const markup = '<script>"<br>"</script>';
        expect(htmlFunction(markup)).toStrictEqual(markup);
      });

      it("should not encode json data", () => {
        const markup =
          '<script>var json = {"simple_value": "value", "value_with_tokens": "&quot;here & \'there\'&quot;"};</script>';
        expect(htmlFunction(markup)).toStrictEqual(markup);
      });

      it("should render childless SVG nodes with a closing slash in HTML mode", () => {
        const markup =
          '<svg><circle x="12" y="12"/><path d="123M"/><polygon points="60,20 100,40 100,80 60,100 20,80 20,40"/></svg>';
        expect(htmlFunction(markup)).toStrictEqual(markup);
      });

      it("should render childless MathML nodes with a closing slash in HTML mode", () => {
        const markup = "<math><infinity/></math>";
        expect(htmlFunction(markup)).toStrictEqual(markup);
      });

      it("should allow SVG elements to have children", () => {
        const markup =
          '<svg><circle cx="12" r="12"><title>dot</title></circle></svg>';
        expect(htmlFunction(markup)).toStrictEqual(markup);
      });

      it("should not include extra whitespace in SVG self-closed elements", () => {
        const markup = '<svg><image href="x.png"/>     </svg>';
        expect(htmlFunction(markup)).toStrictEqual(markup);
      });

      it("should fix-up bad nesting in SVG in HTML mode", () => {
        expect(
          htmlFunction('<svg><g><image href="x.png"></svg>'),
        ).toStrictEqual('<svg><g><image href="x.png"/></g></svg>');
      });

      it("should preserve XML prefixed attributes on inline SVG nodes in HTML mode", () => {
        const markup =
          '<svg><text id="t" xml:lang="fr">Bonjour</text><use xlink:href="#t"/></svg>';
        expect(htmlFunction(markup)).toStrictEqual(markup);
      });

      it("should handle mixed-case SVG content in HTML mode", () => {
        const markup = '<svg viewBox="0 0 8 8"><radialGradient/></svg>';
        expect(htmlFunction(markup)).toStrictEqual(markup);
      });

      it("should render HTML content in SVG foreignObject in HTML mode", () => {
        const markup =
          '<svg><foreignObject requiredFeatures=""><img src="test.png" viewbox>text<svg viewBox="0 0 8 8"><circle r="3"/></svg></foreignObject></svg>';
        expect(htmlFunction(markup)).toStrictEqual(markup);
      });

      it("should render iframe nodes with a closing tag in HTML mode", () => {
        const markup = '<iframe src="test"></iframe>';
        expect(htmlFunction(markup)).toStrictEqual(markup);
      });

      it("should encode double quotes in attribute", () => {
        const markup = `<img src="/" alt='title" onerror="alert(1)" label="x'>`;
        expect(htmlFunction(markup)).toStrictEqual(
          '<img src="/" alt="title&quot; onerror=&quot;alert(1)&quot; label=&quot;x">',
        );
      });
    }

    interface LoadingOptions extends CheerioOptions {
      _useHtmlParser2?: boolean;
      decodeEntities?: boolean;
      encodeEntities?: "utf8";
      selfClosingTags?: boolean;
      emptyAttrs?: boolean;
    }

    function html(
      preset: LoadingOptions,
      markup: string,
      options: LoadingOptions = {},
    ): string {
      const mergedOptions = { ...preset, ...options };
      const $ = load(markup, mergedOptions, true);
      return XmlRenderer.render($._root, { ...mergedOptions, minify: true });
    }

    function xml(markup: string, options: LoadingOptions = {}): string {
      const mergedOptions = { ...options, xmlMode: true };
      const $ = load(markup, mergedOptions, true);
      return XmlRenderer.render($._root, { ...mergedOptions, minify: true });
    }
  });
});
