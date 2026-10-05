import fs from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { createMockDir, setupBeforeEach } from "../../../tests/unit/mocks.ts";
import { CliSessionRegistry } from "./CliSessionRegistry.ts";

describe("CliSessionRegistry", () => {
  const setup = setupBeforeEach(async () => {
    const dir = await createMockDir();
    return { registry: new CliSessionRegistry(dir.path) };
  });

  it("defaults to the cli dir in the global store", () => {
    expect(new CliSessionRegistry().dir).toBe(".alumnium/cli");
  });

  it("writes, reads, lists and removes entries", async () => {
    const { registry } = setup.cur;
    await registry.writeEntry(entry("default"));
    await registry.writeEntry(entry("work"));

    expect(await registry.readEntry("default")).toEqual(entry("default"));
    expect(
      (await registry.listEntries()).map(({ name }) => name).toSorted(),
    ).toEqual(["default", "work"]);

    await registry.removeEntry("default");
    expect(await registry.readEntry("default")).toBeUndefined();
    expect((await registry.listEntries()).map(({ name }) => name)).toEqual([
      "work",
    ]);
  });

  it("treats corrupt or foreign entries as missing", async () => {
    const { registry } = setup.cur;
    await fs.writeFile(registry.resolve("broken.json"), "{");
    await fs.writeFile(
      registry.resolve("foreign.json"),
      JSON.stringify({ name: "foreign" }),
    );

    expect(await registry.readEntry("broken")).toBeUndefined();
    expect(await registry.readEntry("foreign")).toBeUndefined();
    expect(await registry.listEntries()).toEqual([]);
  });

  it("reads nothing from a missing dir", async () => {
    const registry = new CliSessionRegistry("/nonexistent/alumnium-cli");
    expect(await registry.readEntry("default")).toBeUndefined();
    expect(await registry.listEntries()).toEqual([]);
  });

  it("derives a stable socket path per registry dir and session", () => {
    const a = new CliSessionRegistry("/a");
    expect(a.socketPath("s")).toBe(
      new CliSessionRegistry("/a").socketPath("s"),
    );
    expect(a.socketPath("s")).not.toBe(
      new CliSessionRegistry("/b").socketPath("s"),
    );
    expect(a.socketPath("s")).not.toBe(a.socketPath("t"));
  });

  it("keeps socket paths under the 104-byte limit", () => {
    // NOTE: Windows named pipes don't have the limit.
    if (process.platform === "win32") return;
    const { registry } = setup.cur;
    expect(registry.socketPath("x".repeat(24)).length).toBeLessThan(104);
  });

  it("removes the socket file with the entry", async () => {
    if (process.platform === "win32") return;
    const { registry } = setup.cur;
    const socketPath = registry.socketPath("default");
    await fs.writeFile(socketPath, "");
    await registry.writeEntry(entry("default"));

    await registry.removeEntry("default");

    await expect(fs.stat(socketPath)).rejects.toThrow();
  });

  it("validates session names", () => {
    const { SessionName } = CliSessionRegistry;
    expect(SessionName.safeParse("work-1_a").success).toBe(true);
    expect(SessionName.parse(7)).toBe("7");
    for (const name of ["", "../x", "a b", "a/b", "x".repeat(25)])
      expect(SessionName.safeParse(name).success).toBe(false);
  });
});

function entry(name: string): CliSessionRegistry.Entry {
  return {
    name,
    version: "1.0.0",
    pid: 123,
    socketPath: `/tmp/${name}.sock`,
    driverId: `drv-${name}`,
    platform: "chrome",
    startedAt: 1,
    startOutput: `{"id":"drv-${name}"}`,
  };
}
