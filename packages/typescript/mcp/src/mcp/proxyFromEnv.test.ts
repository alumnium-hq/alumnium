import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { proxyFromEnv } from "./proxyFromEnv.ts";

describe("proxyFromEnv", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns null when no proxy env vars are set", () => {
    expect(proxyFromEnv()).toBeNull();
  });

  it("reads http_proxy", () => {
    vi.stubEnv("http_proxy", "http://proxy.example.com:3128");
    expect(proxyFromEnv()).toEqual({ server: "http://proxy.example.com:3128" });
  });

  it("falls back to HTTP_PROXY", () => {
    vi.stubEnv("HTTP_PROXY", "http://proxy.example.com:8080");
    expect(proxyFromEnv()).toEqual({ server: "http://proxy.example.com:8080" });
  });

  it("falls back to https_proxy when http vars absent", () => {
    vi.stubEnv("https_proxy", "https://proxy.example.com");
    expect(proxyFromEnv()).toEqual({ server: "https://proxy.example.com" });
  });

  it("falls back to HTTPS_PROXY last", () => {
    vi.stubEnv("HTTPS_PROXY", "https://proxy.example.com:3128");
    expect(proxyFromEnv()).toEqual({
      server: "https://proxy.example.com:3128",
    });
  });

  it("prefers http_proxy over HTTP_PROXY", () => {
    vi.stubEnv("http_proxy", "http://low.example.com:3128");
    vi.stubEnv("HTTP_PROXY", "http://upper.example.com:3128");
    expect(proxyFromEnv()).toEqual({ server: "http://low.example.com:3128" });
  });

  it("omits port from server when not present in URL", () => {
    vi.stubEnv("http_proxy", "http://proxy.example.com");
    expect(proxyFromEnv()).toEqual({ server: "http://proxy.example.com" });
  });

  it("handles socks5 proxy URLs", () => {
    vi.stubEnv("http_proxy", "socks5://proxy.example.com:1080");
    expect(proxyFromEnv()).toEqual({
      server: "socks5://proxy.example.com:1080",
    });
  });

  it("extracts username and password", () => {
    vi.stubEnv("http_proxy", "http://user:pass@proxy.example.com:3128");
    expect(proxyFromEnv()).toEqual({
      server: "http://proxy.example.com:3128",
      username: "user",
      password: "pass",
    });
  });

  it("decodes percent-encoded credentials", () => {
    vi.stubEnv(
      "http_proxy",
      "http://user%40corp:p%40ss@proxy.example.com:3128",
    );
    expect(proxyFromEnv()).toEqual({
      server: "http://proxy.example.com:3128",
      username: "user@corp",
      password: "p@ss",
    });
  });

  it("omits username and password when not present", () => {
    vi.stubEnv("http_proxy", "http://proxy.example.com:3128");
    const result = proxyFromEnv();
    expect(result).not.toHaveProperty("username");
    expect(result).not.toHaveProperty("password");
  });

  it("returns null for an invalid URL", () => {
    vi.stubEnv("http_proxy", "not-a-valid-url");
    expect(proxyFromEnv()).toBeNull();
  });
});
