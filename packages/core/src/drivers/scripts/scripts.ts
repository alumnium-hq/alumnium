import path from "node:path";

export async function readScript(scriptName: string): Promise<string> {
  const scriptPath = path.resolve(import.meta.dir, scriptName);
  const content = await Bun.file(scriptPath).text();
  return content;
}
