import { GitHubData } from "#/data/github";
import { MetaData } from "#/data/meta";

export abstract class MetaSource {
  static create(source: MetaData.SourceName): MetaSource {
    switch (source) {
      case "version":
      case "npm":
      case "pip":
        return new MetaSourceVersion();

      case "bin": {
        return new MetaSourceBin();
      }

      // TODO: Package size are irrelevant for Pip and npm (50 KB and 2 MB
      // respectively), so we can just use the version source for now.
      // But they contain tons of interesting metadata that we can utilize
      // in the future, so I didn't remove them entirely.

      // case "npm":
      //   return new MetaSourceNpm();

      // case "pip":
      //   return new MetaSourcePip();

      default:
        source satisfies never;
        throw new Error(`Unknown meta source: ${source}`);
    }
  }

  abstract render(): Promise<string>;

  protected renderChunks(
    chunks: (string | number | false | null | undefined)[],
  ): string {
    return chunks.filter(Boolean).join("<text-del></text-del>");
  }
}

export class MetaSourceVersion extends MetaSource {
  static #releasePromise: Promise<GitHubData.Release> | undefined;

  static preset(release: GitHubData.Release) {
    this.#releasePromise = Promise.resolve(release);
  }

  static latestRelease(): Promise<GitHubData.Release> {
    MetaSourceVersion.#releasePromise ??= GitHubData.fetchLatestRelease();
    return MetaSourceVersion.#releasePromise;
  }

  async render(): Promise<string> {
    const { version } = await MetaSourceVersion.latestRelease();
    return MetaData.formatVersion(version);
  }
}

export class MetaSourceBin extends MetaSource {
  // TODO: Detect architecture using `navigator.userAgentData.getHighEntropyValues`.

  async render(): Promise<string> {
    const { version, artifacts } = await MetaSourceVersion.latestRelease();
    const binArtifacts = artifacts.filter((artifact) =>
      MetaData.isBinArtifact(version, artifact),
    );
    // Average across platform to avoid detection
    const size = Math.round(
      binArtifacts.reduce((acc, artifact) => acc + artifact.size, 0) /
        binArtifacts.length,
    );

    return this.renderChunks(pkgChunks(version, size));
  }
}

export class MetaSourceNpm extends MetaSource {
  static #packagePromises: Record<string, Promise<MetaData.NpmPackage>> = {};

  async render(): Promise<string> {
    const release = await MetaSourceVersion.latestRelease();
    const {
      version,
      dist: { unpackedSize },
    } = await MetaSourceNpm.#npmPackage(release.version);

    return this.renderChunks(pkgChunks(version, unpackedSize));
  }

  static #npmPackage(version: string): Promise<MetaData.NpmPackage> {
    this.#packagePromises[version] ??= MetaData.fetchNpmPackage(version);
    return this.#packagePromises[version];
  }
}

export class MetaSourcePip extends MetaSource {
  static #packagePromises: Record<string, Promise<MetaData.PipPackage>> = {};

  async render(): Promise<string> {
    const release = await MetaSourceVersion.latestRelease();
    const pipPackage = await MetaSourcePip.#pipPackage(release.version);
    const wheelPkg = pipPackage.urls.find(
      (url) => url.packagetype === "bdist_wheel",
    );
    const pkg = pipPackage.urls.find((url) => url.packagetype === "sdist");
    const size = wheelPkg?.size ?? pkg?.size;

    return this.renderChunks(pkgChunks(pipPackage.info.version, size));
  }

  static #pipPackage(version: string): Promise<MetaData.PipPackage> {
    this.#packagePromises[version] ??= MetaData.fetchPipPackage(version);
    return this.#packagePromises[version];
  }
}

function pkgChunks(
  version: string,
  size: number | undefined,
): (string | number | false | null | undefined)[] {
  return [MetaData.formatVersion(version), size && MetaData.formatBytes(size)];
}
