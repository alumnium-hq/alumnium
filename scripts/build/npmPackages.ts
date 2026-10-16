// Workspace packages under `packages/typescript/*` and the boundaries they must
// keep. `build.ts` uses the checks below to fail the build, and
// `npmPackages.test.ts` runs them as a guardrail test (`bun test`).
//
// Every published package must:
//
// - import only npm packages it declares as dependencies, and declare only
//   packages it imports;
// - not depend on the Bun runtime (Node-compatible);
// - not import workspace entries left out of published packages
//   (`PRIVATE_ENTRIES`), e.g. `@alumnium/core/agents`;
// - not import the npm packages forbidden for it, e.g. `@alumnium/core` and
//   must be consumable without browser drivers and LLM
//   providers.

import fs from "node:fs/promises";
import { builtinModules } from "node:module";
import path from "node:path";

export namespace WorkspacePkg {
  export interface PackageJson {
    name: string;
    version: string;
    description?: string;
    private?: boolean;
    bin?: Record<string, string>;
    dependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    [key: string]: unknown;
  }

  export interface Inspection {
    /** npm packages the bundle imports statically, i.e. loads on import. */
    imports: string[];
    /** npm packages the bundle imports lazily with `import()`. */
    lazyImports: string[];
    /** Whether the bundle depends on the Bun runtime. */
    usesBun: boolean;
    /** Imported workspace entries left out of published packages. */
    privateEntryImports: string[];
  }
}

export interface WorkspacePkg {
  /** Directory name, e.g. `core`. */
  dirName: string;
  /** Absolute package directory path. */
  dir: string;
  packageJson: WorkspacePkg.PackageJson;
  /** Absolute path to the package barrel, if any. */
  entryPath: string | undefined;
  /**
   * Published entries: `exports` subpaths (e.g. `.` and `./internal`) and
   * their absolute paths.
   */
  entries: Record<string, string>;
}

export const WORKSPACE_DIR = path.resolve(
  import.meta.dirname,
  "../../packages/typescript",
);

const DRIVER_IMPORTS = [
  "selenium-webdriver",
  "playwright-core",
  "webdriverio",
  "cloakbrowser",
];

// LLM SDKs each provider package may import.
const OWN_PROVIDER_IMPORTS: Record<string, string[]> = {
  "@alumnium/anthropic": ["@ai-sdk/anthropic"],
  "@alumnium/aws": ["@ai-sdk/amazon-bedrock"],
  "@alumnium/azure": ["@ai-sdk/azure"],
  "@alumnium/codex": ["@ai-sdk/openai", "openai-oauth"],
  "@alumnium/cursor": ["@cursor/sdk"],
  "@alumnium/deepseek": ["@ai-sdk/deepseek"],
  "@alumnium/google": ["@ai-sdk/google"],
  "@alumnium/mistral": ["@ai-sdk/mistral"],
  "@alumnium/ollama": ["ollama-ai-provider-v2"],
  "@alumnium/openai": ["@ai-sdk/openai"],
  "@alumnium/openrouter": ["@openrouter/ai-sdk-provider"],
  "@alumnium/xai": ["@ai-sdk/xai"],
};

const PROVIDER_PKGS = Object.keys(OWN_PROVIDER_IMPORTS);

const PROVIDER_IMPORTS = [
  ...new Set(Object.values(OWN_PROVIDER_IMPORTS).flat()),
];

// Native drivers each driver package may import.
const OWN_DRIVER_IMPORTS: Record<string, string[]> = {
  "@alumnium/playwright": ["playwright-core"],
  "@alumnium/selenium": ["selenium-webdriver"],
  // AppiumDriver reuses selenium-webdriver's key constants.
  "@alumnium/appium": ["webdriverio", "selenium-webdriver"],
  "@alumnium/maestro": [],
  "@alumnium/xcode": [],
};

const DRIVER_PKGS = Object.keys(OWN_DRIVER_IMPORTS);

// OpenTelemetry SDK and exporters `@alumnium/telemetry` may import.
const TELEMETRY_IMPORTS = [
  "@logtape/otel",
  "@opentelemetry/exporter-logs-otlp-grpc",
  "@opentelemetry/exporter-logs-otlp-http",
  "@opentelemetry/exporter-logs-otlp-proto",
  "@opentelemetry/sdk-logs",
  "@opentelemetry/exporter-trace-otlp-http",
  "@opentelemetry/resources",
  "@opentelemetry/sdk-trace-base",
  "@opentelemetry/sdk-trace-node",
];

// Loaded on import of `@alumnium/core`. `ai` is allowed
// only lazily, when agents run (see core/src/llm/loadAi.ts). The tiny
// `@ai-sdk/provider` (LLM interfaces and errors) is allowed.
const LIGHTWEIGHT_FORBIDDEN = [
  ...DRIVER_IMPORTS,
  ...PROVIDER_IMPORTS,
  ...TELEMETRY_IMPORTS,
  "@ai-sdk/gateway",
  "@ai-sdk/provider-utils",
  "ai",
  "elysia",
];

/**
 * npm packages each workspace package must never import at runtime. Type
 * imports are erased from bundles and only affect declarations.
 */
export const FORBIDDEN_IMPORTS: Record<string, string[]> = {
  "@alumnium/core": LIGHTWEIGHT_FORBIDDEN,
  "@alumnium/telemetry": [
    ...DRIVER_IMPORTS,
    ...PROVIDER_IMPORTS,
    "ai",
    "@alumnium/*",
  ],
  // Each provider package imports only its own LLM SDK.
  ...Object.fromEntries(
    PROVIDER_PKGS.map((name) => [
      name,
      [
        ...DRIVER_IMPORTS,
        ...DRIVER_PKGS,
        ...without(PROVIDER_IMPORTS, OWN_PROVIDER_IMPORTS[name] || []),
        ...without(PROVIDER_PKGS, [name]),
      ],
    ]),
  ),
  // Each driver package imports only its own native driver.
  ...Object.fromEntries(
    DRIVER_PKGS.map((name) => [
      name,
      [
        ...PROVIDER_IMPORTS,
        ...PROVIDER_PKGS,
        ...without(DRIVER_IMPORTS, OWN_DRIVER_IMPORTS[name] || []),
        ...without(DRIVER_PKGS, [name]),
      ],
    ]),
  ),
};

function without(list: string[], excluded: string[]): string[] {
  return list.filter((item) => !excluded.includes(item));
}

/**
 * `exports` subpaths used only inside the workspace and left out of published
 * packages. Agents' types reference the optional `ai` peer dependency, and
 * only the private server and MCP packages bundled into the binary use them.
 */
export const PRIVATE_ENTRIES: Record<string, string[]> = {
  "@alumnium/core": ["./agents"],
};

/** Dev-only modules stubbed out of bundles. */
export const STUBBED_FILES = {
  [path.resolve(WORKSPACE_DIR, "core/src/utils/typesScan.ts")]:
    "export function scanTypes() {}\n",
};

/** Lists workspace packages, dependencies first. */
export async function getWorkspacePkgs(): Promise<WorkspacePkg[]> {
  const entries = await fs.readdir(WORKSPACE_DIR, { withFileTypes: true });
  const pkgs = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && entry.name !== "node_modules")
      .map(async ({ name: dirName }): Promise<WorkspacePkg | undefined> => {
        const dir = path.join(WORKSPACE_DIR, dirName);
        const packageJson = await fs
          .readFile(path.join(dir, "package.json"), "utf-8")
          .then((text) => JSON.parse(text) as WorkspacePkg.PackageJson)
          .catch(() => undefined);
        if (!packageJson) return;
        const entryPath = path.join(dir, "src/index.ts");
        const hasEntry = await fs
          .access(entryPath)
          .then(() => true)
          .catch(() => false);
        return {
          dirName,
          dir,
          packageJson,
          entryPath: hasEntry ? entryPath : undefined,
          entries: getPublishedEntries(
            dir,
            packageJson,
            hasEntry ? entryPath : undefined,
          ),
        };
      }),
  );

  return sortByDependencies(pkgs.filter((pkg) => !!pkg));
}

function getPublishedEntries(
  dir: string,
  packageJson: WorkspacePkg.PackageJson,
  entryPath: string | undefined,
): Record<string, string> {
  if (!packageJson.exports) return entryPath ? { ".": entryPath } : {};
  const exports = packageJson.exports as Record<string, string>;
  const privateEntries = PRIVATE_ENTRIES[packageJson.name] || [];
  return Object.fromEntries(
    Object.entries(exports)
      .filter(([subpath]) => !privateEntries.includes(subpath))
      .map(([subpath, file]) => [subpath, path.join(dir, file)]),
  );
}

function sortByDependencies(pkgs: WorkspacePkg[]): WorkspacePkg[] {
  const byName = new Map(pkgs.map((pkg) => [pkg.packageJson.name, pkg]));
  const sorted: WorkspacePkg[] = [];
  const visited = new Set<string>();

  function visit(pkg: WorkspacePkg, trail: string[]) {
    const { name } = pkg.packageJson;
    if (visited.has(name)) return;
    if (trail.includes(name))
      throw new Error(`Dependency cycle: ${[...trail, name].join(" -> ")}`);
    for (const dep of Object.keys(pkg.packageJson.dependencies || {})) {
      const depPkg = byName.get(dep);
      if (depPkg) visit(depPkg, [...trail, name]);
    }
    visited.add(name);
    sorted.push(pkg);
  }

  [...pkgs]
    .sort((a, b) => a.dirName.localeCompare(b.dirName))
    .forEach((pkg) => visit(pkg, []));
  return sorted;
}

export function isPublishedPkg(pkg: WorkspacePkg): boolean {
  return !pkg.packageJson.private;
}

/** Bundles the package in memory and reports what it imports. */
export async function inspectWorkspacePkg(
  pkg: WorkspacePkg,
): Promise<WorkspacePkg.Inspection> {
  const entrypoints = Object.values(pkg.entries);
  if (!entrypoints.length)
    return {
      imports: [],
      lazyImports: [],
      usesBun: false,
      privateEntryImports: [],
    };

  const result = await Bun.build({
    root: pkg.dir,
    entrypoints,
    target: "node",
    format: "esm",
    packages: "external",
    metafile: true,
    files: STUBBED_FILES,
  });

  if (!result.success || !result.metafile) {
    throw new AggregateError(
      result.logs.map((log) => new Error(log.message)),
      `Failed to inspect ${pkg.packageJson.name}`,
    );
  }

  const specifiers = new Set<string>();
  const lazySpecifiers = new Set<string>();
  for (const input of Object.values(result.metafile.inputs)) {
    for (const { path: specifier, external, kind } of input.imports) {
      if (!external) continue;
      (kind === "dynamic-import" ? lazySpecifiers : specifiers).add(specifier);
    }
  }

  const imports = toNpmPkgNames(specifiers);
  const lazyImports = toNpmPkgNames(lazySpecifiers).filter(
    (name) => !imports.includes(name),
  );

  const outputsText = await Promise.all(
    result.outputs.map((output) => output.text()),
  );

  return {
    imports,
    lazyImports,
    usesBun:
      imports.some(isBunImport) ||
      outputsText.some((text) => /\bBun\.\w/.test(text)),
    privateEntryImports: [...specifiers, ...lazySpecifiers]
      .filter(isPrivateEntry)
      .sort(),
  };
}

function isPrivateEntry(specifier: string): boolean {
  const name = npmPkgName(specifier);
  const subpath = `.${specifier.slice(name.length)}`;
  return !!PRIVATE_ENTRIES[name]?.includes(subpath);
}

// NOTE: Bun's metafile marks some bundled relative imports as external, so
// only bare specifiers are considered.
function toNpmPkgNames(specifiers: Set<string>): string[] {
  const names = [...specifiers]
    .filter(
      (specifier) => !specifier.startsWith(".") && !isNodeBuiltin(specifier),
    )
    .map(npmPkgName);
  return [...new Set(names)].sort();
}

/** Returns boundary violations of an inspected package. */
export async function checkWorkspacePkg(
  pkg: WorkspacePkg,
  inspection: WorkspacePkg.Inspection,
): Promise<string[]> {
  const { name, dependencies = {}, peerDependencies = {} } = pkg.packageJson;
  const problems: string[] = [];

  const forbidden = inspection.imports.filter((dep) =>
    matchesAny(dep, FORBIDDEN_IMPORTS[name] || []),
  );
  if (forbidden.length)
    problems.push(`${name} imports forbidden: ${forbidden.join(", ")}`);

  if (isPublishedPkg(pkg) && inspection.usesBun)
    problems.push(`${name} depends on the Bun runtime`);

  if (isPublishedPkg(pkg) && inspection.privateEntryImports.length)
    problems.push(
      `${name} imports unpublished entries: ${inspection.privateEntryImports.join(", ")}`,
    );

  const runtimeImports = inspection.imports.filter((dep) => !isBunImport(dep));
  const undeclared = runtimeImports.filter((dep) => !(dep in dependencies));
  if (undeclared.length)
    problems.push(
      `${name} imports undeclared dependencies: ${undeclared.join(", ")}`,
    );

  // Lazily imported packages may be optional peers, loaded only when used.
  const lazyImports = inspection.lazyImports.filter((dep) => !isBunImport(dep));
  const undeclaredLazy = lazyImports.filter(
    (dep) => !(dep in dependencies) && !(dep in peerDependencies),
  );
  if (undeclaredLazy.length)
    problems.push(
      `${name} lazily imports undeclared dependencies: ${undeclaredLazy.join(", ")}`,
    );

  // Type-only imports are erased from the bundle but still needed for the
  // declarations, so source imports count too. Dependencies satisfying
  // optional peers of workspace dependencies (e.g. `ai` for `@alumnium/core`)
  // are used too.
  const sourceImports = await scanSourceImports(pkg);
  const providedPeers = await getWorkspaceDepsPeers(pkg);
  const unused = Object.keys(dependencies).filter(
    (dep) =>
      !runtimeImports.includes(dep) &&
      !lazyImports.includes(dep) &&
      !sourceImports.has(dep) &&
      !providedPeers.has(dep),
  );
  if (unused.length)
    problems.push(`${name} declares unused dependencies: ${unused.join(", ")}`);

  return problems;
}

async function getWorkspaceDepsPeers(pkg: WorkspacePkg): Promise<Set<string>> {
  const pkgs = await getWorkspacePkgs();
  const deps = Object.keys(pkg.packageJson.dependencies || {});
  return new Set(
    pkgs
      .filter(({ packageJson }) => deps.includes(packageJson.name))
      .flatMap(({ packageJson }) =>
        Object.keys(packageJson.peerDependencies || {}),
      ),
  );
}

const SOURCE_IMPORT_RE =
  /(?:\bfrom\s+|\bimport\s+|\bimport\s*\(\s*)["']([^"'./][^"']*)["']/g;

async function scanSourceImports(pkg: WorkspacePkg): Promise<Set<string>> {
  const imports = new Set<string>();
  const srcDir = path.join(pkg.dir, "src");
  const files = await Array.fromAsync(
    new Bun.Glob("**/*.{ts,js}").scan({ cwd: srcDir, followSymlinks: false }),
  );
  await Promise.all(
    files
      .filter((file) => !/\.(test|eval)\.ts$|__factories__/.test(file))
      .map(async (file) => {
        const text = await fs.readFile(path.join(srcDir, file), "utf-8");
        for (const [, specifier] of text.matchAll(SOURCE_IMPORT_RE)) {
          if (specifier) imports.add(npmPkgName(specifier));
        }
      }),
  );
  return imports;
}

export function matchesAny(name: string, patterns: string[]): boolean {
  return patterns.some((pattern) =>
    pattern.endsWith("/*")
      ? name.startsWith(pattern.slice(0, -1))
      : name === pattern,
  );
}

function isBunImport(name: string): boolean {
  return name === "bun" || name.startsWith("bun:");
}

function npmPkgName(specifier: string): string {
  const [first, second] = specifier.split("/");
  return (first?.startsWith("@") ? `${first}/${second}` : first) || specifier;
}

function isNodeBuiltin(specifier: string): boolean {
  return specifier.startsWith("node:") || builtinModules.includes(specifier);
}

export namespace getWorkspaceReport {
  export interface Entry {
    name: string;
    published: boolean;
    version: string;
    dependencies: Record<string, string>;
    inspection: WorkspacePkg.Inspection;
    problems: string[];
  }
}

/** Inspects and checks all workspace packages. */
export async function getWorkspaceReport(): Promise<
  getWorkspaceReport.Entry[]
> {
  const pkgs = await getWorkspacePkgs();
  return Promise.all(
    pkgs.map(async (pkg) => {
      const inspection = await inspectWorkspacePkg(pkg);
      return {
        name: pkg.packageJson.name,
        published: isPublishedPkg(pkg),
        version: pkg.packageJson.version,
        dependencies: pkg.packageJson.dependencies || {},
        inspection,
        problems: await checkWorkspacePkg(pkg, inspection),
      };
    }),
  );
}

// Prints the inspection report as JSON.
if (import.meta.main) {
  console.log(JSON.stringify(await getWorkspaceReport()));
}
