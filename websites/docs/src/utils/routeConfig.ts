import type { StarlightRouteData } from "@astrojs/starlight/route-data";
import { getHead } from "../../node_modules/@astrojs/starlight/utils/head.ts";
import { generateToC } from "../../node_modules/@astrojs/starlight/utils/generateToC.ts";
import type { MarkdownHeading } from "astro";

const siteTitle = "Alumnium";

// This function is used to generate the Starlight-like route config for the blog posts.
export function routeConfig(data: {
  title: string;
  slug: string;
  description?: string;
  siteTitleHref?: string;
  toc?: MarkdownHeading[];
}): StarlightRouteData {
  const entry = {
    id: data.slug,
    slug: data.slug,
    filePath: data.slug,
    data: {
      title: data.title,
      description: data.description,
      head: [],
      pagefind: false,
      editUrl: false,
      template: "doc" as const,
      sidebar: { hidden: true, attrs: {} },
      draft: false,
    },
    collection: "docs" as const,
  };
  const entryMeta = { dir: "ltr" as const, lang: "en" as const, locale: "en-US" as const };
  return {
    siteTitle,
    entry,
    entryMeta,
    pagination: { prev: undefined, next: undefined },
    headings: [],
    sidebar: [],
    hasSidebar: false,
    siteTitleHref: data.siteTitleHref || "/",
    toc: {
      minHeadingLevel: 2,
      maxHeadingLevel: 3,
      items: generateToC(
        data.toc || [],
        {
          minHeadingLevel: 2,
          maxHeadingLevel: 3,
          title: "Overview",
        }
      ),
    },
    lastUpdated: undefined,
    editUrl: undefined,
    slug: data.slug,
    id: data.slug,
    dir: "ltr",
    lang: "en",
    locale: "en-US",
    head: getHead(
      { entry, lang: "en", entryMeta, headings: [], slug: data.slug, id: data.slug, dir: "ltr", locale: "en-US" },
      { url: new URL(data.slug, "https://alumnium.ai/blog/"), generator: "Astro", site: new URL("https://alumnium.ai") },
      siteTitle,
    ),
  };
}
