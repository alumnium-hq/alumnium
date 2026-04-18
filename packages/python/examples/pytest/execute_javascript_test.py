import pytest

from alumnium import Provider
from alumnium.tools import ExecuteJavascriptTool


def test_execute_javascript_to_scroll(al_factory, navigate):
    al = al_factory(extra_tools=[ExecuteJavascriptTool])
    model_provider = al.model.provider
    if model_provider == Provider.DEEPSEEK:
        pytest.xfail("No vision support yet")
    if model_provider == Provider.XAI:
        pytest.xfail(
            "Requires separate check agent as it prefers to follow "
            "retriever instructions (return `value` instead of `statement`)"
        )

    navigate("https://the-internet.herokuapp.com/large")
    al.check("'Powered by Elemental Selenium' is not present", vision=True)
    al.do("execute javascript 'window.scrollTo(0, document.body.scrollHeight)'")
    al.check("'Powered by Elemental Selenium' is present", vision=True)
