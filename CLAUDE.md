# Alumnium

## Overview

AI-powered test automation framework using natural language commands. Wraps Appium, Playwright, and Selenium. Experimental/early development.

**Monorepo structure**:

- `packages/java/` - Java client implementation
- `packages/python/` - Python client implementation
- `packages/typescript/` - TypeScript core implementation (agents, server, MCP) and client

## Key Architecture

**Alumni Class**: Main entry point with API: `do()`, `check()`, `get()`, `find()`

**Core flow**:

1. User calls `al.do("click login button")`
2. **PlannerAgent** breaks goal into steps
3. **ActorAgent** converts steps to tool calls
4. **Tools** execute actions via **Drivers**
5. **Drivers** abstract platform differences (Selenium/Playwright/Appium)
6. **Accessibility Trees** provide platform-agnostic UI representation

**Key directories**:

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
