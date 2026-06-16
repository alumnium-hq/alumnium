import { githubRepositoryUrl } from "#/copy/links";
import * as z from "zod/mini";

export namespace GitHubData {
  export type Repository = z.infer<typeof GitHubData.Repository>;
  export type ApiContributor = z.infer<typeof GitHubData.ApiContributor>;

  export interface Contributor {
    username: string;
    avatarUrl: string;
    contributions: number;
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

  static headers(): HeadersInit {
    return {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };
  }
}
