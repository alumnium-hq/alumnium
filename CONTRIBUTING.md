# Contributing to Alumnium

## Welcome

Thank you for your interest in contributing to Alumnium!

Alumnium is an experimental AI-powered test automation solution that aims to simplify test interactions and assertions. Your contributions can help improve this project.

## Project Understanding

Before contributing, please review:

- Our [README][1] and [documentation][2] to understand Alumnium's vision of creating higher-level abstractions for test automation that simplify web page interactions and strengthen assertion mechanisms.
- Our experimental status - we're in early development and value innovative approaches.
- The core functionality that uses natural language processing to interpret testing commands.

## Monorepo Structure

Alumnium is organized as a monorepo with two main packages:

- **`packages/python/`** - Core Python implementation and AI server
- **`packages/typescript/`** - TypeScript client implementation

Both packages share the same API and can be developed independently or together.

## Finding Your Contribution Opportunity

- Explore the [open issues][3] to find tasks matching your interests
- We will be glad if you help us with:
  - Improving test coverage for edge cases.
  - Enhancing documentation and examples.
  - Exploring more natural language prompts for test generation.
  - Reporting usability issues or unexpected test behavior.
  - Creating sample projects using Alumnium.

## Contribution Workflow

### 1. Environment Setup

```bash
# Fork and clone the repository
git clone https://github.com/your-username/alumnium.git
cd alumnium
```

#### Python Package

```bash
cd packages/python
pipx install poetry
poetry install
```

#### TypeScript Package

```bash
cd packages/typescript
npm install
```

#### Both Packages (Monorepo Root)

```bash
# Install dependencies for both packages
make install
```

### 2. Configure AI Provider Access

Configure access to AI providers as mentioned in [docs][4].

### 3. Development Guidelines

When working on Alumnium:

- Follow the existing code style and patterns in each package.
- Ensure compatibility with Appium, Playwright, and Selenium.
- Document new functionality with clear examples.
- Test your changes thoroughly in the relevant package.

#### Python Development

```bash
cd packages/python

# Quick testing with REPL
poetry run python -i demo.py

# Run BDD examples
poetry run behave

# Run pytest examples
poetry run pytest examples/

# Run unit tests
poetry poe test

# Format code
poetry poe format
```

#### TypeScript Development

```bash
cd packages/typescript

# Build the package
npm run build

# Run all examples
npm run examples

# Run specific driver examples
npm run examples:selenium
npm run examples:playwright
npm run examples:appium

# Format code
npm run format
```

#### Monorepo Commands

From the root directory, you can use Make commands:

```bash
make format       # Format both packages
make test         # Run Python tests
make build        # Build both packages
make clean        # Clean both packages
make start-server # Start the Alumnium server
```

### 4. Environment Variables

For local development, you may need to configure the following environment variables:

| Variable Name          | Description                                          | Default Value             |
|------------------------|------------------------------------------------------|---------------------------|
| `ALUMNIUM_DRIVER`      | Driver to use for tests (selenium, playwright, appium) | `selenium`                |
| `ALUMNIUM_MODEL`       | AI model provider (anthropic, openai, google, etc.)  | `openai`                  |
| `ALUMNIUM_LOG_PATH`    | Path to the alumnium log directory                   | `stdout(logs to console)` |
| `ALUMNIUM_LOG_LEVEL`   | Log level or configuration value                     | `WARNING`                 |
| `ALUMNIUM_CACHE`       | Cache provider or disable it                         | `filesystem`              |

### 5. Pull Request Process

1. **Create a focused branch** for your contribution.
2. **Write meaningful commit messages** explaining your changes. We use [Conventional Commits][5] format.
3. **Include tests** that verify your contribution works as expected.
4. **Update documentation** if you're adding or changing features.
5. **Maintain API parity** - If adding features to one package, consider implementing in both Python and TypeScript.
6. **Submit your PR** with a clear description of what it accomplishes.

## AI-First Testing Philosophy

As contributors to an AI-powered testing tool, we value:

- **Natural language over rigid syntax** - Tests should be readable by non-technical stakeholders.
- **Adaptability over brittleness** - Tests should withstand UI changes.
- **Intent over implementation** - Focus on what should happen, not how it happens.
- **Context awareness** - Testing tools should understand the application under test.

## Community Guidelines

- Be respectful and constructive in all interactions. See [Code of Conduct][6] for more details.
- Share knowledge generously - we're all learning in this emerging field.
- Value diverse perspectives - they lead to more robust solutions.
- Ask questions when unclear - clarity benefits everyone.

## For First-Time Contributors

If you're new to open-source or AI-powered testing:

1. Try running the demo and experimenting with the Alumnium API. Use the REPL (`poetry run python -i demo.py`) to explore functionality.
2. Start with documentation improvements or simple bug fixes. Check out the [**good first issue**][7] label.
3. Ask questions on GitHub, [Discord][8] or [Slack][9].

## Recognition

All contributors will be acknowledged in our releases and documentation. As an experimental project on the cutting edge of testing technology, your contributions here represent pioneering work in the field.

---

Thank you for joining us in paving the road towards AI-powered test automation. Together, we can create more intuitive, maintainable, and powerful testing experiences.


[1]: https://github.com/alumnium-hq/alumnium?tab=readme-ov-file
[2]: https://alumnium.ai/docs/
[3]: https://github.com/alumnium-hq/alumnium/issues
[4]: https://alumnium.ai/docs/getting-started/configuration/
[5]: https://www.conventionalcommits.org/en/v1.0.0/
[6]: ./CODE_OF_CONDUCT.md
[7]: https://github.com/alumnium-hq/alumnium/issues?q=is%3Aissue%20state%3Aopen%20label%3A%22good%20first%20issue%22
[8]: https://discord.gg/45hYBf3U
[9]: https://seleniumhq.slack.com/channels/alumnium
