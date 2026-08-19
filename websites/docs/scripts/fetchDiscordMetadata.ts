import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { DiscordData } from "#/data/discord";

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(SCRIPTS_DIR, "..", "src", "data");
const METADATA_PATH = path.join(DATA_DIR, "discord", "metadata.json");

const invite = await DiscordData.fetchInvite();

await fs.writeFile(
  METADATA_PATH,
  JSON.stringify(
    {
      memberCount: invite.approximate_member_count,
      presenceCount: invite.approximate_presence_count,
    },
    null,
    2,
  ),
);
console.log(`Written: ${path.relative(process.cwd(), METADATA_PATH)}`);
