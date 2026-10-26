import { readdirSync } from "node:fs";
import fs from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { todoAriaSnapshot } from "../../accessibility/__fixtures__/aria_snapshot.ts";
import { AriaAccessibilityTree } from "../../accessibility/AriaAccessibilityTree.ts";
import { Xml } from "../../xml/Xml.ts";
import { ServerAriaAccessibilityTree } from "./ServerAriaAccessibilityTree.ts";

const fixturesPath = new URL(
  "../../../../alumnium/tests/unit/fixtures/tree/web/",
  import.meta.url,
);
const fixtureNames = readdirSync(fixturesPath)
  .filter((name) => name.startsWith("aria-") && name.endsWith(".xml"))
  .sort();

async function todoTree(): Promise<ServerAriaAccessibilityTree> {
  const xml = await new AriaAccessibilityTree(todoAriaSnapshot).toStr();
  return new ServerAriaAccessibilityTree(xml);
}

describe(ServerAriaAccessibilityTree, () => {
  it("renders addressable elements with IDs and inlines text", async () => {
    const tree = await todoTree();

    expect(tree.toXml()).toMatchInlineSnapshot(`
      "<RootWebArea>
        <heading name="todos" id=2 level=1 />
        <textbox name="What needs to be done?" id=3 placeholder="What needs to be done?" />
        <list id=4>
          <listitem id=5>
            <checkbox id=6 checked="false" />
            buy milk
            <button name="×" id=8 />
          </listitem>
        </list>
        0 items left
      </RootWebArea>"
    `);
  });

  it("maps simplified IDs to raw IDs", async () => {
    const tree = await todoTree();

    expect(tree.getRawId(8)).toBe(8);
  });

  it("keeps addressable generic elements with only text", async () => {
    const xml = await new AriaAccessibilityTree({
      root: {
        role: "fragment",
        name: "",
        children: [
          {
            role: "generic",
            name: "",
            ref: "e1",
            children: [
              {
                role: "paragraph",
                name: "",
                ref: "e2",
                children: ["iPhone 12"],
              },
              {
                role: "generic",
                name: "",
                ref: "e3",
                children: ["Add to cart"],
              },
            ],
          },
        ],
      },
      sharedIds: { e1: "shared-1", e2: "shared-2", e3: "shared-3" },
    }).toStr();

    expect(new ServerAriaAccessibilityTree(xml).toXml()).toMatchInlineSnapshot(`
      "<RootWebArea>
        <paragraph id=3>iPhone 12</paragraph>
        <div id=5>Add to cart</div>
      </RootWebArea>"
    `);
  });

  describe("snapshots", () => {
    it.for(fixtureNames)("%s", async (fixtureName) => {
      const fixtureXml = await fs.readFile(
        new URL(fixtureName, fixturesPath),
        "utf-8",
      );
      const tree = new ServerAriaAccessibilityTree(fixtureXml);

      await expect(tree.toXml()).toMatchFileSnapshot(
        `./__snapshots__/aria/${fixtureName.replace(/\.xml$/, "")}.snap.xml`,
      );
    });
  });

  describe("visible ID audit", () => {
    it.for(fixtureNames)("%s", async (fixtureName) => {
      const rawXml = await fs.readFile(
        new URL(fixtureName, fixturesPath),
        "utf-8",
      );
      const tree = new ServerAriaAccessibilityTree(rawXml);

      expectValidVisibleMappings(tree, rawXml, tree.toXml());
    });
  });
});

function expectValidVisibleMappings(
  tree: ServerAriaAccessibilityTree,
  rawXml: string,
  outputXml: string,
): void {
  const rawTags: Record<number, Xml.Tag> = {};
  for (const root of Xml.parseAnyRootChildren(rawXml)) collectRaw(root);

  const invalid: string[] = [];
  const visibleIds = new Set<string>();
  for (const root of Xml.parseAnyRootChildren(outputXml)) collectOutput(root);
  expect(invalid).toEqual([]);

  function collectRaw(node: Xml.Node): void {
    const tag = Xml.nodeAsTag(node);
    if (!tag) return;
    const rawId = tag.attribs.raw_id;
    if (rawId) rawTags[+rawId] = tag;
    for (const child of tag.children) collectRaw(child);
  }

  function collectOutput(node: Xml.Node): void {
    const tag = Xml.nodeAsTag(node);
    if (!tag) return;
    const id = tag.attribs.id;
    if (id) {
      if (visibleIds.has(id)) invalid.push(`duplicate visible id=${id}`);
      visibleIds.add(id);
      const rawId = tree.getRawId(id);
      const rawTag = rawTags[rawId];
      if (!rawTag) invalid.push(`id=${id} maps to missing raw_id=${rawId}`);
      else if (!rawTag.attribs.sharedId)
        invalid.push(
          `id=${id} maps to unaddressable ${rawTag.tagName} raw_id=${rawId}`,
        );
    }
    for (const child of tag.children) collectOutput(child);
  }
}
