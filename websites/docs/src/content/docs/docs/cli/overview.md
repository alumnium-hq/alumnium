---
title: CLI
description: Drive a persistent Alumnium session from the shell with `alumnium cli`.
---

`alumnium cli` runs one Alumnium session (a browser or mobile app) in a background process and lets you, or your coding agent, control it one shell command at a time. It uses the same tools as the [MCP server](/docs/mcp/overview), without needing an MCP client.

## Usage

```sh
npx alumnium cli start
npx alumnium cli do "navigate to https://example.com"
npx alumnium cli check "page shows Example Domain"
npx alumnium cli check "logo is shown" --vision
npx alumnium cli get "page title"
npx alumnium cli fetch-accessibility-tree
npx alumnium cli stop --save-cache
```

Configure an [AI provider](/docs/getting-started/configuration) first.

Chrome runs on Selenium by default. Set `ALUMNIUM_DRIVER=playwright` before `start` to use Playwright.

## Commands

| Command | Description |
| --- | --- |
| `start [--capabilities <json\|file>] [--server-url <url>]` | Start a session. Capabilities default to `{"platformName":"chrome"}` and accept the same options as the MCP [`start`](/docs/mcp/overview#start) tool. |
| `do <goal>` | Execute a goal on the current page. |
| `check <statement> [--vision]` | Verify a statement. Exits with code `1` when it is false. |
| `get <data> [--vision]` | Extract data from the page. |
| `wait <seconds\|condition> [--timeout <seconds>]` | Wait for 1-30 seconds or until a condition is met. Exits with code `0` even on timeout; check `status` (`met` or `timeout`) in the output. |
| `fetch-accessibility-tree` | Print the accessibility tree. |
| `stop [--save-cache]` | Stop the session and print the artifacts directory. |
| `list` | List sessions and their status. |

Output is printed as JSON (XML for the accessibility tree). Errors are printed to stderr and exit with code `1`.

## Sessions

Every command accepts `-s, --session <name>` (default: [`ALUMNIUM_CLI_SESSION`](/docs/reference#alumnium_cli_session) or `default`), so several sessions can run side by side. Session names are 1-24 letters, digits, `_` or `-`. Numeric names passed to `-s` are read as numbers, so `-s 007` selects session `7`; start names with a letter to avoid this. Sessions are tracked per project in `.alumnium/cli/` (under [`ALUMNIUM_STORE_DIR`](/docs/reference#alumnium_store_dir)), where `<session>.log` holds the background process output. Sessions stop automatically after [`ALUMNIUM_CLI_IDLE_TIMEOUT`](/docs/reference#alumnium_cli_idle_timeout) seconds without commands.

## Agent skill

The npm package ships an agent skill at `node_modules/alumnium/skills/alumnium-cli/SKILL.md`. Copy it to `.claude/skills/alumnium-cli/` (or your agent's skills directory) to teach your agent how to use the CLI.
