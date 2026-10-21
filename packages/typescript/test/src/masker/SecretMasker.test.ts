import { describe, expect, it } from "vitest";
import { SecretMasker } from "./SecretMasker.ts";

describe("SecretMasker", () => {
  const masker = new SecretMasker({
    "test-data/createUser": ["user.token", "sessions.*.token", "auth"],
  });

  describe("isSecret", () => {
    it("matches a configured path", () => {
      expect(masker.isSecret("test-data/createUser", ["user", "token"])).toBe(
        true,
      );
      expect(masker.isSecret("test-data/createUser", ["user", "id"])).toBe(
        false,
      );
    });

    it("matches any key or index with a wildcard", () => {
      expect(
        masker.isSecret("test-data/createUser", ["sessions", "3", "token"]),
      ).toBe(true);
      expect(
        masker.isSecret("test-data/createUser", ["sessions", "3", "id"]),
      ).toBe(false);
    });

    it("covers every leaf nested under a path", () => {
      expect(
        masker.isSecret("test-data/createUser", ["auth", "tokens", "0"]),
      ).toBe(true);
    });

    it("does not match a path shorter than the pattern", () => {
      expect(masker.isSecret("test-data/createUser", ["user"])).toBe(false);
    });

    it("only applies to the configured tool", () => {
      expect(masker.isSecret("test-data/createOrder", ["user", "token"])).toBe(
        false,
      );
      expect(masker.isSecret(undefined, ["user", "token"])).toBe(false);
    });
  });

  describe("hasPaths", () => {
    it("tells tools with response paths apart", () => {
      expect(masker.hasPaths("test-data/createUser")).toBe(true);
      expect(masker.hasPaths("test-data/createOrder")).toBe(false);
      expect(masker.hasPaths(undefined)).toBe(false);
      expect(new SecretMasker({ tool: [] }).hasPaths("tool")).toBe(false);
    });
  });

  describe("registerSecret", () => {
    it("masks and unmasks a registered secret anywhere", () => {
      const secrets = new SecretMasker();
      secrets.registerSecret("<secret.0.user.token>", "tok-37f2");

      expect(secrets.mask("curl -b token=tok-37f2")).toBe(
        "curl -b token=<secret.0.user.token>",
      );
      expect(
        secrets.unmask({ command: "token=<secret.0.user.token>" }),
      ).toEqual({
        command: "token=tok-37f2",
      });
    });

    it("does not unmask masks of other families", () => {
      const secrets = new SecretMasker();
      secrets.registerSecret("<secret.0.a>", "x");

      expect(secrets.unmask({ a: "<host-var.a> <tool-call.0.a>" })).toEqual({
        a: "<host-var.a> <tool-call.0.a>",
      });
    });
  });

  describe("findLeaks", () => {
    it("finds registered secrets that survived masking", () => {
      const secrets = new SecretMasker();
      secrets.registerSecret("<secret.0.token>", "t0");

      expect(secrets.findLeaks(["token t0"])).toEqual(["<secret.0.token>"]);
    });

    it("always reports an output marked unread", () => {
      const secrets = new SecretMasker({ tool: ["token"] });
      secrets.markUnread("3");

      expect(secrets.findLeaks({})).toEqual(["<secret.3>"]);
    });
  });

  it("finds secret masks anywhere in a value", () => {
    expect(
      SecretMasker.findMasks({
        command: 'curl -H "Authorization: <secret.0.token>"',
        a: "<host-var.A>",
        b: "<tool-call.0.b>",
      }),
    ).toEqual(["<secret.0.token>"]);
  });
});
