<h1>
    <img src="https://github.com/user-attachments/assets/44e63cc3-d0e8-4b79-bfc1-015ce91a92f7" height="48px" />
    <sup>Alumnium</sup>
</h1>

_Pave the way towards AI-powered test automation._

Aluminum is an experimental project that builds upon the existing test automation ecosystem, offering a higher-level abstraction for testing. It aims to simplify interactions with web pages and provide more robust mechanisms for verifying assertions.

Currently in the very early stages of development and not recommended for production use.

## Installation

```bash
pip install alumnium
```

## Configure AI Provider

Alumnium uses OpenAI by default, but you can change it by following the steps below.

_At the moment of writing, Google AI Studio provides free access to its models, so you can use it for playing around with Alumnium._

### OpenAI (GPT-4o-mini)

1. Get the API key from [OpenAI][1].
2. Give Alumnium access to the API.

```bash
export OPENAI_API_KEY="sk-proj-..."
```

### Anthropic (Claude 3 Haiku)

1. Get the API key from [Anthropic][2].
2. Tell Alumnium to use Claude and provide access.

```bash
export ALUMNIUM_MODEL="anthropic"
export ANTHROPIC_API_KEY="sk-ant-..."
```

### Google (Gemini 1.5 Flash)

1. Get the API key from [Google AI Studio][3].
2. Tell Alumnium to use Gemini and provide access.

```bash
export ALUMNIUM_MODEL="google"
export GOOGLE_API_KEY="..."
```

## Run Script

Start Alumnium using your Selenium driver and begin interacting with the webpage and check assertions.

```python
from alumnium import Alumni
from selenium.webdriver import Chrome

driver = Chrome()
driver.get("https://google.com")

al = Alumni(driver)
al.do("search for selenium")
al.check("selenium in page title")
al.check("selenium.dev is present in the search results")
```

Check out more [examples][4]!

## To Do

- Cross-browser support (currently only Chrome and Edge are working).
- Mobile applications support via Appium.
- Playwright support.
- Open LLMs support (currently only Anthropic, Google and OpenAI are proven to work).
- Automatic handling of flakiness.
- Improved caching for faster performance.
- High-level multi-step instructions and verifications (currently the instructions must be very concrete).
- Other languages support (C#, Java, JavaScript, Ruby, etc.)

## Environment Variables

### `ALUMNIUM_DEBUG`

Set to `1` to enable debug logs and print them to stdout.

### `ALUMNIUM_MODEL`

Select AI provider to use. Supported values are:

- `anthropic`
- `azure_openai`
- `google`
- `openai`

## Development

Setup the project:

```bash
pipx install poetry
poetry install
```

Configure access to AI providers:

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
export OPENAI_API_KEY="sk-proj-..."
export GOOGLE_API_KEY="..."
```

To run REPL for demo, use the following command:

```
poetry run python -i demo.py
```

To run Cucumber examples, use the following command:

```
poetry run behave
```

To run the Pytest test use the following command:

```
poetry run pytest
```




[1]: https://help.openai.com/en/articles/4936850-where-do-i-find-my-openai-api-key
[2]: https://docs.anthropic.com/en/api/getting-started
[3]: https://aistudio.google.com/app/apikey
[4]: examples/
