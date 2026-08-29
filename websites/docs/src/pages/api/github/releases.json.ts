import { GitHubData } from "#/data/github";
import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

export const prerender = false;

export const GET: APIRoute = async () => {
  const result = await GitHubData.fetchLatestRelease(env.GITHUB_TOKEN);

  return Response.json(result, {
    headers: { "Cache-Control": "public, max-age=0, s-maxage=900" },
  });
};
