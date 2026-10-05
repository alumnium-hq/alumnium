---
name: alumnium-cli
description: Drive a browser or mobile app with natural language from the shell using `alumnium cli` (start a session, do, check, get, wait, fetch-accessibility-tree, stop). Use when testing or exploring a web/mobile app without the Alumnium MCP server.
---

# Alumnium CLI

`alumnium cli` keeps one browser or mobile app session running in the background, and each command acts on it. Output is JSON (the accessibility tree is XML). Exit code `0` means success; `1` means an error or a failed `check`.

## Workflow

```sh
npx alumnium cli start                                   # Chrome by default
npx alumnium cli do "navigate to https://example.com"
npx alumnium cli check "page shows Example Domain"       # exit 1 if false
npx alumnium cli get "page title"
npx alumnium cli stop --save-cache                       # always stop when done
```

## Commands

| Command                                                    | Purpose                                                                                                                                 |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `start [--capabilities <json\|file>] [--server-url <url>]` | Start a session. Capabilities use the MCP `start` format, e.g. `'{"platformName":"ios","alumnium:options":{"app":"com.example.app"}}'`. |
| `do <goal>`                                                | Perform a goal on the current page/screen.                                                                                              |
| `check <statement> [--vision]`                             | Verify a statement; prints `{"result":"success"\|"failure","explanation":…}`.                                                           |
| `get <data> [--vision]`                                    | Extract data.                                                                                                                           |
| `wait <seconds\|condition> [--timeout <s>]`                | Wait 1-30 seconds or until a condition holds.                                                                                           |
| `fetch-accessibility-tree`                                 | Print the current accessibility tree (for debugging).                                                                                   |
| `stop [--save-cache]`                                      | Stop the session; prints the artifacts dir with screenshots, trace and video.                                                           |
| `list`                                                     | List sessions and their status.                                                                                                         |

## Rules

- Run `start` before anything else. Errors tell you exactly which command to run.
- Keep each `do` to the current page. For multi-page flows, issue one `do` per page.
- Use `check` exit codes to verify outcomes instead of parsing explanations.
- Always `stop` when finished. Idle sessions stop after `ALUMNIUM_CLI_IDLE_TIMEOUT` seconds (default 3600).
- Use `-s <name>` (or `ALUMNIUM_CLI_SESSION`) to run several sessions at once, e.g. web and mobile.
- If `start` fails, the error includes the daemon log, which is also at `.alumnium/cli/<session>.log`.
