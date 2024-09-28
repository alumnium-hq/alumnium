# Alumnium

Pave the way towards AI-powered test automation.

## Development

Setup the project:

```bash
python -m venv .venv
source .venv/bin/activate # .fish
pip install -r requirements.txt
```

Configure access to AI providers:

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
export OPENAI_API_KEY="sk-proj-..."
export GOOGLE_API_KEY="..."
```

To run REPL for demo, use the following command:

```
python -i demo.py
```

To run Cucumber examples, use the following command:

```
behave
```

To run Pytest test use the following command:

```
pytest
```
