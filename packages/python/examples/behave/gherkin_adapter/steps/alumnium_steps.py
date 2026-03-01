import sys
from pathlib import Path

# Ensure adapter.py (in the same directory) is importable regardless of how
# behave resolves sys.path when loading step files from a standalone invocation.
sys.path.insert(0, str(Path(__file__).parent))

from adapter import GherkinStep  # noqa: E402
from behave import given, step, then, use_step_matcher, when  # noqa: E402

use_step_matcher("re")

_MATCH_ALL = r"(?P<text>.+)"


def _step_args(context):
    """Extract doc string and data table from the current behave step context."""
    doc_string = context.text
    data_table = [[str(cell) for cell in row] for row in context.table] if context.table else None
    return doc_string, data_table


@given(_MATCH_ALL)
def step_given(context, text):
    doc, table = _step_args(context)
    context.adapter.dispatch(GherkinStep("Given", text, doc_string=doc, data_table=table))


@when(_MATCH_ALL)
def step_when(context, text):
    doc, table = _step_args(context)
    context.adapter.dispatch(GherkinStep("When", text, doc_string=doc, data_table=table))


@then(_MATCH_ALL)
def step_then(context, text):
    doc, table = _step_args(context)
    context.adapter.dispatch(GherkinStep("Then", text, doc_string=doc, data_table=table))


@step(_MATCH_ALL)
def step_star(context, text):
    """Catch-all for the * (asterisk) keyword — inherits the preceding primary keyword."""
    doc, table = _step_args(context)
    context.adapter.dispatch(GherkinStep("*", text, doc_string=doc, data_table=table))
