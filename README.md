<h1>
    <p align="center">
        <img src="https://github.com/user-attachments/assets/44e63cc3-d0e8-4b79-bfc1-015ce91a92f7" height="128" alt="Logo" />
        <br />
        Alumnium
    </p>
</h1>
<p align="center">
    Pave the way towards AI-powered test automation.
    <br />
    <a href="#installation">Installation</a>
    ·
    <a href="#quick-start">Quick Start</a>
    ·
    <a href="https://alumnium.ai/docs/">Documentation</a>
</p>

Alumnium is an experimental project that builds upon the existing test automation ecosystem, offering a higher-level abstraction for testing. It aims to simplify interactions with web pages and provide more robust mechanisms for verifying assertions.

<img src="https://raw.githubusercontent.com/alumnium-hq/alumnium.github.io/ccc7886dcf325d7b34d349facec7393d18812054/src/assets/overview.gif" height="auto" width="620px" />

Currently in the very early stages of development and not recommended for production use.

## Installation

```bash
pip install alumnium
```

## Quick Start

```python
import os
from alumnium import Alumni
from selenium.webdriver import Chrome

os.environ["OPENAI_API_KEY"] = "..."

driver = Chrome()
driver.get("https://google.com")

al = Alumni(driver)
al.do("search for selenium")
al.check("selenium in page title")
al.check("selenium.dev is present in the search results")
```

Check out [documentation][1] and more [examples][2]!

## Development

Setup the project:

```bash
pipx install poetry
poetry install
```

Configure access to [AI providers][3] and start hacking!

Useful commands during development:

```bash
poetry run python -i demo.py  # run REPL
poetry run behave             # run Gherkin examples
poetry run pytest             # run Pytest examples
```



[1]: https://alumnium.ai/docs/
[2]: examples/
[3]: https://alumnium.ai/docs/getting-started/configuration/
