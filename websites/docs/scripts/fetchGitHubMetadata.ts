import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { GitHubData } from "#/data/github";

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(SCRIPTS_DIR, "..", "src", "data");
const METADATA_PATH = path.join(DATA_DIR, "github", "metadata.json");

const [metadata, contributors, releases] = await Promise.all([
  GitHubData.fetchRepository(),
  GitHubData.fetchContributors(),
  GitHubData.fetchReleases(),
]);

await fs.writeFile(
  METADATA_PATH,
  JSON.stringify(
    {
      stars: metadata.stargazers_count,
      contributors,
      releases,
    },
    null,
    2,
  ),
);
console.log(`Written: ${path.relative(process.cwd(), METADATA_PATH)}`);
