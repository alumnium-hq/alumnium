---
title: Overview
description: Learn how to use Alumnium's MCP server to enable general-purpose AI agents to automate web and mobile applications.
---

Alumnium's [Model Context Protocol][1] server enables general-purpose AI agents like Claude Code to leverage Alumnium's web and mobile automation capabilities through the standardized Model Context Protocol. This integration allows AI assistants to control browsers and mobile applications directly.

## Execution Modes

Choose the mode based on which agent should decide how to interact with the application:

| Mode                                             | How it works                                                                                                           | Model setup                                                            |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| [Agentic Mode](/docs/mcp/agentic-mode) (default) | Give Alumnium natural language goals through `do`, `get`, `check`, and `wait`. Alumnium uses an LLM to carry them out. | [Configure an AI provider for Alumnium][4].                                 |
| [Direct Mode](/docs/mcp/direct-mode)             | Your coding agent reads the accessibility tree and calls individual driver actions.                                    | Alumnium does not initialize an LLM and requires no model credentials. |

Select a mode with `--mode agentic` or `--mode direct`, or set `ALUMNIUM_MCP_MODE` to `agentic` or `direct`.

## Installation

The MCP Server is available as a standalone binary, along with being bundled into client libraries.

### Binary (preferred)

On Linux/macOS, use the shell installer:

```bash
curl -LsSf https://alumnium.ai/install.sh | sh
```

On Windows, use the PowerShell installer:

```pwsh
irm https://alumnium.ai/install.ps1 | iex
```

### Client Libraries

If you already use Alumnium via a client library in Java, Python, or TypeScript, you can run the bundled binary via the respectve package manager. Follow the [installation instructions][14] for your programming language.

## Setup

:::note
The setup below uses agentic mode. For direct mode, append `--mode direct` to arguments and remove API key variable.
:::

:::note
In agentic mode, the MCP server must be configured to use an AI provider. Follow [configuration guide][4] to learn about environment variables and setup for various AI providers. The examples below use OpenAI by default.
:::

### Claude Code

```bash
claude mcp add alumnium --env OPENAI_API_KEY=... -- alumnium mcp
```

### Codex

```bash
codex mcp add alumnium --env OPENAI_API_KEY=... -- alumnium mcp
```

:::tip[Reuse your Codex subscription]
If you're already signed in to the [Codex CLI][10], you can drop `OPENAI_API_KEY` and let Alumnium reuse your ChatGPT Plus/Pro OAuth tokens instead. See the [Codex configuration][11] for details.

```bash
codex mcp add alumnium --env ALUMNIUM_MODEL=codex -- alumnium mcp
```

:::

### Cursor

Add the following to `mcp.json`:

```json
{
  "mcpServers": {
    "alumnium": {
      "command": "alumnium",
      "args": ["mcp"],
      "env": {
        "OPENAI_API_KEY": "..."
      }
    }
  }
}
```

### Grok Build

```bash
grok mcp add alumnium --env OPENAI_API_KEY=... -- alumnium mcp
```

### Visual Studio Code

```bash
code --add-mcp '{
    "name": "alumnium",
    "command": "alumnium",
    "args": ["mcp"],
    "env": {
      "OPENAI_API_KEY": "..."
    }
  }'
```

## Session Management

### `start`

Both modes use `start` to initialize a browser or mobile driver session and return its session `id`. Pass capabilities as an inline JSON string or a path to a JSON file. Supports all drivers: Appium, Selenium, or Playwright.

#### `platformName`

Selects the driver to use. Supported values are `chrome`, `ios`, and `android`. Case-insensitive.

#### `alumnium:options`

Pass `alumnium:options` in capabilities to configure Alumnium and driver behavior for the session:

```json
{
  "platformName": "chrome",
  "alumnium:options": {
    "autoswitchToNewTab": false,
    "baseUrl": "https://example.com",
    "changeAnalysis": true,
    "cookies": [
      {
        "name": "session",
        "value": "abc123",
        "domain": ".example.com"
      }
    ],
    "excludeAttributes": ["url"],
    "executablePath": "/Applications/Arc.app/Contents/MacOS/Arc",
    "headers": {
      "Authorization": "Bearer token",
      ".example.com": {
        "X-Feature": "on"
      }
    },
    "headless": true,
    "planner": false,
    "profile": "work"
  }
}
```

| Option                    | Description                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `autoswitchContexts`      | Automatically switch between native and web contexts after interactions. Appium only. Default is `true`.                                                                                                                                                                                                                                                        |
| `autoswitchToNewTab`      | Automatically switch focus to newly opened tabs. Selenium and Playwright only. Default is `true`.                                                                                                                                                                                                                                                               |
| `baseUrl`                 | URL to navigate to when the session starts.                                                                                                                                                                                                                                                                                                                     |
| `changeAnalysis`          | Enable UI changes analysis after each `do()` call. Default is `true`.                                                                                                                                                                                                                                                                                           |
| `cookies`                 | Pre-defined cookies to set before the session starts. Selenium and Playwright only.                                                                                                                                                                                                                                                                             |
| `delay`                   | Seconds to wait after each interaction. Appium only. Default is `0`.                                                                                                                                                                                                                                                                                            |
| `excludeAttributes`       | Array of accessibility tree attributes to exclude. Reduces tree size on large pages.                                                                                                                                                                                                                                                                            |
| `executablePath`          | Path to a custom Chrome/Chromium executable (e.g. Arc, Brave). Selenium and Playwright only.                                                                                                                                                                                                                                                                    |
| `fullPageScreenshot`      | Capture full-page screenshots instead of viewport-only. Default is `false`.                                                                                                                                                                                                                                                                                     |
| `headers`                 | Custom HTTP headers. A string value is sent with every request (Selenium and Playwright). An object value is sent only to hosts matching the key, e.g. `".example.com"` for the domain and its subdomains or `"app.example.com"` for one host (Playwright only). Scope headers when the page embeds third-party origins whose CORS preflight would reject them. |
| `headless`                | Run browser in headless mode. Selenium and Playwright only. Default is `false`.                                                                                                                                                                                                                                                                                 |
| `hideKeyboardAfterTyping` | Dismiss the on-screen keyboard after typing. Appium only. Default is `false`.                                                                                                                                                                                                                                                                                   |
| `permissions`             | Browser permissions to grant (e.g. `["geolocation"]`). Playwright only.                                                                                                                                                                                                                                                                                         |
| `planner`                 | Enable or disable the planning step in `do()`. Default is `true`.                                                                                                                                                                                                                                                                                               |
| `profile`                 | Name of a persistent browser profile; cookies, sessions, and storage are preserved across restarts in `~/.alumnium/profiles/{name}`. Selenium and Playwright only.                                                                                                                                                                                              |
| `userAgent`               | Custom User-Agent string sent with every request. Playwright only.                                                                                                                                                                                                                                                                                              |

#### `appium:settings`

For iOS and Android sessions, pass `appium:settings` in capabilities to configure [Appium settings][9] that are applied to the driver after it is created:

```json
{
  "platformName": "ios",
  "appium:settings": {
    "allowInvisibleElements": true,
    "ignoreUnimportantViews": true
  }
}
```

Pass the returned `id` to subsequent tools. Use separate sessions to target Chrome, iOS, or Android, and call `stop` when finished. The `planner` and `changeAnalysis` options apply to agentic mode.

### `stop`

Stop a running browser or mobile session and clean up its driver resources. Pass the session `id` returned by `start`. The tool returns the path to the artifacts directory and token usage statistics for the session. Set `save_cache` to `true` to save the execution [cache][5] before stopping; it defaults to `false`.

[1]: https://modelcontextprotocol.io
[2]: https://docs.astral.sh/uv/
[3]: https://docs.astral.sh/uv/getting-started/installation/
[4]: /docs/getting-started/configuration
[5]: /docs/guides/caching
[6]: /docs/guides/actions
[7]: /docs/guides/verifications
[8]: /docs/guides/retrievals
[9]: https://appium.io/docs/en/2.0/guides/settings/
[10]: https://github.com/openai/codex
[11]: /docs/getting-started/configuration#codex
[12]: https://cursor.com/docs/cloud-agent
[13]: /docs/getting-started/configuration#cursor
[14]: /docs/getting-started/installation/
