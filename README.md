# Alumnium

Pave the way towards AI-powered test automation.

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

To run Pytest test use the following command:

```
poetry run pytest
```

To change what model is being used, use `ALUMNIUM_MODEL` variable (one of `openai`, `google` or `anthropic`):

```
ALUMNIUM_MODEL=google poetry run pytest
```
