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
const EVAL_PATH = new URL(
  "../src/server/accessibility/__snapshots__/eval.json",
  import.meta.url,
);
const EVAL_BASE_PATH = new URL(
  "../src/server/accessibility/__snapshots__/eval-base.json",
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

interface EvalEntry {
  input: { statement: string };
  expected: unknown;
  rendered_columns: { label: string; value: unknown }[];
}

interface EvalReport {
  evals: EvalEntry[];
}

interface StatementEval {
  statement: string;
  trials: number;
  correct: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

type EvalMetric = "accuracy" | "inputTokens" | "outputTokens" | "totalTokens";

const encoder = get_encoding(ENCODING);

try {
  const platforms = await Promise.all(PLATFORMS.map(reportPlatform));
  const baseline = await readBaseline(platforms);
  const [baselineEvals, currentEvals] = await readEvals();
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
    const comparedSnapshotNames = snapshotNames.filter(
      (snapshotName) =>
        snapshotName in baselineSnapshots && snapshotName in currentSnapshots,
    );
    const before = sumTokens(baselineSnapshots, comparedSnapshotNames);
    const after = sumTokens(currentSnapshots, comparedSnapshotNames);
    const averageBefore = Math.round(before / comparedSnapshotNames.length);
    const averageAfter = Math.round(after / comparedSnapshotNames.length);

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
      `| _Average_ | _${averageBefore}_ | _${averageAfter}_ | _${formatChange(averageAfter - averageBefore)}_ | _${formatPercent(averageBefore, averageAfter)}_ |`,
      `| **Total** | **${before}** | **${after}** | **${formatChange(after - before)}** | **${formatPercent(before, after)}** |`,
    );
  }

  lines.push(
    "",
    "## Eval Results",
    ...reportEvalMetric("Accuracy", "accuracy", baselineEvals, currentEvals),
    ...reportEvalMetric(
      "Average input tokens",
      "inputTokens",
      baselineEvals,
      currentEvals,
    ),
    ...reportEvalMetric(
      "Average output tokens",
      "outputTokens",
      baselineEvals,
      currentEvals,
    ),
    ...reportEvalMetric(
      "Average total tokens",
      "totalTokens",
      baselineEvals,
      currentEvals,
    ),
  );

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

function sumTokens(
  snapshots: Record<string, number>,
  snapshotNames: string[],
): number {
  return snapshotNames.reduce(
    (total, snapshotName) => total + snapshots[snapshotName]!,
    0,
  );
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

function formatNumber(value: number): string {
  return value.toFixed(2).replace(/\.00$/, "");
}

async function readEvals(): Promise<[StatementEval[], StatementEval[]]> {
  const baseline = await reportEvals(EVAL_BASE_PATH);
  try {
    return [baseline, await reportEvals(EVAL_PATH)];
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return [baseline, baseline];
    }
    throw error;
  }
}

async function reportEvals(path: URL): Promise<StatementEval[]> {
  const report = JSON.parse(await fs.readFile(path, "utf-8")) as EvalReport;
  const statements: Record<string, StatementEval> = {};

  for (const entry of report.evals) {
    const columns = Object.fromEntries(
      entry.rendered_columns.map((column) => [column.label, column.value]),
    );
    const inputTokens = columns["Input tokens"];
    const outputTokens = columns["Output tokens"];
    const totalTokens = columns["Total tokens"];
    if (
      typeof inputTokens !== "number" ||
      typeof outputTokens !== "number" ||
      typeof totalTokens !== "number"
    ) {
      continue;
    }

    const statement = entry.input.statement;
    const result = (statements[statement] ??= {
      statement,
      trials: 0,
      correct: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    });
    result.trials++;
    if (columns.Value === entry.expected) result.correct++;
    result.inputTokens += inputTokens;
    result.outputTokens += outputTokens;
    result.totalTokens += totalTokens;
  }

  return Object.values(statements);
}

function reportEvalMetric(
  title: string,
  metric: EvalMetric,
  baseline: StatementEval[],
  current: StatementEval[],
): string[] {
  const baselineStatements = Object.fromEntries(
    baseline.map((entry) => [entry.statement, entry]),
  );
  const currentStatements = Object.fromEntries(
    current.map((entry) => [entry.statement, entry]),
  );
  const statements = Array.from(
    new Set([
      ...Object.keys(baselineStatements),
      ...Object.keys(currentStatements),
    ]),
  );
  const percent = metric === "accuracy";

  return [
    "",
    `### ${title}`,
    "",
    "| Statement | Before | After | Change | Change % |",
    "| --- | ---: | ---: | ---: | ---: |",
    ...statements.map((statement) => {
      const before = evalMetric(baselineStatements[statement], metric);
      const after = evalMetric(currentStatements[statement], metric);
      const suffix = percent ? "%" : "";
      return `| ${statement} | ${formatNumber(before)}${suffix} | ${formatNumber(after)}${suffix} | ${formatChange(Number(formatNumber(after - before)))}${suffix} | ${formatPercent(before, after)} |`;
    }),
  ];
}

function evalMetric(
  entry: StatementEval | undefined,
  metric: EvalMetric,
): number {
  if (!entry) return 0;
  if (metric === "accuracy") return (entry.correct / entry.trials) * 100;
  return Math.round(entry[metric] / entry.trials);
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
