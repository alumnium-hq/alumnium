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
      "live-chat": {
        apps: ["live-chat-static.sprinklr.com", "com.sprinklr.chat"],
      },
    });

    expect(
      resolve(value, "https://live-chat-static.sprinklr.com/index.html"),
    ).toBe("live-chat");
    expect(resolve(value, "com.sprinklr.chat")).toBe("live-chat");
    expect(resolve(value, "sprinklr.com")).toBeNull();
  });

  it("matches subdomains with host globs", () => {
    const value = manifest({ "live-chat": { apps: ["*.sprinklr.com"] } });

    expect(resolve(value, "https://live-chat-static.sprinklr.com")).toBe(
      "live-chat",
    );
    expect(resolve(value, "https://staging.sprinklr.com")).toBe("live-chat");
    expect(resolve(value, "https://notsprinklr.com")).toBeNull();
  });

  it("matches ports with port globs", () => {
    const value = manifest({ "live-chat": { apps: ["localhost:*"] } });

    expect(resolve(value, "http://localhost:3000")).toBe("live-chat");
    expect(resolve(value, "http://localhost:8013/chat")).toBe("live-chat");
    expect(resolve(value, "http://localhostile.com")).toBeNull();
  });

  it("resolves unclaimed apps to null", () => {
    expect(resolve(KnowledgeManifest.EMPTY, "https://example.com")).toBeNull();
  });

  it("fails on apps claimed by several products", () => {
    const value = manifest({
      "live-chat": { apps: ["*.sprinklr.com"] },
      support: { apps: ["live-chat-static.sprinklr.com"] },
    });

    expect(() =>
      resolve(value, "https://live-chat-static.sprinklr.com"),
    ).toThrow(
      'App live-chat-static-sprinklr-com is claimed by several knowledge products: "*.sprinklr.com" (live-chat), "live-chat-static.sprinklr.com" (support)',
    );
  });

  it("allows one product to claim an app twice", () => {
    const value = manifest({
      "live-chat": {
        apps: ["*.sprinklr.com", "live-chat-static.sprinklr.com"],
      },
    });

    expect(resolve(value, "https://live-chat-static.sprinklr.com")).toBe(
      "live-chat",
    );
  });

  it.each(["../escape", "live chat", "", "-chat"])(
    "rejects product name %j",
    (name) => {
      expect(() => manifest({ [name]: { apps: ["example.com"] } })).toThrow(
        /Invalid knowledge manifest knowledge\.json/,
      );
    },
  );

  it("rejects products without apps", () => {
    expect(() => manifest({ "live-chat": { apps: [] } })).toThrow(
      /Invalid knowledge manifest/,
    );
  });
});
