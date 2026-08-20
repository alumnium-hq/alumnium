import fs from "node:fs/promises";
import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ChromiumAccessibilityTree as ClientChromiumAccessibilityTree } from "../../accessibility/ChromiumAccessibilityTree.ts";
import { ServerChromiumAccessibilityTree } from "./ServerChromiumAccessibilityTree.ts";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { lit } from "smollit";
import { Xml } from "../../xml/Xml.ts";

describe(ServerChromiumAccessibilityTree, () => {
  describe("toXml", () => {
    it("toXml converts tree to expected XML", async () => {
      const tree = await basicChromiumTree();

      expect(tree.toXml()).toMatchInlineSnapshot(`
        "<RootWebArea name="TodoMVC: React" id=1 focusable>
          <div id=4>
            <div id=5>
              <heading id=6 level=1>todos</heading>
              <div id=8>
                <textbox name="New Todo Input" id=9 focusable editable="plaintext" settable />
                <LabelText id=12>New Todo Input</LabelText>
              </div>
            </div>
            <main id=14>
              <div id=15>
                <checkbox id=16 focusable checked="false" />
                <LabelText id=17>
                  <div id=18>\\u276f</div>
                  <div id=20>Toggle All Input</div>
                </LabelText>
              </div>
              <list id=21>
                <listitem id=22 level=1>
                  <checkbox id=24 focusable focused checked />
                  <LabelText id=25>hello</LabelText>
                </listitem>
                <listitem id=27 level=1>
                  <checkbox id=29 focusable checked="false" />
                  <LabelText id=30>he</LabelText>
                </listitem>
              </list>
            </main>
            <div id=32>
              1 item left!
              <list id=35>
                <listitem id=36 level=1>
                  <link id=37 focusable>All</link>
                </listitem>
                <listitem id=39 level=1>
                  <link id=40 focusable>Active</link>
                </listitem>
                <listitem id=42 level=1>
                  <link id=43 focusable>Completed</link>
                </listitem>
              </list>
              <button id=45 focusable>Clear completed</button>
            </div>
          </div>
          <contentinfo id=47>
            <paragraph id=48>Double-click to edit a todo</paragraph>
            <paragraph id=50>Created by the TodoMVC Team</paragraph>
            <paragraph id=52>
              Part of
              <link id=54 focusable>TodoMVC</link>
            </paragraph>
          </contentinfo>
        </RootWebArea>"
      `);
    });

    it("toXml supports excluding attributes", async () => {
      const tree = await basicChromiumTree();
      const xml = tree.toXml(new Set(["id", "focusable"]));

      expect(xml.includes(" id=")).toBe(false);
      expect(xml.includes(" focusable=")).toBe(false);
    });

    it("preserves adjacent text sibling boundaries", () => {
      const rawXml = lit`
        <group raw_id="801" ignored="false" name="">
          <none raw_id="802" ignored="true">
            <link raw_id="803" ignored="false" name="Tama's Little Music Shop" focusable="true" url="https://www.youtube.com/@tamamusic">
              <StaticText raw_id="804" ignored="false" name="Tama's Little Music Shop"/>
            </link>
          </none>
          <none raw_id="806" ignored="true">
            <StaticText raw_id="807" ignored="false" name="1.2K views"/>
          </none>
          <generic raw_id="809" ignored="false" name="10 months ago">
            <StaticText raw_id="810" ignored="false" name="10 months ago"/>
          </generic>
        </group>
      `;
      const tree = new ServerChromiumAccessibilityTree(rawXml);

      expect(tree.toXml()).toMatchInlineSnapshot(`
        "<group>
          <link focusable url="https://www.youtube.com/@tamamusic">Tama's Little Music Shop</link>
          1.2K views
          <div>10 months ago</div>
        </group>"
      `);
    });

    it("preserves checkbox checked state", () => {
      const rawXml = lit`
        <main raw_id=40 backendDOMNodeId=32 nodeId="f0:32">
          <generic raw_id=41 backendDOMNodeId=33 nodeId="f0:33">
            <checkbox raw_id=42 backendDOMNodeId=34 nodeId="f0:34" name="❯ Toggle All Input" focusable focused checked/>
            <none raw_id=43 backendDOMNodeId=35 nodeId="f0:35" ignored>
              <generic raw_id=44 backendDOMNodeId=84 nodeId="f0:84">
                <StaticText raw_id=45 nodeId="f0:-1000000047" name="❯">
                  <InlineTextBox raw_id=46 nodeId="f0:-1000000048" name="❯"/>
                </StaticText>
              </generic>
              <StaticText raw_id=47 backendDOMNodeId=61 nodeId="f0:61" name="Toggle All Input">
                <InlineTextBox raw_id=48 nodeId="f0:-1000000049" name="Toggle All Input"/>
              </StaticText>
            </none>
          </generic>
          <list raw_id=49 backendDOMNodeId=36 nodeId="f0:36">
            <listitem raw_id=50 backendDOMNodeId=82 nodeId="f0:82" level=1>
              <none raw_id=51 backendDOMNodeId=81 nodeId="f0:81" ignored>
                <checkbox raw_id=52 backendDOMNodeId=78 nodeId="f0:78" focusable checked="false"/>
                <LabelText raw_id=53 backendDOMNodeId=79 nodeId="f0:79">
                  <StaticText raw_id=54 backendDOMNodeId=88 nodeId="f0:88" name="Buy milk">
                    <InlineTextBox raw_id=55 nodeId="f0:-1000000033" name="Buy milk"/>
                  </StaticText>
                </LabelText>
              </none>
            </listitem>
            <listitem raw_id=56 backendDOMNodeId=96 nodeId="f0:96" level=1>
              <none raw_id=57 backendDOMNodeId=95 nodeId="f0:95" ignored>
                <checkbox raw_id=58 backendDOMNodeId=92 nodeId="f0:92" focusable checked/>
                <LabelText raw_id=59 backendDOMNodeId=93 nodeId="f0:93">
                  <StaticText raw_id=60 backendDOMNodeId=99 nodeId="f0:99" name="Buy bread">
                    <InlineTextBox raw_id=61 nodeId="f0:-1000000044" name="Buy bread"/>
                  </StaticText>
                </LabelText>
              </none>
            </listitem>
          </list>
        </main>
      `;
      const tree = new ServerChromiumAccessibilityTree(rawXml);

      expect(tree.toXml()).toMatchInlineSnapshot(`
        "<main id=1>
          <div id=2>
            <checkbox name="❯ Toggle All Input" id=3 focusable focused checked />
            <div id=4>
              <div id=5>❯</div>
              Toggle All Input
            </div>
          </div>
          <list id=8>
            <listitem id=9 level=1>
              <checkbox id=11 focusable checked="false" />
              <LabelText id=12>Buy milk</LabelText>
            </listitem>
            <listitem id=14 level=1>
              <checkbox id=16 focusable checked />
              <LabelText id=17>Buy bread</LabelText>
            </listitem>
          </list>
        </main>"
      `);
    });

    it("inlines StaticText without assigning IDs to InlineTextBox children", () => {
      const rawXml = lit`
        <link raw_id="7" backendDOMNodeId="70" ignored="false" name="Skip to content" focusable="true" url="https://github.com/alumnium-hq/alumnium/pull/256#start-of-content">
          <StaticText raw_id="8" backendDOMNodeId="80" ignored="false" name="Skip to content">
            <InlineTextBox raw_id="9" ignored="false" name="S"/>
            <InlineTextBox raw_id="10" ignored="false" name="k"/>
            <InlineTextBox raw_id="11" ignored="false" name="ip "/>
            <InlineTextBox raw_id="12" ignored="false" name="to content"/>
          </StaticText>
        </link>
      `;
      const tree = new ServerChromiumAccessibilityTree(rawXml);

      expect(tree.toXml()).toMatchInlineSnapshot(
        `"<link id=1 focusable url="https://github.com/alumnium-hq/alumnium/pull/256#start-of-content">Skip to content</link>"`,
      );
      expect(() => tree.getRawId(3)).toThrow("No element with simplified id=3");
    });

    it("preserves addressable StaticText IDs when trimming", () => {
      const tree = new ServerChromiumAccessibilityTree(lit`
        <none raw_id=283 backendDOMNodeId=317>
          <StaticText raw_id=284 backendDOMNodeId=978 name="published version ">
            <InlineTextBox raw_id=285 name="published "/>
            <InlineTextBox raw_id=286 name="version "/>
          </StaticText>
          <StaticText raw_id=291 backendDOMNodeId=981 name="18 hours ago">
            <InlineTextBox raw_id=292 name="18 "/>
            <InlineTextBox raw_id=293 name="hours "/>
            <InlineTextBox raw_id=294 name="ago"/>
          </StaticText>
        </none>
      `);

      const xml = tree.toXml();
      expect(xml).toBe(lit`
        <div id=1>
          <div id=2>published version</div>
          <div id=3>18 hours ago</div>
        </div>
      `);
      expectVisibleMappings(tree, xml, { 1: 283, 2: 284, 3: 291 });
    });

    it("preserves an addressable generic containing only text", () => {
      const tree = new ServerChromiumAccessibilityTree(lit`
        <generic raw_id=90 backendDOMNodeId=156>
          <paragraph raw_id=97 backendDOMNodeId=35>
            <StaticText raw_id=98 backendDOMNodeId=675 name="iPhone 12" />
          </paragraph>
          <generic raw_id=123 backendDOMNodeId=38>
            <StaticText raw_id=124 backendDOMNodeId=686 name="Add to cart" />
          </generic>
        </generic>
      `);

      const xml = tree.toXml();
      expect(xml).toBe(lit`
        <div id=1>
          <paragraph id=2>iPhone 12</paragraph>
          <div id=4>Add to cart</div>
        </div>
      `);
      expectVisibleMappings(tree, xml, { 1: 90, 2: 97, 4: 123 });
    });

    it("does not assign IDs without backendDOMNodeId", () => {
      const tree = new ServerChromiumAccessibilityTree(lit`
        <paragraph raw_id=10 backendDOMNodeId=20>
          <StaticText raw_id=11 name="Text" />
        </paragraph>
      `);

      const xml = tree.toXml();
      expect(xml).toBe("<paragraph id=1>Text</paragraph>");
      expectVisibleMappings(tree, xml, { 1: 10 });
    });

    it("preserves backend-backed StaticText regardless of mutability", () => {
      const tree = new ServerChromiumAccessibilityTree(lit`
        <paragraph raw_id=10 backendDOMNodeId=20 mutable>
          <StaticText raw_id=11 backendDOMNodeId=21 mutable="false" name="Text" />
          <StaticText raw_id=12 backendDOMNodeId=22 mutable="false" name="More" />
        </paragraph>
      `);

      const xml = tree.toXml();
      expect(xml).toBe(lit`
        <paragraph id=1>
          <div id=2>Text</div>
          <div id=3>More</div>
        </paragraph>
      `);
      expectVisibleMappings(tree, xml, { 1: 10, 2: 11, 3: 12 });
    });

    it("merges backend-less StaticText into its mutable parent", () => {
      const tree = new ServerChromiumAccessibilityTree(lit`
        <paragraph raw_id=10 backendDOMNodeId=20 mutable>
          <StaticText raw_id=11 mutable="false" name="Text" />
        </paragraph>
      `);

      const xml = tree.toXml();
      expect(xml).toBe("<paragraph id=1>Text</paragraph>");
      expectVisibleMappings(tree, xml, { 1: 10 });
    });

    it("keeps a backend-backed document root addressable", () => {
      const tree = new ServerChromiumAccessibilityTree(lit`
        <RootWebArea raw_id=10 backendDOMNodeId=20 mutable="false" focusable focused url="about:blank" />
      `);

      const xml = tree.toXml();
      expect(xml).toBe(
        '<RootWebArea id=1 focusable focused url="about:blank" />',
      );
      expectVisibleMappings(tree, xml, { 1: 10 });
    });

    it("preserves an editable backend-backed shadow child", () => {
      const tree = new ServerChromiumAccessibilityTree(lit`
        <textbox raw_id=10 backendDOMNodeId=20 mutable editable="plaintext" settable>
          <generic raw_id=11 backendDOMNodeId=21 mutable="false" editable="plaintext">
            <StaticText raw_id=12 backendDOMNodeId=22 mutable="false" name="Text" editable="plaintext" />
          </generic>
        </textbox>
      `);

      const xml = tree.toXml();
      expect(xml).toBe(lit`
        <textbox id=1 editable="plaintext" settable>
          <div id=2 editable="plaintext">Text</div>
        </textbox>
      `);
      expectVisibleMappings(tree, xml, { 1: 10, 2: 11 });
    });

    it("unwraps a backend-backed MenuListPopup", () => {
      const tree = new ServerChromiumAccessibilityTree(lit`
        <combobox raw_id=10 backendDOMNodeId=20 mutable focusable hasPopup="menu">
          <MenuListPopup raw_id=11 backendDOMNodeId=21 mutable="false">
            <option raw_id=12 backendDOMNodeId=22 mutable name="One" focusable />
          </MenuListPopup>
        </combobox>
      `);

      const xml = tree.toXml();

      expect(tree.toXml()).toMatchInlineSnapshot(`
        "<combobox expanded="true">
          <option name="One" id=3 focusable selected="false" />
        </combobox>"
      `);

      // The combobox itself is unaddressable, only its options are.
      expectVisibleMappings(tree, xml, { 3: 12 });
    });

    it("sets option selection from the options list value", () => {
      const tree = new ServerChromiumAccessibilityTree(lit`
        <combobox raw_id=10 value="Two">
          <MenuListPopup raw_id=11>
            <option raw_id=12 name="One" selected />
            <option raw_id=13 name="Two" selected="false">
              <StaticText raw_id=14 name="Two" />
            </option>
            <option raw_id=15 name="Three" />
            <option raw_id=16 name="Two" disabled selected />
            <listbox raw_id=17 value="Nested">
              <option raw_id=18 name="Nested" selected />
              <option raw_id=19 name="Other" />
              <option raw_id=20 name="Disabled" disabled selected />
            </listbox>
          </MenuListPopup>
        </combobox>
      `);

      expect(tree.toXml()).toBe(lit`
        <combobox value="Two" expanded="true">
          <option name="One" selected="false" />
          <option selected>Two</option>
          <option name="Three" selected="false" />
          <option name="Two" disabled />
          <listbox value="Nested">
            <option name="Nested" selected />
            <option name="Other" selected="false" />
            <option name="Disabled" disabled />
          </listbox>
        </combobox>
      `);
      expect(tree.toXml(new Set(["selected"]))).not.toContain("selected");
    });

    it("preserves a backend-backed ListMarker ID", () => {
      const tree = new ServerChromiumAccessibilityTree(lit`
        <listitem raw_id=10 backendDOMNodeId=20 mutable level=1>
          <ListMarker raw_id=11 backendDOMNodeId=21 mutable="false" name="1. " />
          <StaticText raw_id=12 backendDOMNodeId=22 mutable="false" name="Text" />
        </listitem>
      `);

      const xml = tree.toXml();
      expect(xml).toBe(lit`
        <listitem id=1 level=1>
          <div id=2>1.</div>
          <div id=3>Text</div>
        </listitem>
      `);
      expectVisibleMappings(tree, xml, { 1: 10, 2: 11, 3: 12 });
    });

    it("preserves an element inside text-only web-area borders", () => {
      const rawXml = lit`
        <Iframe raw_id=14 backendDOMNodeId=15 nodeId="f1:15">
          <RootWebArea raw_id=15 backendDOMNodeId=11 nodeId="f3:11" focusable url="https://the-internet.herokuapp.com/frame_middle">
            <none raw_id=16 backendDOMNodeId=29 nodeId="f3:29" ignored>
              <none raw_id=17 backendDOMNodeId=31 nodeId="f3:31" ignored>
                <generic raw_id=18 backendDOMNodeId=32 nodeId="f3:32">
                  <StaticText raw_id=19 backendDOMNodeId=33 nodeId="f3:33" name="MIDDLE">
                    <InlineTextBox raw_id=20 nodeId="f3:-1000000003" name="MIDDLE"/>
                  </StaticText>
                </generic>
              </none>
            </none>
          </RootWebArea>
        </Iframe>
      `;
      const tree = new ServerChromiumAccessibilityTree(rawXml);

      expect(tree.toXml()).toMatchInlineSnapshot(`
        "<Iframe id=1>
          <RootWebArea id=2 focusable url="https://the-internet.herokuapp.com/frame_middle">
            <div id=5>MIDDLE</div>
          </RootWebArea>
        </Iframe>"
      `);
      expect(tree.getRawId(5)).toBe(18);
    });

    it("trims names and whitespace-only generic nodes", () => {
      const rawXml = lit`
        <generic raw_id="1" ignored="false" name="">
          <generic raw_id="2" ignored="false" name="  Dark Mode  "/>
          <generic raw_id="3" ignored="false" name="      "/>
          <link raw_id="4" ignored="false" name="  Calculator  "/>
        </generic>
      `;
      const tree = new ServerChromiumAccessibilityTree(rawXml);

      expect(tree.toXml()).toMatchInlineSnapshot(`
        "<div>
          <div name="Dark Mode" />
          <link name="Calculator" />
        </div>"
      `);
    });

    it("removes empty generic live regions", () => {
      const rawXml = lit`
        <group raw_id="1" ignored="false" name="">
          <generic raw_id="2" ignored="false" name="" live="polite" atomic="true" relevant="additions text"/>
          <generic raw_id="3" ignored="false" name="" live="assertive" atomic="true" relevant="additions text"/>
          <generic raw_id="4" ignored="false" name="Update" live="polite" atomic="true" relevant="additions text"/>
          <generic raw_id="5" ignored="false" name="" live="polite" focusable="true"/>
          <alert raw_id="6" ignored="false" name="" live="assertive" atomic="true" relevant="additions text"/>
        </group>
      `;
      const tree = new ServerChromiumAccessibilityTree(rawXml);

      expect(tree.toXml()).toMatchInlineSnapshot(`
        "<group>
          <div name="Update" live="polite" atomic relevant="additions text" />
          <div live="polite" focusable />
          <alert live="assertive" atomic relevant="additions text" />
        </group>"
      `);
    });

    it("removes internal editable children", () => {
      const rawXml = lit`
        <RootWebArea raw_id="1" backendDOMNodeId="1" name="Search">
          <combobox raw_id="2" backendDOMNodeId="2" name="Search" focusable="true" editable="plaintext" settable="true">
            <generic raw_id="3" backendDOMNodeId="3" editable="plaintext"/>
          </combobox>
        </RootWebArea>
      `;
      const tree = new ServerChromiumAccessibilityTree(rawXml);

      expect(tree.toXml()).toBe(lit`
        <RootWebArea name="Search" id=1>
          <combobox name="Search" id=2 focusable editable="plaintext" settable />
        </RootWebArea>
      `);
    });

    it("unwraps an only generic child with multiple children", () => {
      const rawXml = lit`
        <listitem raw_id="1" ignored="false" name="" level="1">
          <generic raw_id="2" ignored="false" name="">
            <button raw_id="3" ignored="false" name="API &amp; IaC" focusable="true"/>
            <list raw_id="4" ignored="false" name=""/>
          </generic>
        </listitem>
      `;
      const tree = new ServerChromiumAccessibilityTree(rawXml);

      expect(tree.toXml()).toMatchInlineSnapshot(`
        "<listitem level=1>
          <button name="API &amp; IaC" focusable />
          <list />
        </listitem>"
      `);
    });

    it("preserves generic wrappers around mixed text and element children", () => {
      const rawXml = lit`
        <contentinfo raw_id="1" ignored="false" name="">
          <generic raw_id="2" ignored="false" name="">
            <StaticText raw_id="3" ignored="false" name="Copyright © 2021-2026 "/>
            <link raw_id="4" ignored="false" name="Boni García" focusable="true" url="https://bonigarcia.dev/">
              <StaticText raw_id="5" ignored="false" name="Boni García"/>
            </link>
          </generic>
        </contentinfo>
      `;
      const tree = new ServerChromiumAccessibilityTree(rawXml);

      expect(tree.toXml()).toMatchInlineSnapshot(`
        "<contentinfo>
          <div>
            Copyright © 2021-2026
            <link focusable url="https://bonigarcia.dev/">Boni García</link>
          </div>
        </contentinfo>"
      `);
    });

    it("removes wrappers retained only by empty generic siblings", () => {
      const rawXml = lit`
        <none raw_id="1" ignored="true">
          <none raw_id="2" ignored="true">
            <StaticText raw_id="3" ignored="false" name="Footer section"/>
          </none>
          <generic raw_id="4" ignored="false" name="">
            <none raw_id="5" ignored="true">
              <none raw_id="6" ignored="true">
                <generic raw_id="7" ignored="false" name="">
                  <generic raw_id="8" ignored="false" name="">
                    <StaticText raw_id="9" ignored="false" name="© 2026 Airbnb, Inc."/>
                  </generic>
                  <generic raw_id="10" ignored="false" name="">
                    <generic raw_id="11" ignored="false" name=""/>
                    <generic raw_id="12" ignored="false" name="">
                      <list raw_id="13" ignored="false" name=""/>
                    </generic>
                  </generic>
                </generic>
              </none>
            </none>
          </generic>
        </none>
      `;
      const tree = new ServerChromiumAccessibilityTree(rawXml);

      expect(tree.toXml()).toMatchInlineSnapshot(`
        "<div>
          Footer section
          <div>
            © 2026 Airbnb, Inc.
            <list />
          </div>
        </div>"
      `);
    });

    it("preserves generic wrappers alongside siblings", () => {
      const rawXml = lit`
        <group raw_id="1" ignored="false" name="">
          <generic raw_id="2" ignored="false" name="">
            <button raw_id="3" ignored="false" name="First"/>
            <button raw_id="4" ignored="false" name="Second"/>
          </generic>
          <button raw_id="5" ignored="false" name="Sibling"/>
        </group>
      `;
      const tree = new ServerChromiumAccessibilityTree(rawXml);

      expect(tree.toXml()).toMatchInlineSnapshot(`
        "<group>
          <div>
            <button name="First" />
            <button name="Second" />
          </div>
          <button name="Sibling" />
        </group>"
      `);
    });

    it("trims tree", async () => {
      const rawXml = lit`
        <RootWebArea raw_id="1" backendDOMNodeId="1" nodeId="1" ignored="false" name="YouTube" focusable="true" url="https://www.youtube.com/">
          <none raw_id="2" backendDOMNodeId="120" nodeId="120" ignored="true">
            <generic raw_id="3" backendDOMNodeId="16" nodeId="16" ignored="false" name="">
              <generic raw_id="4" backendDOMNodeId="2" nodeId="2" ignored="false" name="">
                <generic raw_id="5" backendDOMNodeId="847" nodeId="847" ignored="false" name=""/>
                <generic raw_id="6" backendDOMNodeId="868" nodeId="868" ignored="false" name="">
                  <generic raw_id="7" backendDOMNodeId="17" nodeId="17" ignored="false" name="">
                    <banner raw_id="8" backendDOMNodeId="18" nodeId="18" ignored="false" name="">
                      <generic raw_id="9" backendDOMNodeId="871" nodeId="871" ignored="false" name=""/>
                      <generic raw_id="10" backendDOMNodeId="872" nodeId="872" ignored="false" name=""/>
                      <generic raw_id="11" backendDOMNodeId="873" nodeId="873" ignored="false" name=""/>
                      <generic raw_id="12" backendDOMNodeId="874" nodeId="874" ignored="false" name="">
                        <generic raw_id="13" backendDOMNodeId="10" nodeId="10" ignored="false" name="">
                          <generic raw_id="14" backendDOMNodeId="882" nodeId="882" ignored="false" name="">
                            <button raw_id="15" backendDOMNodeId="19" nodeId="19" ignored="false" name="Guide" invalid="false" focusable="true" pressed="true">
                              <generic raw_id="16" backendDOMNodeId="883" nodeId="883" ignored="false" name="">
                                <none raw_id="17" backendDOMNodeId="884" nodeId="884" ignored="true">
                                  <none raw_id="18" backendDOMNodeId="885" nodeId="885" ignored="true"/>
                                </none>
                              </generic>
                            </button>
                            <generic raw_id="19" backendDOMNodeId="887" nodeId="887" ignored="false" name="">
                              <generic raw_id="20" backendDOMNodeId="888" nodeId="888" ignored="false" name=""/>
                              <generic raw_id="21" backendDOMNodeId="889" nodeId="889" ignored="false" name=""/>
                            </generic>
                          </generic>
                          <generic raw_id="22" backendDOMNodeId="11" nodeId="11" ignored="false" name="">
                            <link raw_id="23" backendDOMNodeId="21" nodeId="21" ignored="false" name="YouTube Home" focusable="true" url="https://www.youtube.com/">
                              <generic raw_id="24" backendDOMNodeId="890" nodeId="890" ignored="false" name="">
                                <generic raw_id="25" backendDOMNodeId="892" nodeId="892" ignored="false" name="">
                                  <none raw_id="26" backendDOMNodeId="893" nodeId="893" ignored="true">
                                    <none raw_id="27" backendDOMNodeId="894" nodeId="894" ignored="true"/>
                                  </none>
                                </generic>
                              </generic>
                            </link>
                            <generic raw_id="28" backendDOMNodeId="930" nodeId="930" ignored="false" name="">
                              <StaticText raw_id="29" backendDOMNodeId="23" nodeId="23" ignored="false" name="SG">
                                <InlineTextBox raw_id="30" nodeId="-1000000002" ignored="false" name="SG"/>
                              </StaticText>
                            </generic>
                          </generic>
                          <generic raw_id="31" backendDOMNodeId="931" nodeId="931" ignored="false" name="">
                            <generic raw_id="32" backendDOMNodeId="932" nodeId="932" ignored="false" name="">
                              <none raw_id="33" backendDOMNodeId="933" nodeId="933" ignored="true">
                                <button raw_id="34" backendDOMNodeId="24" nodeId="24" ignored="false" name="Skip navigation" invalid="false" focusable="true">
                                  <generic raw_id="35" backendDOMNodeId="934" nodeId="934" ignored="false" name="">
                                    <StaticText raw_id="36" backendDOMNodeId="25" nodeId="25" ignored="false" name="Skip navigation">
                                      <InlineTextBox raw_id="37" nodeId="-1000000003" ignored="false" name="Skip navigation"/>
                                    </StaticText>
                                  </generic>
                                  <none raw_id="38" backendDOMNodeId="939" nodeId="939" ignored="true"/>
                                </button>
                              </none>
                              <generic raw_id="39" backendDOMNodeId="941" nodeId="941" ignored="false" name=""/>
                            </generic>
                          </generic>
                        </generic>
                      </generic>
                    </banner>
                  </generic>
                </generic>
            </generic>
          </none>
        </RootWebArea>
      `;
      const tree = new ServerChromiumAccessibilityTree(rawXml);

      const xml = tree.toXml();
      expect(xml).toMatchInlineSnapshot(`
        "<RootWebArea name="YouTube" id=1 focusable url="https://www.youtube.com/">
          <banner id=8>
            <button name="Guide" id=15 focusable pressed />
            <div id=22>
              <link name="YouTube Home" id=23 focusable url="https://www.youtube.com/" />
              <div id=28>SG</div>
            </div>
            <button id=33 focusable>Skip navigation</button>
          </banner>
        </RootWebArea>"
      `);
    });
  });

  describe("snapshots", () => {
    const bulkFixturesPath = new URL(
      "../../../tests/unit/fixtures/tree/web/",
      import.meta.url,
    );
    const bulkFixtureNames = readdirSync(bulkFixturesPath)
      .filter((name) => name.startsWith("chrome-") && name.endsWith(".xml"))
      .sort();

    it.for(bulkFixtureNames)("%s", (fixtureName) =>
      test(new URL(fixtureName, bulkFixturesPath)),
    );

    const evalFixturesPath = new URL(
      "./__fixtures__/eval/chrome/",
      import.meta.url,
    );
    const evalFixtureNames = readdirSync(evalFixturesPath).sort();

    it.for(evalFixtureNames)("%s", (fixtureName) =>
      test(new URL(fixtureName, evalFixturesPath)),
    );

    async function test(fixtureUrl: URL) {
      const fixtureXml = await fs.readFile(fixtureUrl, "utf-8");
      const tree = new ServerChromiumAccessibilityTree(fixtureXml);

      const fixturePath = fileURLToPath(fixtureUrl);
      const fixtureName = path.basename(fixturePath, ".xml");

      await expect(tree.toXml()).toMatchFileSnapshot(
        `./__snapshots__/chrome/${fixtureName}.snap.xml`,
      );
    }
  });

  describe("visible ID audit", () => {
    const fixturesPath = new URL(
      "../../../tests/unit/fixtures/tree/web/",
      import.meta.url,
    );
    const fixtureNames = readdirSync(fixturesPath)
      .filter((name) => name.startsWith("chrome-") && name.endsWith(".xml"))
      .sort();

    it.for(fixtureNames)("%s", async (fixtureName) => {
      const rawXml = await fs.readFile(
        new URL(fixtureName, fixturesPath),
        "utf-8",
      );
      const tree = new ServerChromiumAccessibilityTree(rawXml);

      expectInvalidVisibleMappings(tree, rawXml, tree.toXml());
    });
  });
});

async function basicChromiumTree(): Promise<ServerChromiumAccessibilityTree> {
  const path = new URL(
    "./__fixtures__/chromium_accessibility_tree.json",
    import.meta.url,
  );
  const json = JSON.parse(await fs.readFile(path, "utf-8"));
  const clientAccessibilityTree = new ClientChromiumAccessibilityTree(json);
  return new ServerChromiumAccessibilityTree(clientAccessibilityTree.toStr());
}

function expectVisibleMappings(
  tree: ServerChromiumAccessibilityTree,
  xml: string,
  expected: Record<number, number>,
): void {
  const mappings: Record<number, number> = {};
  for (const root of Xml.parseAnyRootChildren(xml)) collect(root);
  expect(mappings).toEqual(expected);

  function collect(node: Xml.Node): void {
    const tag = Xml.nodeAsTag(node);
    if (!tag) return;
    const id = tag.attribs.id;
    if (id) mappings[+id] = tree.getRawId(id);
    for (const child of tag.children) collect(child);
  }
}

function expectInvalidVisibleMappings(
  tree: ServerChromiumAccessibilityTree,
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
      else if (!rawTag.attribs.backendDOMNodeId)
        invalid.push(
          `id=${id} maps to backend-less ${rawTag.tagName} raw_id=${rawId}`,
        );
    }
    for (const child of tag.children) collectOutput(child);
  }
}
