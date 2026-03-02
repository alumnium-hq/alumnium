import path from "node:path";
import z from "zod";

export const PackageJson = z.object({
  version: z.string(),
});

let version: string | undefined;

export async function getAlumniumVersion(): Promise<string> {
  if (version) return version;
  const packageJson = await Bun.file(
    path.resolve(import.meta.dir, "../package.json"),
  ).json();
  const parsedJson = PackageJson.parse(packageJson);
  version = parsedJson.version;
  return version;
}
