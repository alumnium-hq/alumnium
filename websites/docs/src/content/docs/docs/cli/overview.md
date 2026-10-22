---
title: CLI
description: Drive a persistent Alumnium session from the shell with `alumnium cli`.
---

`alumnium cli` runs one Alumnium session (a browser or mobile app) in a background process and lets you, or your coding agent, control it one shell command at a time. It uses the same tools as the [MCP server](/docs/mcp/overview) in agentic mode, without needing an MCP client. Because Alumnium carries out your goals with an LLM, it requires an [AI provider][1].

## Installation

The CLI is part of the Alumnium binary and the TypeScript package.

### Binary (preferred)

On Linux/macOS, use the shell installer:

```bash
curl -LsSf https://alumnium.ai/install.sh | sh
```

On Windows, use the PowerShell installer:

```pwsh
irm https://alumnium.ai/install.ps1 | iex
```

### npx

To skip the installation, prefix every command with `npx`, e.g. `npx alumnium cli start`.

## Quick Start

Configure an [AI provider][1], then:

```bash
alumnium cli start
alumnium cli do "navigate to https://example.com"
alumnium cli check "page shows Example Domain"
alumnium cli get "page title"
alumnium cli stop
```

`start` launches Chrome by default. Always call `stop` when you are done, otherwise the session stays open until the [idle timeout](#sessions) stops it.

## Agent Setup

The package ships an agent skill that teaches your coding agent how to use the CLI. Copy it to your agent's skills directory, e.g. for Claude Code:

```bash
mkdir -p .claude/skills
cp -r node_modules/alumnium/skills/alumnium-cli .claude/skills/
```

Then ask your agent to test your app, e.g. "Use alumnium cli to check that the login page loads". If you installed the binary instead of the npm package, take the skill from the [repository][2].

## Starting a Session

`start` accepts capabilities as an inline JSON string or a path to a JSON file. They default to `{"platformName":"chrome"}`. Wrap inline JSON in single quotes so the shell keeps the double quotes.

```bash
# Chrome with Alumnium options
alumnium cli start --capabilities '{
  "platformName": "chrome",
  "alumnium:options": {"headless": true, "baseUrl": "https://example.com"}
}'

# iOS app on a simulator
alumnium cli start --capabilities '{
  "platformName": "ios",
  "alumnium:options": {"app": "com.example.app", "device": "iPhone 16"}
}'

# Capabilities from a file, on a remote Appium server
alumnium cli start --capabilities ./capabilities.json --server-url http://localhost:4723
```

The capabilities format is the same as for the MCP [`start`](/docs/mcp/overview#start) tool. See its [`alumnium:options`](/docs/mcp/overview#alumniumoptions) reference for all options.

### Drivers

| Platform | Drivers                          | How to select                                        |
| -------- | -------------------------------- | ---------------------------------------------------- |
| Chrome   | Selenium (default), Playwright   | `ALUMNIUM_DRIVER=playwright`                         |
| iOS      | Appium (default), Maestro, Xcode | `ALUMNIUM_DRIVER=maestro` or `ALUMNIUM_DRIVER=xcode` |
| Android  | Appium (default), Maestro        | `ALUMNIUM_DRIVER=maestro`                            |

Set `ALUMNIUM_DRIVER` before `start`.

## Commands

| Command                                                    | Description                                                                                                                                           |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `start [--capabilities <json\|file>] [--server-url <url>]` | Start a session and print its `id`, driver, model and platform.                                                                                       |
| `do <goal>`                                                | Execute a goal on the current page.                                                                                                                   |
| `check <statement> [--vision]`                             | Verify a statement. Prints `result` (`success` or `failure`) and an explanation.                                                                      |
| `get <data> [--vision]`                                    | Extract data from the page.                                                                                                                           |
| `wait <seconds\|condition> [--timeout <seconds>]`          | Wait for 1-30 seconds or until a condition is met. Prints `status` (`met` or `timeout`).                                                              |
| `fetch-accessibility-tree`                                 | Print the accessibility tree.                                                                                                                         |
| `stop [--save-cache]`                                      | Stop the session and print the artifacts directory (screenshots; with Playwright also a trace and a video unless `ALUMNIUM_MCP_RECORD_VIDEOS=false`). |
| `list`                                                     | List sessions and their status.                                                                                                                       |

`start` waits up to [`ALUMNIUM_CLI_START_TIMEOUT`](/docs/reference#alumnium_cli_start_timeout) seconds for the session to come up, which matters on a slow first start. `--vision` makes `check` and `get` use a screenshot. `--save-cache` saves the execution [cache][3] before stopping.

## Output and Exit Codes

Commands print JSON to stdout, except `fetch-accessibility-tree`, which prints XML.

| Situation                         | Exit code | Output                                       |
| --------------------------------- | --------- | -------------------------------------------- |
| Command succeeded                 | `0`       | Result on stdout                             |
| `check` statement is false        | `1`       | `{"result": "failure", ...}` on stdout       |
| `wait` condition timed out        | `0`       | `{"status": "timeout", ...}`, check `status` |
| Any error (bad input, no session) | `1`       | Message on stderr                            |

Use the `check` exit code to gate scripts instead of parsing the explanation.

## Sessions

Every command accepts `-s, --session <name>`, so several sessions can run side by side, e.g. web and mobile:

```bash
alumnium cli -s web start
alumnium cli -s ios start --capabilities '{"platformName":"ios","alumnium:options":{"app":"com.example.app"}}'
alumnium cli -s web do "navigate to https://example.com"
alumnium cli list
```

- **Naming.** The default is [`ALUMNIUM_CLI_SESSION`](/docs/reference#alumnium_cli_session) or `default`. Names are 1-24 letters, digits, `_` or `-`. Numeric names passed to `-s` are read as numbers, so `-s 007` selects session `7`; start names with a letter.
- **State.** Sessions are tracked per working directory in `.alumnium/cli/` (under [`ALUMNIUM_STORE_DIR`](/docs/reference#alumnium_store_dir)). `<session>.log` holds the background process output.
- **Idle timeout.** Sessions stop automatically after [`ALUMNIUM_CLI_IDLE_TIMEOUT`](/docs/reference#alumnium_cli_idle_timeout) seconds without commands.
- **Working directory.** Run commands from the same directory, or set an absolute `ALUMNIUM_STORE_DIR`. After a `cd`, sessions started elsewhere are reported as not running.

## Troubleshooting

- **`start` fails.** The error ends with the tail of the session log. The full log is at `.alumnium/cli/<session>.log`.
- **`Invalid JSON in capabilities`.** The shell removed the quotes. Wrap the JSON in single quotes, or pass a file path. Task runners such as `mise` can re-parse arguments and strip the quotes; call `alumnium` directly.
- **`start` times out on the first run.** Raise `ALUMNIUM_CLI_START_TIMEOUT`.
- **Session reported as not running after `cd`.** Return to the directory you started it in.
- **Browser left open.** Run `alumnium cli list`, then `alumnium cli -s <name> stop`.

[1]: /docs/getting-started/configuration
[2]: https://github.com/alumnium-hq/alumnium/tree/main/packages/typescript/alumnium/skills/alumnium-cli
[3]: /docs/guides/caching
