import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

interface AsciicastHeader {
  version: number;
  width: number;
  height: number;
}

interface RecordingMetadata {
  src: string;
  version: number;
  cols: number;
  rows: number;
}

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(SCRIPTS_DIR, "..", "src", "data");
const RECORDINGS_PATH = path.join(DATA_DIR, "asciinema-recordings.json");
const METADATA_PATH = path.join(DATA_DIR, "asciinema-metadata.json");

async function readRecordings(): Promise<string[]> {
  const raw = await fs.readFile(RECORDINGS_PATH, "utf8");
  return JSON.parse(raw);
}

async function fetchHeader(src: string): Promise<RecordingMetadata> {
  const response = await fetch(src);
  if (!response.ok)
    throw new Error(
      `Failed to fetch ${src}: ${response.status} ${response.statusText}`,
    );

  const firstLine = (await response.text()).split("\n", 1)[0];
  const header = JSON.parse(firstLine) as Partial<AsciicastHeader>;

  if (
    typeof header.version !== "number" ||
    typeof header.width !== "number" ||
    typeof header.height !== "number"
  ) {
    throw new Error(`Invalid asciicast header for ${src}`);
  }

  return {
    src,
    version: header.version,
    cols: header.width,
    rows: header.height,
  };
}

const recordings = await readRecordings();

const entries = await Promise.all(
  recordings.map(async (src) => {
    const metadata = await fetchHeader(src);
    console.log(
      `Fetched ${src}: ${metadata.cols}x${metadata.rows} v${metadata.version}`,
    );
    return [src, metadata] as const;
  }),
);

await fs.writeFile(
  METADATA_PATH,
  JSON.stringify(Object.fromEntries(entries), null, 2),
);
console.log(`Written: ${path.relative(process.cwd(), METADATA_PATH)}`);
