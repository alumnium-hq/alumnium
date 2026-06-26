import { githubRepositoryUrl } from "#/copy/links";
import * as z from "zod/mini";

export namespace GitHubData {
  export type Repository = z.infer<typeof GitHubData.Repository>;
  export type ApiContributor = z.infer<typeof GitHubData.ApiContributor>;
  export type ApiRelease = z.infer<typeof GitHubData.ApiRelease>;

  export interface Contributor {
    username: string;
    avatarUrl: string;
    contributions: number;
  }

  export interface Release {
    version: string;
    latest: boolean;
    artifacts: ReleaseArtifact[];
  }

  export interface ReleaseArtifact {
    name: string;
    size: number;
  }
}

export abstract class GitHubData {
  static Repository = z.object({
    stargazers_count: z.number(),
  });

  static ApiContributor = z.object({
    login: z.string(),
    avatar_url: z.string(),
    contributions: z.number(),
  });

  static ApiReleaseAsset = z.object({
    name: z.string(),
    size: z.number(),
  });

  static ApiRelease = z.object({
    tag_name: z.string(),
    draft: z.boolean(),
    prerelease: z.boolean(),
    assets: z.array(GitHubData.ApiReleaseAsset),
  });

  static async fetchRepository(): Promise<GitHubData.Repository> {
    const repositoryApiUrl = GitHubData.repositoryApiUrl(githubRepositoryUrl);
    const response = await fetch(repositoryApiUrl, {
      headers: GitHubData.headers(),
    });

    if (!response.ok)
      throw new Error(
        `Failed to fetch repository data for ${githubRepositoryUrl} from ${repositoryApiUrl}: ${response.status} ${response.statusText}`,
      );

    return z.parse(GitHubData.Repository, await response.json());
  }

  static async fetchContributors(): Promise<GitHubData.Contributor[]> {
    const contributorsApiUrl = `${GitHubData.repositoryApiUrl(githubRepositoryUrl)}/contributors?per_page=30`;
    const response = await fetch(contributorsApiUrl, {
      headers: GitHubData.headers(),
    });

    if (!response.ok)
      throw new Error(
        `Failed to fetch contributors data for ${githubRepositoryUrl} from ${contributorsApiUrl}: ${response.status} ${response.statusText}`,
      );

    const contributors = z.parse(
      z.array(GitHubData.ApiContributor),
      await response.json(),
    );

    return contributors
      .map((contributor) => GitHubData.normalizeContributor(contributor))
      .sort((a, b) => b.contributions - a.contributions);
  }

  static async fetchReleases(): Promise<GitHubData.Release[]> {
    const releasesApiUrl = `${GitHubData.repositoryApiUrl(githubRepositoryUrl)}/releases?per_page=30`;
    const response = await fetch(releasesApiUrl, {
      headers: GitHubData.headers(),
    });

    if (!response.ok)
      throw new Error(
        `Failed to fetch releases data for ${githubRepositoryUrl} from ${releasesApiUrl}: ${response.status} ${response.statusText}`,
      );

    const releases = z.parse(
      z.array(GitHubData.ApiRelease),
      await response.json(),
    );
    const publishedReleases = releases.filter(
      (release) => !release.draft && !release.prerelease,
    );

    return publishedReleases.map((release, index) =>
      GitHubData.normalizeRelease(release, index === 0),
    );
  }

  static async fetchLatestRelease(): Promise<GitHubData.Release> {
    const latestReleaseApiUrl = `${GitHubData.repositoryApiUrl(githubRepositoryUrl)}/releases/latest`;
    const response = await fetch(latestReleaseApiUrl, {
      headers: GitHubData.headers(),
    });

    if (!response.ok)
      throw new Error(
        `Failed to fetch latest release data for ${githubRepositoryUrl} from ${latestReleaseApiUrl}: ${response.status} ${response.statusText}`,
      );

    const release = z.parse(GitHubData.ApiRelease, await response.json());
    return GitHubData.normalizeRelease(release, true);
  }

  static repositoryApiUrl(href: string): string {
    const url = new URL(href);
    const [owner, repository] = url.pathname.split("/").filter(Boolean);
    if (!owner || !repository)
      throw new Error(`Invalid GitHub repository URL: ${href}`);

    return `https://api.github.com/repos/${owner}/${repository}`;
  }

  static normalizeContributor(
    contributor: GitHubData.ApiContributor,
  ): GitHubData.Contributor {
    return {
      username: contributor.login,
      avatarUrl: contributor.avatar_url,
      contributions: contributor.contributions,
    };
  }

  static normalizeRelease(
    release: GitHubData.ApiRelease,
    latest: boolean,
  ): GitHubData.Release {
    return {
      version: release.tag_name.replace(/^v/, ""),
      latest,
      artifacts: release.assets.map((asset) => ({
        name: asset.name,
        size: asset.size,
      })),
    };
  }

  static headers(): HeadersInit {
    return {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };
  }
}
