import { describe, expect, it } from "vitest";
import { HostVarMasker } from "./HostVarMasker.ts";

describe("HostVarMasker", () => {
  it("masks host variables as <host-var.name>", () => {
    const masker = new HostVarMasker({
      BASE_URL: "https://staging.example.com",
      PASSWORD: "p4ssw0rd",
    });

    expect(
      masker.mask({
        goal: "open https://staging.example.com/login and type {password}",
        params: { password: "p4ssw0rd" },
      }),
    ).toEqual({
      goal: "open <host-var.BASE_URL>/login and type {password}",
      params: { password: "<host-var.PASSWORD>" },
    });
  });

  it("substitutes fresh host variables", () => {
    const masker = new HostVarMasker({ BASE_URL: "https://dev.example.com" });

    expect(masker.unmask({ goal: "open <host-var.BASE_URL>/login" })).toEqual({
      goal: "open https://dev.example.com/login",
    });
  });

  it("does not unmask masks of other families", () => {
    const masker = new HostVarMasker({ A: "x" });

    expect(masker.unmask({ a: "<secret.0.A> <tool-call.0.A>" })).toEqual({
      a: "<secret.0.A> <tool-call.0.A>",
    });
  });

  it("does not mask inside a mask it emitted", () => {
    const masker = new HostVarMasker({
      HOST: "host",
      URL: "https://example.com",
    });

    const masked = masker.mask({ goal: "open https://example.com on host" });
    expect(masked).toEqual({ goal: "open <host-var.URL> on <host-var.HOST>" });
    expect(masker.unmask(masked)).toEqual({
      goal: "open https://example.com on host",
    });
  });

  it("does not report a value inside a mask as a leak", () => {
    const masker = new HostVarMasker({ ROLE: "user", ID: "42" });

    expect(
      masker.findLeaks("<secret.c1.user.token> <tool-call.toolu_42.id>"),
    ).toEqual([]);
    expect(masker.findLeaks("<secret.c1.user.token> user")).toEqual([
      "<host-var.ROLE>",
    ]);
  });

  it("ignores empty host variables", () => {
    const masker = new HostVarMasker({ EMPTY: "" });

    expect(masker.size).toBe(0);
    expect(masker.mask("text")).toBe("text");
  });

  it("rejects a host variable name that cannot be a mask", () => {
    expect(() => new HostVarMasker({ "BASE-URL": "x" })).toThrow(RangeError);
  });

  it("finds host variable masks anywhere in a value", () => {
    expect(
      HostVarMasker.findMasks({
        goal: "open <host-var.BASE_URL>/login",
        params: ["<host-var.PASSWORD>", "<secret.0.a>"],
      }),
    ).toEqual(["<host-var.BASE_URL>", "<host-var.PASSWORD>"]);
  });

  it("finds JSON-escaped host variable masks and names", () => {
    expect(HostVarMasker.findMasks("<host-var.A:json>")).toEqual([
      "<host-var.A:json>",
    ]);
    expect(HostVarMasker.findNames("<host-var.A:json>")).toEqual(["A"]);
  });

  it("finds unique host variable names", () => {
    expect(
      HostVarMasker.findNames([
        { goal: "open <host-var.BASE_URL>/<host-var.PATH>" },
        "<host-var.BASE_URL>",
      ]),
    ).toEqual(["BASE_URL", "PATH"]);
  });
});
