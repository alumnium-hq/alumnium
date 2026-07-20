import type { APIRoute } from "astro";

export const GET: APIRoute = () =>
  new Response(`User-agent: *
Disallow: /
`);
