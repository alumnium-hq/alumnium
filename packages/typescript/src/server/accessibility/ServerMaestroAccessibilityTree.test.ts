import { readdirSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MaestroAccessibilityTree } from "../../accessibility/MaestroAccessibilityTree.ts";
import type { MaestroSession } from "../../drivers/MaestroSession.ts";
import { ServerMaestroAccessibilityTree } from "./ServerMaestroAccessibilityTree.ts";

const FIXTURE_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../accessibility/__fixtures__/maestro_accessibility_tree.json",
);

function buildTrees(json: string): {
  clientTree: MaestroAccessibilityTree;
  serverTree: ServerMaestroAccessibilityTree;
} {
  const clientTree = new MaestroAccessibilityTree(
    JSON.parse(json) as MaestroSession.Hierarchy,
  );
  return {
    clientTree,
    serverTree: new ServerMaestroAccessibilityTree(clientTree.toStr()),
  };
}

async function loadTrees() {
  return buildTrees(await fs.readFile(FIXTURE_PATH, "utf-8"));
}

describe(ServerMaestroAccessibilityTree, () => {
  it("collapses the wrapper chains Maestro reports", async () => {
    const { serverTree } = await loadTrees();

    // 47 mostly-untyped nodes in; the wrappers must not survive into the prompt.
    expect(serverTree.toXml().split("\n").length).toBeLessThan(30);
  });

  it("drops bounds, which are only needed driver-side", async () => {
    const { serverTree } = await loadTrees();

    expect(serverTree.toXml()).not.toContain("bounds");
  });

  it("keeps interactive labels addressable", async () => {
    const { serverTree } = await loadTrees();
    const xml = serverTree.toXml();

    expect(xml).toContain("Buy milk");
    expect(xml).toContain("Add");
    expect(xml).toContain('resource-id="circle"');
  });

  it("maps simplified ids back to the client tree's raw ids", async () => {
    const { clientTree, serverTree } = await loadTrees();
    const xml = serverTree.toXml();

    const match = /<div id=(\d+)>Buy milk<\/div>/.exec(xml);
    expect(match).not.toBeNull();

    const rawId = serverTree.getRawId(Number(match![1]));
    expect(clientTree.elementById(rawId)).toMatchObject({
      name: "Buy milk",
      maestroBounds: "[66,177][146,203]",
    });
  });

  describe("snapshots", () => {
    const fixturesPath = new URL(
      "../../../tests/unit/fixtures/tree/ios/",
      import.meta.url,
    );
    const fixtureNames = readdirSync(fixturesPath)
      .filter((name) => name.startsWith("maestro-") && name.endsWith(".json"))
      .sort();

    it.for(fixtureNames)("%s", async (fixtureName) => {
      const fixtureJson = await fs.readFile(
        new URL(fixtureName, fixturesPath),
        "utf-8",
      );
      const { serverTree } = buildTrees(fixtureJson);

      await expect(serverTree.toXml()).toMatchFileSnapshot(
        `./__snapshots__/maestro/${fixtureName.replace(".json", ".snap.xml")}`,
      );
    });
  });
});
