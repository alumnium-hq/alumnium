import fs from "node:fs/promises";
import path from "node:path";
import z from "zod";
import {
  CachePruner,
  CacheStore,
  CliCommand,
  Logger,
} from "@alumnium/core/internal";

const logger = Logger.get(import.meta.url);

const CacheStatsCommand = CliCommand.define({
  name: "stats",
  description: "Show cache entries and size by app and model",
  Args: z.object({}),

  action: async () => {
    await Logger.initEnv({ logger });
    await printStats(cachePruner());
  },
});

const CachePruneCommand = CliCommand.define({
  name: "prune",
  description: "Remove least recently used and long unused cache entries",

  Args: z.object({
    maxSize: CliCommand.envOption("ALUMNIUM_CACHE_MAX_SIZE", {
      name: "max-size",
      syntax: "--max-size <size>",
      description:
        "Prune least recently used entries above this size, e.g. 500MB, 0 for no limit",
    }),
    maxAge: CliCommand.envOption("ALUMNIUM_CACHE_MAX_AGE", {
      name: "max-age",
      syntax: "--max-age <age>",
      description: "Prune entries unused for longer than this, e.g. 30d",
    }),
    dryRun: z
      .union([z.boolean(), z.stringbool()])
      .default(false)
      .register(CliCommand.option, {
        name: "dry-run",
        syntax: "--dry-run",
        description: "Report what would be removed without removing it",
      }),
  }),

  action: async ({ args }) => {
    await Logger.initEnv({ logger });
    const pruner = cachePruner();

    const result = await pruner.prune({
      maxSize: args.maxSize || undefined,
      maxAge: args.maxAge,
      dryRun: args.dryRun,
    });
    if (!result) {
      logger.warn(`Cache ${pruner.dir} is being pruned by another process`);
      return;
    }
    const verb = args.dryRun ? "Would remove" : "Removed";
    logger.info(
      `${verb} ${result.removedEntries} of ${result.entries} entries (${formatSize(result.removedSize)} of ${formatSize(result.size)}) from ${pruner.dir}`,
    );
  },
});

export const CacheCommand = CliCommand.group({
  name: "cache",
  description: "Show cache stats or prune the cache",
  commands: [CacheStatsCommand, CachePruneCommand],
});

function cachePruner(): CachePruner {
  return new CachePruner(path.resolve(CacheStore.rootDir()));
}

async function printStats(pruner: CachePruner) {
  if (!(await fs.stat(pruner.dir).catch(() => null))) {
    logger.info(`No cache at ${pruner.dir}`);
    return;
  }

  const groups: Record<string, { entries: number; size: number }> = {};
  for (const entry of await pruner.entries()) {
    // Entries live under <app>/<provider>/<model>/.
    const group = path
      .relative(pruner.dir, entry.dir)
      .split(path.sep)
      .slice(0, 3)
      .join("/");
    groups[group] ??= { entries: 0, size: 0 };
    groups[group].entries++;
    groups[group].size += entry.size;
  }

  const rows = Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  const total = rows.reduce(
    (sum, [, group]) => ({
      entries: sum.entries + group.entries,
      size: sum.size + group.size,
    }),
    { entries: 0, size: 0 },
  );

  logger.info(`Cache ${pruner.dir}`);
  rows.forEach(([group, { entries, size }]) =>
    logger.info(`  ${group}: ${entries} entries, ${formatSize(size)}`),
  );
  logger.info(`Total: ${total.entries} entries, ${formatSize(total.size)}`);
}

function formatSize(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit++;
  }
  return `${unit ? size.toFixed(1) : size}${units[unit]}`;
}
