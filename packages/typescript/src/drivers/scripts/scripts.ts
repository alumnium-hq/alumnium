import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export namespace DriverScripts {
  export type Result<Payload> = ResultSuccess<Payload> | ResultError;

  export interface ResultSuccess<Payload> {
    status: "success";
    payload: Payload;
  }

  export interface ResultError {
    status: "error";
    message: string;
  }
}

export async function readScript(scriptName: string): Promise<string> {
  const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
  const scriptPath = path.resolve(scriptsDir, scriptName);
  const content = await fs.readFile(scriptPath, "utf-8");
  return content;
}
