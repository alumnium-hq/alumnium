# Alumnium website

The Alumnium documentation website, built with [Astro](https://astro.build) and [Starlight](https://starlight.astro.build). Deployed to [alumnium.ai](https://alumnium.ai).

## Content

- **Landing page** — marketing overview with feature highlights, integration demos, and blog
- **Docs** — Getting Started, Writing First Test (Appium/Playwright/Selenium), Guides (Actions, Verifications, Retrievals, Elements, Areas, Caching, Self-hosting LLMs, MCP), and API Reference

Content lives in `src/content/docs/` as `.md`/`.mdx` files. Blog posts are in `src/content/blog/`.

## Commands

| Command           | Action                                     |
| :---------------- | :----------------------------------------- |
| `bun install`     | Install dependencies                       |
| `bun run dev`     | Start local dev server at `localhost:4321` |
| `bun run build`   | Build production site to `./dist/`         |
| `bun run preview` | Preview the build locally before deploying |

Or via mise from the repo root:

| Command                            | Action               |
| :--------------------------------- | :------------------- |
| `mise run //websites/docs:install` | Install dependencies |
| `mise run //websites/docs:build`   | Build the site       |
| `mise run //websites/docs:dev`     | Start dev server     |
