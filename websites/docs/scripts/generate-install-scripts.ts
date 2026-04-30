import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const REPO = "alumnium-hq/alumnium";
const GITHUB_API = "https://api.github.com";
const SCRIPTS_DIR = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(SCRIPTS_DIR, "..", "public");

const UNIX_PLATFORMS = [
  "darwin-arm64",
  "darwin-x64",
  "linux-arm64",
  "linux-x64",
] as const;
const WIN_PLATFORMS = ["windows-arm64", "windows-x64"] as const;

async function fetchGitHub(path: string): Promise<Response> {
  const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${GITHUB_API}${path}`, { headers });
  if (!res.ok)
    throw new Error(`GitHub API ${path} → ${res.status} ${res.statusText}`);
  return res;
}

type ReleaseAsset = { name: string; digest: string };
type Release = { tag_name: string; assets: ReleaseAsset[] };

async function fetchRelease(): Promise<Release> {
  const version = process.argv[2] ?? process.env.ALUMNIUM_VERSION;
  const path = version
    ? `/repos/${REPO}/releases/tags/${version}`
    : `/repos/${REPO}/releases/latest`;
  const res = await fetchGitHub(path);
  return res.json() as Promise<Release>;
}

function binaryName(version: string, platform: string): string {
  const ext = platform.startsWith("windows") ? ".exe" : "";
  return `alumnium-${version}-${platform}${ext}`;
}

function generateChecksums(release: Release): Record<string, string> {
  const assetMap = Object.fromEntries(
    release.assets.map(({ name, digest }) => [name, digest]),
  );

  const checksums: Record<string, string> = {};
  for (const platform of [...UNIX_PLATFORMS, ...WIN_PLATFORMS]) {
    const name = binaryName(release.tag_name, platform);
    const digest = assetMap[name];
    if (!digest) throw new Error(`No asset found for ${name}`);
    const sha256 = digest.replace(/^sha256:/, "");
    checksums[platform] = sha256;
    console.log(`  ${name}: ${sha256}`);
  }
  return checksums;
}

function renderTemplate(name: string, vars: Record<string, string>): string {
  let tpl = readFileSync(join(SCRIPTS_DIR, name), "utf8");
  for (const [key, value] of Object.entries(vars)) {
    tpl = tpl.replaceAll(`{{${key}}}`, value);
  }
  return tpl;
}

// --- main ---

const release = await fetchRelease();
console.log(`Generating install scripts for version ${release.tag_name}...`);

const checksums = generateChecksums(release);

const vars = {
  VERSION: release.tag_name,
  CHECKSUM_darwin_arm64: checksums["darwin-arm64"],
  CHECKSUM_darwin_x64: checksums["darwin-x64"],
  CHECKSUM_linux_arm64: checksums["linux-arm64"],
  CHECKSUM_linux_x64: checksums["linux-x64"],
  CHECKSUM_windows_x64: checksums["windows-x64"],
  CHECKSUM_windows_arm64: checksums["windows-arm64"],
};

writeFileSync(
  join(PUBLIC_DIR, "install.sh"),
  renderTemplate("install.sh.tpl", vars),
);
console.log("Written: public/install.sh");

writeFileSync(
  join(PUBLIC_DIR, "install.ps1"),
  renderTemplate("install.ps1.tpl", vars),
);
console.log("Written: public/install.ps1");
