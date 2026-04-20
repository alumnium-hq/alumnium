import { defineCollection, z } from "astro:content";
import { docsSchema } from "@astrojs/starlight/schema";
import { docsLoader } from "@astrojs/starlight/loaders";
import { glob } from "astro/loaders";

export const collections = {
  docs: defineCollection({
    loader: docsLoader(),
    schema: docsSchema(),
  }),
  blog: defineCollection({
    type: "content_layer",
    loader: glob({ pattern: "**/*.md", base: "./src/content/blog" }),
    schema: z.object({
      title: z.string(),
      description: z.string(),
      pubDate: z.coerce.date(),
      updatedDate: z.coerce.date().optional(),
      author: z.object({
        name: z.string(),
        image: z.string(),
      }),
      tags: z.array(z.string()).optional(),
    }),
  }),
};
