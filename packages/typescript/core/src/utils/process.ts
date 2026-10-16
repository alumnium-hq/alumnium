import {
  spawn as spawnProcess,
  type SpawnOptionsWithoutStdio,
} from "node:child_process";

export async function exec(
  command: string,
  args: string[],
  options: Parameters<typeof spawn>[2] = {},
) {
  const result = await spawn(command, args, {
    timeout: 120_000,
    ...options,
  });
  if (result.status !== 0)
    throw new Error(
      `${command} exited with status ${result.status}: ${(result.stderr || result.stdout).trim()}`,
    );
  return result;
}

export function spawn(
  command: string,
  args: string[],
  options: Pick<SpawnOptionsWithoutStdio, "env" | "timeout"> = {},
): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawnProcess(command, args, {
      ...options,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf-8");
    child.stderr.setEncoding("utf-8");
    child.stdout.on("data", (chunk: string) => (stdout += chunk));
    child.stderr.on("data", (chunk: string) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}
