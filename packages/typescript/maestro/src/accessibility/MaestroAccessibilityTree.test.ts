import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { MaestroSession } from "../drivers/MaestroSession.ts";
import { MaestroAccessibilityTree } from "./MaestroAccessibilityTree.ts";

const FIXTURE_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "__fixtures__/maestro_accessibility_tree.json",
);

async function loadTree(): Promise<MaestroAccessibilityTree> {
  const json = await fs.readFile(FIXTURE_PATH, "utf-8");
  return new MaestroAccessibilityTree(
    JSON.parse(json) as MaestroSession.Hierarchy,
  );
}

describe("MaestroAccessibilityTree", () => {
  describe("toStr", () => {
    it("expands abbreviated keys and stamps raw ids", async () => {
      const tree = await loadTree();
      const xml = tree.toStr();

      expect(xml).toContain(
        '<Text raw_id=29 accessibilityText="Buy milk" bounds="[66,177][146,203]" />',
      );
      // Maestro returns several roots, which get a synthetic parent.
      expect(xml.startsWith("<root>")).toBe(true);
    });

    it("infers a text field from a placeholder", async () => {
      const tree = new MaestroAccessibilityTree({
        ui_schema: {
          abbreviations: { b: "bounds", hint: "hintText", c: "children" },
          defaults: { hint: "" },
        },
        elements: [{ b: "[0,0][10,10]", hint: "Type something Here ..." }],
      });

      expect(tree.toStr()).toContain("<TextField");
    });

    it("drops values that match the schema defaults", async () => {
      const tree = new MaestroAccessibilityTree({
        ui_schema: {
          abbreviations: { b: "bounds", txt: "text", c: "children" },
          defaults: { txt: "", enabled: true },
        },
        elements: [{ b: "[0,0][10,10]", txt: "", enabled: true }],
      });

      const xml = tree.toStr();
      expect(xml).not.toContain("enabled");
      expect(xml).not.toContain("text=");
    });
  });

  describe("Android", () => {
    const load = async (name: string) =>
      new MaestroAccessibilityTree(
        JSON.parse(
          await fs.readFile(
            path.resolve(
              path.dirname(fileURLToPath(import.meta.url)),
              `__fixtures__/${name}.json`,
            ),
            "utf-8",
          ),
        ) as MaestroSession.Hierarchy,
      );

    it("derives roles from the widget class, so an EditText is a TextField even though it is clickable", async () => {
      const xml = (await load("maestro_android_row_unchecked")).toStr();
      expect(xml).toMatch(
        /<CheckBox raw_id=\d+ class="android.widget.CheckBox"/,
      );
      expect(xml).not.toMatch(
        /<Button raw_id=\d+ class="android.widget.CheckBox"/,
      );
    });

    it("marks an unlabelled clickable view as a Button so the model can target it", async () => {
      const xml = (await load("maestro_android_row_unchecked")).toStr();
      expect(xml).toMatch(
        /<Button raw_id=\d+ class="android.view.View" clickable/,
      );
    });

    it("emits Android's content-desc as its own attribute", async () => {
      const xml = (await load("maestro_android_row_unchecked")).toStr();
      expect(xml).toContain('content-desc="New Task"');
    });

    it("hoists a lone child label onto its unlabelled clickable wrapper", async () => {
      const tree = await load("maestro_android_row_unchecked");
      const xml = tree.toStr();
      // The Compose FAB: wrapper Button > (labelled View, empty widget Button).
      expect(xml).toMatch(
        /<Button raw_id=(\d+) class="android.view.View" content-desc="New Task" clickable bounds="[^"]+" \/>/,
      );
      expect(xml).not.toMatch(/<Text [^>]*content-desc="New Task"/);
      const rawId = Number(
        xml.match(/<Button raw_id=(\d+)[^>]*content-desc="New Task"/)?.[1],
      );
      expect(tree.elementById(rawId).name).toBe("New Task");
    });

    it("leaves a task row alone, since its checkbox is interactive", async () => {
      const xml = (await load("maestro_android_row_unchecked")).toStr();
      expect(xml).toMatch(/<Button [^>]*clickable[^>]*>\s*<CheckBox /);
    });

    it("finds a node by resource-id anywhere in the hierarchy", async () => {
      const tree = await load("maestro_android_row_unchecked");
      expect(
        tree.hasResourceId(
          "com.android.systemui:id/status_bar_launch_animation_container",
        ),
      ).toBe(true);
      expect(tree.hasResourceId("android:id/inputArea")).toBe(false);
    });

    it("states checked=false on an unchecked checkbox", async () => {
      const xml = (await load("maestro_android_row_unchecked")).toStr();
      expect(xml).toMatch(/<CheckBox [^>]*checked="false"/);
    });

    it("keeps checked=true on a ticked checkbox", async () => {
      const xml = (await load("maestro_android_row_checked")).toStr();
      expect(xml).toMatch(/<CheckBox (?:[^>]* )?checked(?: |\/)/);
    });
  });

  describe("elementById", () => {
    it("returns the element with its bounds", async () => {
      const tree = await loadTree();

      expect(tree.elementById(29)).toMatchObject({
        id: 29,
        type: "Text",
        name: "Buy milk",
        maestroBounds: "[66,177][146,203]",
      });
    });

    it("throws for an unknown raw id", async () => {
      const tree = await loadTree();

      expect(() => tree.elementById(99999)).toThrow("No element with raw_id");
    });
  });

  describe("scopeToArea", () => {
    it("scopes the tree to the requested subtree", async () => {
      const tree = await loadTree();
      const scoped = tree.scopeToArea(27);
      const xml = scoped.toStr();

      expect(xml).toContain('accessibilityText="Buy milk"');
      expect(xml).not.toContain('accessibilityText="Add"');
    });

    it("returns the original tree when the element is not found", async () => {
      const tree = await loadTree();

      expect(tree.scopeToArea(99999).toStr()).toBe(tree.toStr());
    });
  });

  describe("centreOf", () => {
    it("returns the midpoint of a bounds string", () => {
      expect(MaestroAccessibilityTree.centreOf("[66,177][146,203]")).toEqual({
        x: 106,
        y: 190,
      });
    });

    it("handles negative coordinates", () => {
      expect(
        MaestroAccessibilityTree.centreOf("[-16,-1590][418,1990]"),
      ).toEqual({ x: 201, y: 200 });
    });

    it("throws for an unparsable bounds string", () => {
      expect(() => MaestroAccessibilityTree.centreOf("nope")).toThrow(
        "Unparsable Maestro bounds",
      );
    });
  });
});
