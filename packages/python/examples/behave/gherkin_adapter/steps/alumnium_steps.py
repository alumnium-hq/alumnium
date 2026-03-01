from adapter import AlumniumGherkinAdapter, GherkinStep  # noqa: F401 (imported for re-export)
from behave import given, step, then, use_step_matcher, when

use_step_matcher("re")

_NAVIGATE = r'navigate to "(?P<url>[^"]+)"'
_MATCH_ALL = r"(?P<text>.+)"


def _step_args(context):
    """Extract doc string and data table from the current behave step context."""
    doc_string = context.text
    data_table = [[str(cell) for cell in row] for row in context.table] if context.table else None
    return doc_string, data_table


@given(_NAVIGATE)
def step_given_navigate(context, url):
    """Navigate directly via Playwright.

    PlaywrightDriver.supported_tools does not include NavigateToUrlTool, so
    navigation must bypass the LLM and call page.goto() directly.
    """
    context.al.driver.page.goto(url, wait_until="networkidle")


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
