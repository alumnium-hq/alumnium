"""Behave lifecycle hooks for the Gherkin adapter example.

Set ALUMNIUM_MODEL before running:
    export ALUMNIUM_MODEL=ollama/mistral-small3.1:24b   # local Ollama
    export ALUMNIUM_MODEL=openai/gpt-4o                 # OpenAI
    export ALUMNIUM_MODEL=anthropic/claude-3-5-sonnet-20241022  # Anthropic

Run the example:
    ALUMNIUM_MODEL=ollama/mistral-small3.1:24b \\
        poetry run behave examples/behave/gherkin_adapter/ --no-capture
"""

import sys
from pathlib import Path

# Make adapter.py importable from environment.py (behave adds steps/ to sys.path
# when loading step files, but not when loading environment.py).
sys.path.insert(0, str(Path(__file__).parent / "steps"))

from adapter import AlumniumGherkinAdapter  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402

from alumnium import Alumni  # noqa: E402


def before_all(context):
    context._pw = sync_playwright().start()
    context._browser = context._pw.chromium.launch(headless=True)


def before_scenario(context, scenario):
    page = context._browser.new_page()
    context.al = Alumni(page)
    context.adapter = AlumniumGherkinAdapter(
        context.al,
        include_doc_string=True,
        include_data_table=True,
    )


def after_scenario(context, scenario):
    if scenario.status == "passed":
        try:
            context.al.cache.save()
        except FileNotFoundError:
            # filelock removes the lockfile on release; the manual unlink in
            # FilesystemCache.save() may then raise FileNotFoundError on some
            # platforms. The cache data (response.json) is written correctly
            # before this point, so the error is safe to suppress.
            pass
    else:
        context.al.cache.discard()

    print(f"\n[stats] {context.al.stats}")
    context.al.quit()


def after_all(context):
    context._browser.close()
    context._pw.stop()
