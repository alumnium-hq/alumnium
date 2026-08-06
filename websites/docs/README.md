# Alumnium website

The Alumnium documentation website, built with [Astro](https://astro.build) and [Starlight](https://starlight.astro.build). Deployed to [Cloudflare Workers](https://workers.cloudflare.com/) at [alumnium.ai](https://alumnium.ai).

## Content

- **Landing page** — marketing overview with feature highlights, integration demos, and blog
- **Docs** — Getting Started, Writing First Test (Appium/Playwright/Selenium), Guides (Actions, Verifications, Retrievals, Elements, Areas, Caching, Self-hosting LLMs, MCP), and API Reference

Content lives in `src/content/docs/` as `.md`/`.mdx` files. Blog posts are in `src/content/blog/`.

## Commands

| Command                             | Action                                          |
| :---------------------------------- | :---------------------------------------------- |
| `bun install`                       | Install dependencies                            |
| `bun run astro dev`                 | Start the Workers development server            |
| `bun run astro build`               | Build the production site                       |
| `bun run astro preview`             | Preview a production build with Workers runtime |
| `bun run wrangler deploy`           | Deploy the current build                        |
| `bun run wrangler deploy --dry-run` | Validate a deployment without uploading it      |

Or via mise from the repo root:

| Command                                   | Action                         |
| :---------------------------------------- | :----------------------------- |
| `mise run //websites/docs:install`        | Install dependencies           |
| `mise run //websites/docs:build`          | Build the site                 |
| `mise run //websites/docs:dev`            | Start the Workers dev server   |
| `mise run //websites/docs:preview`        | Build and preview locally      |
| `mise run //websites/docs:deploy`         | Build and deploy to Cloudflare |
| `mise run //websites/docs:deploy:dry-run` | Validate the deployment        |

## Rendering

Pages and endpoints are prerendered by default. Routes that need the Workers runtime, such as third-party API proxies, can opt into on-demand rendering:

```ts
export const prerender = false;
```

## Deployment

Local deployment requires authentication from `wrangler login`. The release workflow deploys through Wrangler and requires these GitHub Actions secrets:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`

The API token must have permission to edit Workers and the `alumnium.ai` zone must be managed by the configured Cloudflare account.

## Assets

Along with [the custom assets](../../assets/README.md), the website uses the following third-party assets:

- [Devicon](https://devicon.dev/), installed via `devicon` npm package.
- [Material Symbols](https://fonts.google.com/icons?icon.set=Material+Symbols), installed via `@material-symbols/svg-*` npm packages.
- [Font Awesome Free](https://fontawesome.com/search?ic=free-collection), installed via `@fortawesome/fontawesome-free` npm package.

Use [`Icon`](./src/components/Icon.astro) component to render icons from these libraries.

When adding new icons, make sure to add the `id` to the corresponding `import.meta.glob` pattern in `./src/components/Icon.astro`, so Astro can include the icon in the build.
