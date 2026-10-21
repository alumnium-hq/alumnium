import { describe, expect, it } from "bun:test";
import {
  FORBIDDEN_IMPORTS,
  getWorkspaceReport,
  matchesAny,
} from "./npmPackages.ts";

type ReportEntry = getWorkspaceReport.Entry;

const report = await getWorkspaceReport();

const names = report.map(({ name }) => name);

function getEntry(name: string): ReportEntry {
  const entry = report.find((entry) => entry.name === name);
  if (!entry) throw new Error(`No report for ${name}`);
  return entry;
}

describe("workspace packages", () => {
  it("includes the split packages", () => {
    expect(names).toEqual(
      expect.arrayContaining([
        "alumnium",
        "@alumnium/core",
        "@alumnium/test",
        "@alumnium/playwright",
        "@alumnium/codex",
      ]),
    );
  });

  it("share the same version", () => {
    const versions = new Set(report.map(({ version }) => version));
    expect([...versions]).toHaveLength(1);
  });

  it("depend on each other via the workspace", () => {
    const internal = report.flatMap(({ name, dependencies }) =>
      Object.entries(dependencies)
        .filter(([dep]) => names.includes(dep))
        .map(([dep, version]) => `${name} -> ${dep}@${version}`),
    );
    expect(internal.filter((dep) => !dep.endsWith("@workspace:*"))).toEqual([]);
  });

  for (const name of names)
    describe(name, () => {
      it("imports no forbidden packages", () => {
        const { imports } = getEntry(name).inspection;
        expect(
          imports.filter((dep) =>
            matchesAny(dep, FORBIDDEN_IMPORTS[name] || []),
          ),
        ).toEqual([]);
      });

      it("is Node-compatible when published", () => {
        const { published, inspection } = getEntry(name);
        if (published) expect(inspection.usesBun).toBe(false);
      });

      it("imports no unpublished entries when published", () => {
        const { published, inspection } = getEntry(name);
        if (published) expect(inspection.privateEntryImports).toEqual([]);
      });

      it("declares exactly the dependencies it imports", () => {
        expect(getEntry(name).problems).toEqual([]);
      });
    });

  it("keeps @alumnium/core and @alumnium/test free of drivers and LLMs", () => {
    for (const name of ["@alumnium/core", "@alumnium/test"]) {
      const { imports } = getEntry(name).inspection;
      for (const dep of [
        "selenium-webdriver",
        "playwright-core",
        "webdriverio",
        "@ai-sdk/openai",
        "ai",
        "cloakbrowser",
        "@cursor/sdk",
        "elysia",
      ]) {
        expect(imports).not.toContain(dep);
      }
    }
  });

  it("detects imports of unpublished entries", () => {
    expect(getEntry("@alumnium/server").inspection.privateEntryImports).toEqual(
      ["@alumnium/core/agents"],
    );
  });

  it("loads ai lazily in @alumnium/core as an optional peer", () => {
    const { inspection } = getEntry("@alumnium/core");
    expect(inspection.lazyImports).toContain("ai");
    expect(getEntry("@alumnium/core").dependencies).not.toHaveProperty("ai");
  });

  it("loads @alumnium/telemetry lazily in @alumnium/core", () => {
    const { inspection, dependencies } = getEntry("@alumnium/core");
    expect(inspection.lazyImports).toContain("@alumnium/telemetry");
    expect(dependencies).not.toHaveProperty("@alumnium/telemetry");
    expect(
      inspection.imports.filter((dep) =>
        /^@opentelemetry\/(sdk|exporter)|^@logtape\/otel$/.test(dep),
      ),
    ).toEqual([]);
  });
});

describe("matchesAny", () => {
  it("matches exact names and scopes", () => {
    expect(matchesAny("ai", ["ai"])).toBe(true);
    expect(matchesAny("@ai-sdk/openai", ["@ai-sdk/*"])).toBe(true);
    expect(matchesAny("@ai-sdkx/foo", ["@ai-sdk/*"])).toBe(false);
    expect(matchesAny("alwaysly", ["ai", "@ai-sdk/*"])).toBe(false);
  });
});
