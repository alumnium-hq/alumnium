import path from "node:path";

export const DEFAULT_FS_STATE_PATH = path.join(process.cwd(), ".alumnium");

export function fsStatePath(segment: string = "."): string {
  const basePath = process.env.ALUMNIUM_STATE_PATH || DEFAULT_FS_STATE_PATH;
  return path.resolve(basePath, segment);
}
