import { GitHubData } from "#/data/github";
import type { APIRoute } from "astro";

export const prerender = false;

export const GET: APIRoute = async () => {
  const result = await GitHubData.fetchLatestRelease();

  return Response.json(result, {
    headers: { "Cache-Control": "public, max-age=0, s-maxage=900" },
  });
};
