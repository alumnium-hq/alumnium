import type { APIRoute } from "astro";

export const GET: APIRoute = () =>
  new Response(`User-agent: *
Allow: /

Sitemap: https://alumnium.ai/sitemap-index.xml
`);
