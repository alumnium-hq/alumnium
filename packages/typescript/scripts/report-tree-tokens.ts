import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { get_encoding } from "tiktoken";
import { $ } from "bun";

const SNAPSHOTS_PATH = new URL(
  "../src/server/accessibility/__snapshots__/",
  import.meta.url,
);
const REPORT_PATH = new URL(
  "../src/server/accessibility/__snapshots__/tokens.md",
  import.meta.url,
);
const BASELINE_PATH = new URL(
  "../src/server/accessibility/__snapshots__/tokens.json",
  import.meta.url,
);
const ENCODING = "cl100k_base";
const PLATFORMS = ["chrome", "uiautomator2", "xcuitest"];

interface SnapshotTokens {
  name: string;
  tokens: number;
}

interface PlatformTokens {
  name: string;
  snapshots: SnapshotTokens[];
  total: number;
}

interface TokenBaseline {
  encoding: string;
  platforms: Record<string, Record<string, number>>;
}

const encoder = get_encoding(ENCODING);

try {
  const platforms = await Promise.all(PLATFORMS.map(reportPlatform));
  const baseline = await readBaseline(platforms);
  const totalSnapshots = platforms.reduce(
    (total, platform) => total + platform.snapshots.length,
    0,
  );
  const totalTokens = platforms.reduce(
    (total, platform) => total + platform.total,
    0,
  );
  const lines = ["# Trees Tokens Report", "", `Encoding: \`${ENCODING}\``];

  for (const platform of platforms) {
    const baselineSnapshots = baseline.platforms[platform.name] ?? {};
    const currentSnapshots = Object.fromEntries(
      platform.snapshots.map((snapshot) => [snapshot.name, snapshot.tokens]),
    );
    const snapshotNames = Array.from(
      new Set([
        ...Object.keys(baselineSnapshots),
        ...Object.keys(currentSnapshots),
      ]),
    ).sort();
    const before = sumTokens(baselineSnapshots);

    lines.push(
      "",
      `## \`${platform.name}\``,
      "",
      "| Snapshot | Before | After | Change | Change % |",
      "| --- | ---: | ---: | ---: | ---: |",
      ...snapshotNames.map((snapshotName) => {
        const baselineTokens = baselineSnapshots[snapshotName] ?? 0;
        const currentTokens = currentSnapshots[snapshotName] ?? 0;
        return `| \`${snapshotName}\` | ${baselineTokens} | ${currentTokens} | ${formatChange(currentTokens - baselineTokens)} | ${formatPercent(baselineTokens, currentTokens)} |`;
      }),
      `| _Average_ | _${Math.round(before / Object.keys(baselineSnapshots).length)}_ | _${Math.round(platform.total / platform.snapshots.length)}_ | _${formatChange(Math.round(platform.total / platform.snapshots.length) - Math.round(before / Object.keys(baselineSnapshots).length))}_ | _${formatPercent(Math.round(before / Object.keys(baselineSnapshots).length), Math.round(platform.total / platform.snapshots.length))}_ |`,
      `| **Total** | **${before}** | **${platform.total}** | **${formatChange(platform.total - before)}** | **${formatPercent(before, platform.total)}** |`,
    );
  }

  await fs.writeFile(REPORT_PATH, `${lines.join("\n")}\n`);

  const path = fileURLToPath(REPORT_PATH);
  await $`oxfmt ${path}`;

  console.log(`Wrote ${totalSnapshots} snapshots and ${totalTokens} tokens`);
} finally {
  encoder.free();
}

async function readBaseline(
  platforms: PlatformTokens[],
): Promise<TokenBaseline> {
  try {
    const baseline = JSON.parse(
      await fs.readFile(BASELINE_PATH, "utf-8"),
    ) as TokenBaseline;
    if (baseline.encoding !== ENCODING) {
      throw new Error(
        `Token baseline uses ${baseline.encoding}, expected ${ENCODING}`,
      );
    }
    return baseline;
  } catch (error) {
    if (
      !(error instanceof Error && "code" in error && error.code === "ENOENT")
    ) {
      throw error;
    }

    const baseline: TokenBaseline = {
      encoding: ENCODING,
      platforms: Object.fromEntries(
        platforms.map((platform) => [
          platform.name,
          Object.fromEntries(
            platform.snapshots.map((snapshot) => [
              snapshot.name,
              snapshot.tokens,
            ]),
          ),
        ]),
      ),
    };
    await fs.writeFile(BASELINE_PATH, `${JSON.stringify(baseline, null, 2)}\n`);
    return baseline;
  }
}

function sumTokens(snapshots: Record<string, number>): number {
  return Object.values(snapshots).reduce((total, tokens) => total + tokens, 0);
}

function formatChange(change: number): string {
  return change > 0 ? `+${change}` : String(change);
}

function formatPercent(before: number, after: number): string {
  if (!before) return after ? "+∞%" : "0%";
  const percent = ((after - before) / before) * 100;
  const formatted = `${percent.toFixed(2).replace(/\.00$/, "")}%`;
  return percent > 0 ? `+${formatted}` : formatted;
}

async function reportPlatform(name: string): Promise<PlatformTokens> {
  const platformPath = new URL(`${name}/`, SNAPSHOTS_PATH);
  const snapshotNames = (await fs.readdir(platformPath))
    .filter((snapshotName) => snapshotName.endsWith(".snap.xml"))
    .sort();

  const snapshots = await Promise.all(
    snapshotNames.map(async (snapshotName) => {
      const snapshot = await fs.readFile(
        new URL(snapshotName, platformPath),
        "utf-8",
      );
      return {
        name: snapshotName,
        tokens: encoder.encode(snapshot).length,
      };
    }),
  );

  return {
    name,
    snapshots,
    total: snapshots.reduce((total, snapshot) => total + snapshot.tokens, 0),
  };
}
