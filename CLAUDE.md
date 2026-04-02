# Alumnium

## Overview

AI-powered test automation framework using natural language commands. Wraps Appium, Playwright, and Selenium. Experimental/early development.

**Monorepo structure**:
- `packages/typescript/` - Primary implementation + MCP and AI servers
- `packages/python/` - Client implementation

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
- `tools/` - Available actions (`ClickTool`, `TypeTool`, etc.)
- `server/agents/` - AI agents with provider-specific prompts (Python only)

## Development

### Common commands

```bash
# Root
mise :install                         # or cd packages/{python,typescript} and install separately
mise :format                          # Format code
mise :types                           # Check types
mise :lint                            # Run linter
mise :test/unit                       # Run unit tests
mise :test/system                     # Run all system tests

# Python
cd packages/python
mise :build                           # Build
mise :format                          # Format code
mise :types                           # Check types
mise :lint                            # Run linter
mise :test/unit                       # Run unit tests
TEST_ONLY=behave mise :test/system    # Run BDD system tests
TEST_ONLY=pytest mise :test/system    # Run Pytest system tests
mise :test/system:playwright          # Run Playwright system tests
mise :test/system:selenium            # Run Selenium system tests
mise :test/system:appium-ios          # Run Appium iOS system tests
mise :test/system:appium-android      # Run Appium Android system tests

# TypeScript
cd packages/typescript
mise :build                           # Build
mise :format                          # Format code
mise :types                           # Check types
mise :lint                            # Run linter
mise :test/unit                       # Run unit tests
mise :test/system:playwright          # Run Playwright system tests
mise :test/system:selenium            # Run Selenium system tests
mise :test/system:appium-ios          # Run Appium iOS system tests
mise :test/system:appium-android      # Run Appium Android system tests
mise :dev/mcp                         # Start Alumnium MCP
mise :dev/server                      # Start Alumnium server
```

## Best Practices

1. **Read files before editing**: Understand current implementation
2. **Match existing patterns**: Keep architecture consistent
3. **Update both languages**: Maintain API parity between Python/TypeScript
