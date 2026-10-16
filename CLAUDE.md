# Alumnium

## Overview

AI-powered test automation framework using natural language commands. Wraps Appium, Playwright, and Selenium. Experimental/early development.

**Monorepo structure**:

- `packages/java/` - Java client implementation
- `packages/python/` - Python client implementation
- `packages/typescript/` - TypeScript workspace: shared scripts, tests and tooling, plus npm packages in subdirectories:
  - `core/` (`@alumnium/core`) - `Alumni`, `Area`, clients, AI agents, prompts, caches, the `LlmFactory` provider registry, Env, telemetry, storage, accessibility trees, tools and the `BaseDriver` contract. No drivers or LLM provider SDKs; `ai` is an optional peer loaded lazily via `llm/loadAi.ts` when agents run. The main entry (`src/index.ts`) exports only the public API (`Alumni`, `Area`, `Cache`, `Model`, tools, etc.); everything other packages need (`Env`, `Logger`, `BaseDriver`, `LlmFactory`, utils) comes from `@alumnium/core/internal`, which the main entry re-exports from. Agent internals are exposed to private packages via `@alumnium/core/agents`, which isn't published
  - `playwright/`, `selenium/`, `appium/`, `maestro/`, `xcode/` (`@alumnium/<driver>`) - Drivers, each exporting an `Alumni` bound to its native driver
  - `openai/`, `anthropic/`, `google/`, `azure/`, `aws/`, `deepseek/`, `mistral/`, `xai/`, `openrouter/`, `ollama/`, `codex/`, `cursor/` (`@alumnium/<provider>`) - One package per LLM provider, registered with `LlmFactory` on import and depending on `ai`; shared helpers live in `core/src/llm/providerUtils.ts`
  - `telemetry/` (`@alumnium/telemetry`) - OpenTelemetry SDK and OTLP trace/log exporters, an optional peer of core loaded lazily via `core/src/telemetry/loadTelemetry.ts` when `ALUMNIUM_TRACE` is enabled
  - `server/`, `mcp/`, `cli/` - HTTP server, MCP server and CLI, only shipped inside the compiled `alumnium` binary (private)
  - `alumnium/` (`alumnium`) - Batteries-included package: all drivers and providers, `Alumni` accepting any native driver, and the `alumnium` bin

## Key Architecture

**Alumni Class**: Main entry point with API: `do()`, `check()`, `get()`, `find()`

**Core flow**:

1. User calls `al.do("click login button")`
2. **PlannerAgent** breaks goal into steps
3. **ActorAgent** converts steps to tool calls
4. **Tools** execute actions via **Drivers**
5. **Drivers** abstract platform differences (Selenium/Playwright/Appium)
6. **Accessibility Trees** provide platform-agnostic UI representation

**Key directories** (inside `packages/typescript/<package>/src/` for TypeScript):

- `accessibility/` - Platform-specific tree implementations (Chromium, XCUITest, UIAutomator2)
- `drivers/` - Driver wrappers (`SeleniumDriver`, `PlaywrightDriver`, `AppiumDriver`)
- `clients/` - `HttpClient` (communicates with server), `NativeClient` (Python only, runs agents locally)
- `server/agents/` - AI agents with provider-specific prompts (Python only)
- `tools/` - Available actions (`ClickTool`, `TypeTool`, etc.)

## Development

### Package commands

Each package (java, python, typescript) has development commands:

```bash
mise //packages/{package-name}:build                       # Build
mise //packages/{package-name}:format                      # Format code
mise //packages/{package-name}:types                       # Check types
mise //packages/{package-name}:lint                        # Run linter
mise //packages/{package-name}:test/unit                   # Run unit tests
mise //packages/{package-name}:test/system:appium-ios      # Run Appium iOS system tests
mise //packages/{package-name}:test/system:appium-android  # Run Appium Android system tests
mise //packages/{package-name}:test/system:maestro-ios     # Run Maestro iOS system tests
mise //packages/{package-name}:test/system:maestro-android # Run Maestro Android system tests
mise //packages/{package-name}:test/system:playwright      # Run Playwright system tests
mise //packages/{package-name}:test/system:selenium        # Run Selenium system tests
```

### Core Commands

TypeScript core provides extra commands:

```bash
mise //packages/typescript:eval        # Run agent evaluations
mise //packages/typescript:dev/mcp     # Start Alumnium MCP
mise //packages/typescript:dev/server  # Start Alumnium server
```

## Best Practices

1. **Read files before editing**: Understand current implementation
2. **Match existing patterns**: Keep architecture consistent
3. **Update both languages**: Maintain API parity between Python/TypeScript
4. **Respect TypeScript package boundaries**: Import other packages by name through their entries (`@alumnium/core` for public API, `@alumnium/core/internal` for everything else), never by relative path. Add new core modules to `core/src/internal.ts`, and to `core/src/index.ts` only if users need them. `scripts/build/npmPackages.ts` enforces forbidden imports and declared dependencies per package
