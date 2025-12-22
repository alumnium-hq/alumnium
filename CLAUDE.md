# Alumnium

## Overview

AI-powered test automation framework using natural language commands. Wraps Appium, Playwright, and Selenium. Experimental/early development.

**Monorepo structure**:
- `packages/python/` - Primary implementation + AI server
- `packages/typescript/` - Client implementation

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
make install                      # or cd packages/{python,typescript} and install separately
make test                         # Python tests
make format                       # Format both

# Python
cd packages/python
poetry poe test                   # Run unit tests
poetry poe format                 # Format
poetry run behave                 # Run example BDD tests
poetry run pytest examples/       # Run example Pytest tests, use ALUMNIUM_DRIVER variable to switch drivers
poetry run alumnium-mcp           # Start Alumnium MCP
poetry run alumnium-server        # Start Alumnium server

# TypeScript
cd packages/typescript
npm run build                     # Build
npm run examples                  # Run tests
npm run format                    # Format
npm run examples:appium           # Run Appium example tests
npm run examples:playwright       # Run Playwright example tests
npm run examples:selenium         # Run Selenium example tests
```

## Best Practices

1. **Read files before editing** - Understand current implementation
2. **Match existing patterns** - Keep architecture consistent
3. **Update both languages** - Maintain API parity between Python/TypeScript
