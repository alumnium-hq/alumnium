import { describe, expect, it } from "vitest";
import { AppId } from "../../AppId.ts";
import { KnowledgeManifest } from "./KnowledgeManifest.ts";

describe(KnowledgeManifest, () => {
  function manifest(products: KnowledgeManifest.Value["products"]) {
    return KnowledgeManifest.parse({ products }, "knowledge.json");
  }

  const resolve = (value: KnowledgeManifest, app: string) =>
    value.resolve(AppId.parse(app));

  it("matches app ids exactly", () => {
    const value = manifest({
      shop: {
        apps: ["shop-static.example.org", "com.example.chat"],
      },
    });

    expect(resolve(value, "https://shop-static.example.org/index.html")).toBe(
      "shop",
    );
    expect(resolve(value, "com.example.chat")).toBe("shop");
    expect(resolve(value, "example.org")).toBeNull();
  });

  it("matches subdomains with host globs", () => {
    const value = manifest({ shop: { apps: ["*.example.org"] } });

    expect(resolve(value, "https://shop-static.example.org")).toBe("shop");
    expect(resolve(value, "https://staging.example.org")).toBe("shop");
    expect(resolve(value, "https://notexample.org")).toBeNull();
  });

  it("matches ports with port globs", () => {
    const value = manifest({ shop: { apps: ["localhost:*"] } });

    expect(resolve(value, "http://localhost:3000")).toBe("shop");
    expect(resolve(value, "http://localhost:8013/chat")).toBe("shop");
    expect(resolve(value, "http://localhostile.com")).toBeNull();
  });

  it("resolves unclaimed apps to null", () => {
    expect(resolve(KnowledgeManifest.EMPTY, "https://example.com")).toBeNull();
  });

  it("fails on apps claimed by several products", () => {
    const value = manifest({
      shop: { apps: ["*.example.org"] },
      support: { apps: ["shop-static.example.org"] },
    });

    expect(() => resolve(value, "https://shop-static.example.org")).toThrow(
      'App shop-static-example-org is claimed by several knowledge products: "*.example.org" (shop), "shop-static.example.org" (support)',
    );
  });

  it("allows one product to claim an app twice", () => {
    const value = manifest({
      shop: {
        apps: ["*.example.org", "shop-static.example.org"],
      },
    });

    expect(resolve(value, "https://shop-static.example.org")).toBe("shop");
  });

  it.each(["../escape", "my shop", "", "-chat"])(
    "rejects product name %j",
    (name) => {
      expect(() => manifest({ [name]: { apps: ["example.com"] } })).toThrow(
        /Invalid knowledge manifest knowledge\.json/,
      );
    },
  );

  it("rejects products without apps", () => {
    expect(() => manifest({ shop: { apps: [] } })).toThrow(
      /Invalid knowledge manifest/,
    );
  });
});
