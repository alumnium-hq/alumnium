import { GitHubData } from "#/data/github";
import type { APIRoute } from "astro";

export const prerender = false;

export const GET: APIRoute = async () => {
  const [repository, contributors] = await Promise.all([
    GitHubData.fetchRepository(),
    GitHubData.fetchContributors(),
  ]);
  const result = { stars: repository.stargazers_count, contributors };

  return Response.json(result, {
    headers: { "Cache-Control": "public, max-age=0, s-maxage=21600" },
  });
};
