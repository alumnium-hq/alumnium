# Alumnium Gherkin Adapter

A self-contained [behave](https://behave.readthedocs.io/) integration that lets you write plain-English Gherkin feature files and drive Alumnium with **no hand-coded step definitions per scenario**.

Step text is forwarded verbatim to the LLM. The model interprets the instruction, plans browser actions, and executes them — or asserts the stated condition is true. You write the feature file; the model drives the browser.

---

## How it works

```
Feature file → behave → AlumniumGherkinAdapter → Alumni.do() / Alumni.check()
                                                        ↓
                                               LLM (Planner + Actor)
                                                        ↓
                                               Playwright / Chromium
```

### Keyword routing

| Keyword | Alumnium call | Notes |
|---|---|---|
| `Given` | `al.do(text)` | Setup / precondition |
| `When` | `al.do(text)` | User action |
| `Then` | `al.check(text)` | Assertion — raises `AssertionError` on failure |
| `And` / `But` | inherits previous | Same role as the preceding primary keyword |
| `*` | inherits previous | Bullet-point alternative to `And`/`But` |

### Navigation

Navigation is handled by the LLM via `NavigateToUrlTool`, enabled through
`Alumni(page, extra_tools=[NavigateToUrlTool])` in `environment.py`. Use a
standard Given step — no special step definition required:

```gherkin
Given navigate to "https://example.com"
```

---

## Prerequisites

- Python 3.9+
- Alumnium with a Playwright driver
- An AI model accessible via `ALUMNIUM_MODEL` (see [configuration](https://alumnium.ai/docs/getting-started/configuration/))
- Playwright browsers installed: `playwright install chromium`

---

## Running the example

```bash
# With a local Ollama model
ALUMNIUM_MODEL=ollama/mistral-small3.1:24b \
  poetry run behave examples/behave/gherkin_adapter/ --no-capture

# With OpenAI
ALUMNIUM_MODEL=openai/gpt-4o \
  poetry run behave examples/behave/gherkin_adapter/ --no-capture

# With Anthropic
ALUMNIUM_MODEL=anthropic/claude-3-5-sonnet-20241022 \
  poetry run behave examples/behave/gherkin_adapter/ --no-capture

# Dry-run — step matching only, no browser or LLM
poetry run behave examples/behave/gherkin_adapter/ --dry-run

# Single feature file
ALUMNIUM_MODEL=ollama/mistral-small3.1:24b \
  poetry run behave examples/behave/gherkin_adapter/features/saucedemo.feature --no-capture

# Scenarios matching a name pattern
ALUMNIUM_MODEL=ollama/mistral-small3.1:24b \
  poetry run behave examples/behave/gherkin_adapter/ --name "Standard user"
```

---

## Writing feature files

Place `.feature` files anywhere under `features/`. All Gherkin constructs are supported.

### Basic scenario

```gherkin
Feature: SauceDemo login

  Scenario: Standard user can log in and see inventory
    Given navigate to "https://www.saucedemo.com"
    When type "standard_user" into the username field
    And type "secret_sauce" into the password field
    And click the login button
    Then the page shows an inventory of products
```

Write step text as you would describe the action to a human. No regex, no glue code, no per-scenario step definition files to maintain.

### Doc Strings

Attach a triple-quoted block to give the LLM richer context:

```gherkin
Then the page shows a product catalogue
  """
  Expect at least 6 products, each with a name, price, and Add to cart button.
  """
```

### Data Tables

Attach a pipe-delimited table to supply structured input:

```gherkin
When fill in the login form with:
  | field    | value         |
  | username | standard_user |
  | password | secret_sauce  |
```

### Scenario Outline

Behave substitutes `<placeholder>` values before step functions are called — no adapter changes needed:

```gherkin
Scenario Outline: Multiple user types can log in
  Given navigate to "https://www.saucedemo.com"
  When type "<username>" into the username field
  And type "secret_sauce" into the password field
  And click the login button
  Then the page shows an inventory of products

  Examples: valid users
    | username      |
    | standard_user |
    | problem_user  |
```

### Background

`Background:` steps are transparently prepended to each scenario by behave — no special handling required:

```gherkin
Feature: Shopping cart

  Background:
    Given navigate to "https://www.saucedemo.com"
    When type "standard_user" into the username field
    And type "secret_sauce" into the password field
    And click the login button

  Scenario: Can add an item to the cart
    When click Add to cart on the first product
    Then the cart badge shows 1 item
```

---

## File structure

```
gherkin_adapter/
├── alumnium-gherkin.md          # this file
└── features/
    ├── environment.py           # Playwright lifecycle hooks
    ├── saucedemo.feature        # login scenarios (Scenario + Outline)
    ├── compliance.feature       # Doc Strings, Data Tables, * keyword
    └── steps/
        ├── adapter.py           # GherkinStep dataclass + AlumniumGherkinAdapter
        └── alumnium_steps.py    # generic catch-all step dispatcher
```

### `steps/adapter.py`

**`GherkinStep`** — immutable dataclass carrying step data:

| Field | Type | Purpose |
|---|---|---|
| `keyword` | `str` | `Given` / `When` / `Then` / `And` / `But` / `*` |
| `text` | `str` | Step text after the keyword |
| `doc_string` | `str \| None` | Triple-quoted block content |
| `data_table` | `Sequence[Sequence[str]] \| None` | Table rows as list-of-lists |
| `location` | `str \| None` | `"file:line"` for diagnostics |

**`AlumniumGherkinAdapter`** — routes steps to `Alumni`:

```python
adapter = AlumniumGherkinAdapter(
    al,
    include_doc_string=True,   # append doc string to LLM payload when present
    include_data_table=True,   # append table to LLM payload when present
)
adapter.dispatch(step)
```

---

## Contributor

[neuno.ai](https://neuno.ai)
