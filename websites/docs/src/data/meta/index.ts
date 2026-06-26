import * as z from "zod/mini";
import type { GitHubData } from "../github";

export namespace MetaData {
  export interface Release {
    version: string;
    artifacts: ReleaseArtifact[];
  }

  export interface ReleaseArtifact {
    name: string;
    size: number;
  }

  export type SourceOptions = SourceBinOptions;

  export type SourceBinOptions = z.infer<typeof MetaData.SourceBinOptions>;

  export type SourceName = z.infer<typeof MetaData.SourceName>;

  export type NpmPackage = z.infer<typeof MetaData.NpmPackage>;

  export type PipPackage = z.infer<typeof MetaData.PipPackage>;
}

export abstract class MetaData {
  static NpmPackage = z.object({
    version: z.string(),
    dist: z.object({
      unpackedSize: z.number(),
    }),
  });

  static PipPackage = z.object({
    info: z.object({
      version: z.string(),
    }),
    urls: z.array(
      z.object({
        packagetype: z.string(),
        size: z.number(),
      }),
    ),
  });

  static SourceName = z.enum(["version", "npm", "pip", "bin"]);

  // static

  static platforms = [
    "darwin-arm64",
    "darwin-x64",
    "linux-arm64",
    "linux-x64",
    "windows-arm64",
    "windows-x64",
  ] as const;

  static SourceBinOptions = z.object({
    platform: z.enum([
      "darwin-arm64",
      "darwin-x64",
      "linux-arm64",
      "linux-x64",
      "windows-arm64",
      "windows-x64",
    ]),
  });

  static async fetchNpmPackage(version: string): Promise<MetaData.NpmPackage> {
    const packageApiUrl = `https://registry.npmjs.org/alumnium/${version}`;
    const response = await fetch(packageApiUrl);
    if (!response.ok)
      throw new Error(
        `Failed to fetch npm data for alumnium@${version} from ${packageApiUrl}: ${response.status} ${response.statusText}`,
      );

    const json = await response.json();
    return z.parse(MetaData.NpmPackage, json);
  }

  static async fetchPipPackage(version: string): Promise<MetaData.PipPackage> {
    const packageApiUrl = `https://pypi.org/pypi/alumnium/${version}/json`;
    const response = await fetch(packageApiUrl);
    if (!response.ok)
      throw new Error(
        `Failed to fetch PyPI data for alumnium ${version} from ${packageApiUrl}: ${response.status} ${response.statusText}`,
      );

    const json = await response.json();
    return z.parse(MetaData.PipPackage, json);
  }

  static binArtifactName(
    version: string,
    platform: MetaData.SourceBinOptions["platform"],
  ): string {
    const extension = platform.startsWith("windows-") ? ".exe" : "";
    return `alumnium-${version}-${platform}${extension}`;
  }

  static formatVersion(version: string): string {
    return `v${version}`;
  }

  static formatBytes(size: number): string {
    if (size >= 1_000_000) return `${Math.round(size / 1_000_000)} MB`;
    if (size >= 1_000) return `${Math.round(size / 1_000)} KB`;

    return `${size} B`;
  }

  static isBinArtifact(
    version: string,
    artifact: GitHubData.ReleaseArtifact,
  ): boolean {
    return this.platforms.some(
      (platform) =>
        MetaData.binArtifactName(version, platform) === artifact.name,
    );
  }
}
