// @ts-check
import { defineConfig, sharpImageService } from "astro/config";
import starlight from "@astrojs/starlight";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";

// https://astro.build/config
export default defineConfig({
  site: "https://alumnium.ai",
  image: {
    service: sharpImageService({ limitInputPixels: false }),
  },
  build: {
    format: "directory",
  },
  trailingSlash: "ignore",
  integrations: [
    starlight({
      logo: {
        src: "./public/favicon.svg",
        alt: "Alumnium",
        replacesTitle: true,
      },
      title: "Alumnium",
      social: [
        { icon: "github", label: "GitHub", href: "https://github.com/alumnium-hq/alumnium" },
        { icon: "discord", label: "Discord", href: "https://discord.gg/mP29tTtKHg" },
        { icon: "slack", label: "Slack", href: "https://seleniumhq.slack.com/channels/alumnium" },
      ],
      favicon: "./public/favicon.svg",
      head: [
        {
          tag: "link",
          attrs: {
            rel: "icon",
            href: "/favicon.ico",
            sizes: "32x32",
          },
        },
        {
          tag: "link",
          attrs: {
            rel: "icon",
            href: "/favicon.svg",
            type: "image/svg+xml",
          },
        },
        {
          tag: "link",
          attrs: {
            rel: "apple-touch-icon",
            href: "/apple-touch-icon.png",
          },
        },
        {
          tag: "script",
          attrs: {
            src: "https://scripts.simpleanalyticscdn.com/latest.js",
            async: true,
          },
        },
      ],
      sidebar: [
        {
          label: "Getting Started",
          items: [
            {
              label: "Overview",
              slug: "docs",
            },
            {
              label: "Installation",
              slug: "docs/getting-started/installation",
            },
            {
              label: "Configuration",
              slug: "docs/getting-started/configuration",
            },
          ],
        },
        {
          label: "Writing First Test",
          items: [
            {
              label: "Appium",
              slug: "docs/writing-first-test/appium",
            },
            {
              label: "Playwright",
              slug: "docs/writing-first-test/playwright",
            },
            {
              label: "Selenium",
              slug: "docs/writing-first-test/selenium",
            },
          ],
        },
        {
          label: "Guides",
          items: [
            {
              label: "Doing Actions",
              slug: "docs/guides/actions",
            },
            {
              label: "Checking Verifications",
              slug: "docs/guides/verifications",
            },
            {
              label: "Getting Data",
              slug: "docs/guides/retrievals",
            },
            {
              label: "Finding Elements",
              slug: "docs/guides/elements",
            },
            {
              label: "Focusing Areas",
              slug: "docs/guides/areas",
            },
            {
              label: "Caching",
              slug: "docs/guides/caching",
            },
            {
              label: "Self-hosting LLMs",
              slug: "docs/guides/self-hosting",
            },
            {
              label: "MCP",
              slug: "docs/guides/mcp",
            },
          ],
        },
        {
          label: "Reference",
          slug: "docs/reference",
        },
      ],
      customCss: ["./src/styles/global.css"],
      components: {
        // Override the default `Header` component.
        Header: "./src/components/overrides/Header.astro",
        MobileMenuFooter: "./src/components/overrides/MobileMenuFooter.astro",
      },
    }),
    sitemap({}),
  ],
  vite: { plugins: [tailwindcss()] },
  redirects: {
    "/docs/getting-started/writing-first-test": "/docs/writing-first-test/selenium",
  },
});
