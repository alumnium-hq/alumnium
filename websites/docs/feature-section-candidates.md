# Homepage Feature Section Candidates

This is a review draft for the homepage features section. It is based on the blog posts in `websites/docs/src/content/blog/`, the docs in `websites/docs/src/content/docs/docs/`, existing homepage copy in `websites/docs/src/copy/landings.ts`, and a targeted source-code check for documented capabilities.

## Must

| Title | Short Description |
| --- | --- |
| MCP Server | Let Claude Code, Codex, Cursor, Gemini CLI, and VS Code drive web and mobile apps through the same high-level Alumnium tools. |
| Natural Language Actions | Write commands like `search for Mercury element` and let Alumnium decide which clicks, typing, keys, and waits are needed. |
| AI Checks | Verify application state with plain English assertions and get useful explanations when checks fail. |
| Data Retrieval | Extract numbers, strings, booleans, and lists from the app with `get()` and assert them in your existing test framework. |
| Web, iOS, and Android | Test Chromium browsers, iOS apps, and Android apps with the same AI-powered abstraction. |
| Selenium, Playwright, and Appium | Plug Alumnium into the automation stack you already use instead of replacing your tests or infrastructure. |
| TypeScript and Python Clients | Use idiomatic clients from npm or PyPI in existing JS/TS and Python test suites. |
| Small, Fast Models | Run on low-cost models like GPT-5 Nano, Gemini Flash Lite, Claude Haiku, Grok Fast, and local Qwen through Ollama. |
| Multi-Level Cache | Reuse LLM responses and element decisions across runs so successful tests become faster and cheaper over time. |
| State-of-the-Art Accuracy | Alumnium MCP with Claude Code reached 98.5% on WebVoyager while keeping browser work out of the main agent context. |

## Should

| Title | Short Description |
| --- | --- |
| Change Analysis | Return a concise summary of what changed after each action so coding agents stay focused without reading full page trees. |
| Element Finding | Locate UI elements by natural language and return native Selenium, Playwright, Appium, or WebdriverIO objects. |
| Area Focus | Scope actions, checks, retrievals, and element lookup to a specific area to improve accuracy and reduce token usage. |
| Vision Checks | Add screenshots only when the accessibility tree is not enough, such as checking visual style or spatial relationships. |
| Full-Page Screenshots | Capture the full page for vision-based checks and retrievals when viewport-only screenshots are too limited. |
| Frames Support | Work across same-origin and cross-origin iframes with a unified accessibility tree. |
| One Binary | Install a compact cross-platform binary that includes both HTTP and MCP servers without Docker as the default path. |
| OpenTelemetry | Trace sessions, driver calls, LLM calls, cache lookups, and logs with built-in OpenTelemetry support. |
| CI-Friendly Caching | Save and restore `.alumnium/cache` in CI to avoid unnecessary LLM calls and keep repeated runs affordable. |
| GitHub Models | Run AI-powered tests with GitHub Models, including free CI-friendly usage in GitHub Actions. |

## Could

| Title | Short Description |
| --- | --- |
| Codex Provider | Reuse a ChatGPT Plus or Pro subscription through Codex CLI OAuth instead of managing a separate API key. |
| Local Models | Keep test automation local with Ollama and Qwen for privacy, security, or cost-sensitive environments. |
| Self-Hosted Providers | Use AWS Bedrock, Azure OpenAI, or Azure AI Foundry when teams need managed or private model infrastructure. |
| Plannerless Mode | Skip the planner and let the actor reason directly, cutting many `do()` calls roughly in half. |
| Persistent Profiles | Reuse browser profiles across sessions to preserve cookies, sessions, and storage for agent workflows. |
| Automatic New Tab Handling | Switch to newly opened tabs automatically, or control tab navigation manually when needed. |
| Auto-Wait and Retries | Wait for documents, resources, DOM mutations, and XHR/fetch requests before acting, then retry transient failures. |
| File Uploads | Upload files from natural language actions in web tests. |
| Custom JavaScript | Enable JavaScript execution as an extra tool for cases where native browser control is still useful. |
| PDF Export | Save pages as PDF files with an extra tool when tests need document artifacts. |
| Slider Control | Set sliders to specific numeric values through a dedicated extra tool. |
| Wait Tool | Wait for a fixed duration or poll for a natural language condition until it becomes true. |

## Maybe

| Title | Short Description |
| --- | --- |
| Markdown Test Runner | Run Markdown tests locally or in CI without a coding agent once the preview runner becomes homepage-ready. |
| Record and Replay | Record tool calls and replay them with cache so passing tests can run with little to no token spend. |
| Self-Healing Tests | Let the runner adapt when UI changes and only fail when there is an actual product issue. |
| Cross-Platform Markdown Tests | Describe a flow once and run it across web, iOS, and Android from the same test file. |
| Agent SDK-Powered Runner | Match coding agent behavior by running tests through native agent SDKs. |
| Plugins and Skills | Future Claude Code, Codex, and agent-skill integrations could make setup even lighter than MCP. |
| Java Client | Mention once released; currently only signaled as upcoming in the v0.20 post. |

## Notes

The strongest homepage candidates are the ones already reflected in `landings.ts`: MCP, low-token execution, multi-platform support, model flexibility, cache, natural language tests, test runner, and SOTA benchmark proof.

Some entries are implementation-level and may work better as secondary bento cards than as primary homepage claims: custom JavaScript, PDF export, slider control, wait tool, automatic tab handling, and persistent profiles.

Runner-related items are marked as maybe because existing copy describes the runner as preview and the v0.20 post frames a full-featured runner as still being explored.
